import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { MAPS, mapById, genCubes, spawnPoint } from './maps.js';
import { generateItem } from './ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);

const TICK_MS = 50;
const MAX_CUBES = 300;
const ROUND_SECONDS = 300;
const CUBE_RESPAWN_MS = 7000;

// Game modes with different rules
const GAME_MODES = {
  classic: {
    name: 'Klasik',
    roundSeconds: 300,
    maxPlayers: 8,
    minPlayers: 2,
    cubeLimitPerPlayer: 150,  // max cubes per player
    description: 'Standart kurallar, 5 dakika tur, 8 oyuncu'
  },
  survival: {
    name: 'Survival',
    roundSeconds: 600,
    maxPlayers: 6,
    minPlayers: 2,
    cubeLimitPerPlayer: 200,
    description: 'Daha uzun tur, daha az oyuncu, daha fazla küp'
  },
  team: {
    name: 'Takım',
    roundSeconds: 360,
    maxPlayers: 8,
    minPlayers: 4,
    cubeLimitPerPlayer: 100,
    description: '4vs4 takım oyunu, paylaşımlı kubeler'
  },
  battleroyale: {
    name: 'Battle Royale',
    roundSeconds: 180,
    maxPlayers: 10,
    minPlayers: 2,
    cubeLimitPerPlayer: 50,
    description: 'Kısa tur, son remaining kazanır'
  }
};

const app = express();
app.disable('x-powered-by');
// Mobil tarayıcıları desteklemek için ekstra ayarlar
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  // Cleartext uyarılarını toleranse - mobil tarayıcılar için
  if (req.headers['cf-visitor']?.includes('http') || req.header('x-forwarded-proto') === 'http') {
    res.header('Cross-Origin-Opener-Policy', 'same-origin');
    res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  }
  next();
});
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three/build')));

app.get('/favicon.ico', (_req, res) => res.status(204).end());

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// ---------------------------------------------------------------- yardımcılar
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (rooms.has(code));
  return code;
}

let nextPlayerId = 1;
let nextEntityId = 1;

const rooms = new Map();

function createRoom(selectedMode = 'classic') {
  const mode = GAME_MODES[selectedMode] || GAME_MODES.classic;
  const code = newCode();
  const room = {
    code,
    players: new Map(),
    hostId: null,
    phase: 'lobby',
    mapId: MAPS[0].id,
    cubes: [],
    projectiles: [],
    timeLeft: mode.roundSeconds,
    endsAt: 0,
    endedAt: 0,
    results: null,
    mode: selectedMode
  };
  rooms.set(code, room);
  return room;
}

function roomInfo(room) {
  const map = mapById(room.mapId);
  const mode = GAME_MODES[room.mode] || GAME_MODES.classic;
  return {
    t: 'room',
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    mapId: room.mapId,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isHost: p.id === room.hostId
    })),
    maps: MAPS.map((m) => ({
      id: m.id,
      name: m.name,
      tag: m.tag,
      radius: m.radius,
      theme: m.theme,
      gravity: m.gravity
    })),
    timeLeft: Math.max(0, Math.round(room.phase === 'playing' ? (room.endsAt - Date.now()) / 1000 : mode.roundSeconds)),
    results: room.results,
    mode: {
      id: room.mode,
      name: mode.name,
      minPlayers: mode.minPlayers,
      maxPlayers: mode.maxPlayers,
      description: mode.description
    }
  };
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, exceptId = null) {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.id === exceptId) continue;
    if (p.ws.readyState === 1) p.ws.send(data);
  }
}

function emit(room, evt) {
  broadcast(room, { t: 'event', ...evt });
}

function syncRoom(room) {
  broadcast(room, roomInfo(room));
}

// ---------------------------------------------------------------- oyuncular
function makePlayer(id, ws, name, color) {
  return {
    id,
    ws,
    name,
    color,
    pos: { x: 0, y: 0, z: 0 },
    yaw: 0,
    speed: 0,
    hp: 100,
    cubes: 0,
    alive: true,
    respawnAt: 0,
    items: [],
    active: 0,
    cool: {},
    building: null,
    companionSpec: null,
    companion: null,
    kills: 0,
    deaths: 0,
    lastDamage: 0,
    lastCraft: 0
  };
}

function placePlayers(room) {
  const list = [...room.players.values()];
  const map = mapById(room.mapId);
  list.forEach((p, i) => {
    const sp = spawnPoint(map, i, list.length);
    p.pos = { x: sp.x, y: 0, z: sp.z };
    p.hp = 100;
    p.alive = true;
    p.cubes = 0;
    p.items = [];
    p.active = 0;
    p.cool = {};
    p.building = null;
    p.companion = null;
    p.companionSpec = null;
    p.kills = 0;
    p.deaths = 0;
    p.lastDamage = 0;
  });
}

function startRound(room) {
  const map = mapById(room.mapId);
  const mode = GAME_MODES[room.mode] || GAME_MODES.classic;
  room.phase = 'playing';
  room.timeLeft = mode.roundSeconds;
  room.endsAt = Date.now() + mode.roundSeconds * 1000;
  room.projectiles = [];
  room.results = null;
  room.cubes = genCubes(map).map((c) => ({ ...c, active: true, backAt: 0 }));
  placePlayers(room);
  broadcast(room, { t: 'map', map: publicMap(map), cubes: room.cubes });
  for (const p of room.players.values()) {
    send(p.ws, { t: 'spawn', pos: [p.pos.x, p.pos.y, p.pos.z] });
  }
  emit(room, { kind: 'announce', text: 'SAVAŞ BAŞLADI · küpleri topla, icat et, kazan!' });
  syncRoom(room);
}

function publicMap(map) {
  return {
    id: map.id,
    name: map.name,
    tag: map.tag,
    radius: map.radius,
    gravity: map.gravity,
    theme: map.theme,
    obstacles: map.obstacles
  };
}

function endRound(room) {
  room.phase = 'ended';
  room.endedAt = Date.now();
  const results = [...room.players.values()]
    .map((p) => ({ id: p.id, name: p.name, color: p.color, kills: p.kills, deaths: p.deaths, cubes: p.cubes }))
    .sort((a, b) => b.kills - a.kills || b.cubes - a.cubes);
  room.results = results;
  room.building = null;
  broadcast(room, { t: 'roundEnd', results });
  syncRoom(room);
}

function backToLobby(room) {
  room.phase = 'lobby';
  room.projectiles = [];
  room.cubes = [];
  room.results = null;
  for (const p of room.players.values()) {
    p.hp = 100;
    p.alive = true;
    p.cubes = 0;
    p.items = [];
    p.building = null;
    p.companion = null;
    p.companionSpec = null;
  }
  syncRoom(room);
}

// ---------------------------------------------------------------- savaş
function spawnProjectile(room, owner, origin, dir, spec, opts = {}) {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const speed = spec.stats.speed;
  const p = {
    id: nextEntityId++,
    owner: owner.id,
    x: origin.x,
    y: origin.y,
    z: origin.z,
    vx: (dir.x / len) * speed,
    vy: (dir.y / len) * speed,
    vz: (dir.z / len) * speed,
    dmg: spec.stats.damage,
    splash: spec.stats.splash || 0,
    gravity: spec.category === 'explosive' || spec.category === 'super' ? -9 : -1.2,
    ttl: opts.ttl || 3.2,
    kind: spec.behavior === 'companion' ? 'companion' : spec.category === 'explosive' || spec.category === 'super' ? 'rocket' : spec.category === 'energy' ? 'bolt' : 'bullet',
    color: spec.palette[1],
    fromCompanion: !!opts.fromCompanion
  };
  room.projectiles.push(p);
  if (room.projectiles.length > 120) room.projectiles.shift();
  emit(room, { kind: 'shoot', x: origin.x, y: origin.y, z: origin.z, color: p.color, by: owner.id, fromCompanion: !!opts.fromCompanion }); // Weapon tracers for visual effect
if (owner.id === app.myId) {
  setTimeout(() => {
    world.muzzleFlash(origin.x, origin.y, origin.z, p.color || 0xffcf5c);
  }, 50);
}
  return p;
}

function damage(room, victim, amount, attacker) {
  if (!victim.alive) return;
  victim.hp -= amount;
  victim.lastDamage = Date.now();
  // Respawn timer
  victim.respawnTime = Date.now() + 3000;
  emit(room, { kind: "death", id: victim.id, x: victim.pos.x, y: victim.pos.y + 1.2, z: victim.pos.z, dmg: Math.round(amount), by: attacker?.id ?? null, respawnIn: 3 });
  emit(room, { kind: 'hit', id: victim.id, x: victim.pos.x, y: victim.pos.y + 1.2, z: victim.pos.z, dmg: Math.round(amount), by: attacker?.id ?? null });
  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    victim.deaths += 1;
    victim.respawnAt = Date.now() + 3000;
    victim.building = null;
    victim.companion = null;
    if (attacker && attacker !== victim) {
      attacker.kills += 1;
      attacker.cubes = Math.min(MAX_CUBES, attacker.cubes + 15);
    }
    emit(room, {
      kind: 'kill',
      killer: attacker ? attacker.name : 'Arena',
      killerId: attacker ? attacker.id : null,
      victim: victim.name,
      victimId: victim.id
    });
  }
}

function explodeAt(room, x, y, z, radius, attacker, damageValue) {
  emit(room, { kind: 'boom', x, y, z, radius, color: 0xffb347 });
  // Scatter nearby cubes
  for (const cube of room.cubes) {
    if (!cube.active) continue;
    const d = Math.hypot(cube.x - x, cube.z - z);
    if (d <= radius && d > 0.5) {
      // Push cube away from explosion center
      const pushForce = (radius - d) / radius; // 0 to 1
      const nx = (cube.x - x) / d;
      const nz = (cube.z - z) / d;
      cube.vx = nx * pushForce * 5;
      cube.vz = nz * pushForce * 5;
      cube.fallAt = Date.now() + 500; // Reset after 0.5 seconds
      cube.active = false; // Will respawn
    }
  }
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    const d = Math.hypot(p.pos.x - x, p.pos.z - z, p.pos.y + 1 - y);
    if (d <= radius) {
      const falloff = 1 - Math.min(1, d / radius) * 0.55;
      damage(room, p, damageValue * falloff, attacker);
    }
  }
}

function tickProjectiles(room, dt) {
  const keep = [];
  for (const pr of room.projectiles) {
    pr.vy += pr.gravity * dt;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.z += pr.vz * dt;
    pr.ttl -= dt;

    let dead = false;
    let hit = null;

    for (const p of room.players.values()) {
      if (!p.alive || p.id === pr.owner) continue;
      const dx = p.pos.x - pr.x;
      const dy = p.pos.y + 1 - pr.y;
      const dz = p.pos.z - pr.z;
      if (dx * dx + dy * dy + dz * dz < 1.25) {
        hit = p;
        break;
      }
    }

    if (hit) {
      const attacker = room.players.get(pr.owner) || null;
      if (pr.splash > 0) explodeAt(room, pr.x, pr.y, pr.z, pr.splash, attacker, pr.dmg);
      else damage(room, hit, pr.dmg, attacker);
      dead = true;
    } else if (pr.y <= 0.12) {
      const attacker = room.players.get(pr.owner) || null;
      if (pr.splash > 0) explodeAt(room, pr.x, 0.2, pr.z, pr.splash, attacker, pr.dmg);
      dead = true;
    } else if (pr.ttl <= 0 || Math.abs(pr.x) > (mapById(room.mapId).radius || 150) * 2 || Math.abs(pr.z) > (mapById(room.mapId).radius || 150) * 2) {
      dead = true;
    }

    if (!dead) keep.push(pr);
  }
  room.projectiles = keep;
}

function tickCompanions(room, dt, now) {
  for (const p of room.players.values()) {
    if (!p.alive || !p.companionSpec) {
      p.companion = null;
      continue;
    }
    if (!p.companion) p.companion = { angle: Math.random() * Math.PI * 2, x: p.pos.x, y: p.pos.y + 1.7, z: p.pos.z, lastFire: 0 };

    const spec = p.companionSpec;
    const c = p.companion;
    c.angle += dt * 1.1;
    const targetX = p.pos.x + Math.cos(c.angle) * 2.3;
    const targetZ = p.pos.z + Math.sin(c.angle) * 2.3;
    const targetY = p.pos.y + 1.9 + Math.sin(now / 500) * 0.18;
    const k = Math.min(1, dt * 4.5);
    c.x += (targetX - c.x) * k;
    c.y += (targetY - c.y) * k;
    c.z += (targetZ - c.z) * k;

    const cooldown = spec.stats.cooldown * 1000;
    if (now - c.lastFire < cooldown) continue;

    let best = null;
    let bestD = Infinity;
    for (const other of room.players.values()) {
      if (!other.alive || other.id === p.id) continue;
      const d = Math.hypot(other.pos.x - c.x, other.pos.z - c.z);
      if (d < spec.stats.range && d < bestD) {
        best = other;
        bestD = d;
      }
    }
    if (best) {
      c.lastFire = now;
      const dir = { x: best.pos.x - c.x, y: best.pos.y + 1 - c.y, z: best.pos.z - c.z };
      spawnProjectile(room, p, { x: c.x, y: c.y, z: c.z }, dir, spec, { fromCompanion: true, ttl: 2.4 });
    }
  }
}

function tick(room, dt) {
  const now = Date.now();

  if (room.phase === 'playing') {
    for (const p of room.players.values()) {
      if (!p.alive && now >= p.respawnAt) {
        const map = mapById(room.mapId);
        const sp = spawnPoint(map, Math.floor(Math.random() * 8), 8);
        p.pos = { x: sp.x, y: 0, z: sp.z };
        p.hp = 100;
        p.alive = true;
        p.lastDamage = now;
        emit(room, { kind: 'respawn', id: p.id, x: sp.x, z: sp.z });
        send(p.ws, { t: 'spawn', pos: [sp.x, 0, sp.z] });
      }
      if (p.alive && now - p.lastDamage > 7000 && p.hp < 100) {
        p.hp = Math.min(100, p.hp + 5 * dt);
      }
      if (p.building) {
        p.building.progress = Math.min(1, p.building.progress + dt / p.building.duration);
        if (p.building.progress >= 1) {
          const item = p.building.spec;
          p.building = null;
          p.items.push(item);
          if (p.items.length > 4) p.items.shift();
          p.active = p.items.length - 1;
          if (item.behavior === 'companion') {
            p.companionSpec = item;
            p.companion = { angle: Math.random() * 6.28, x: p.pos.x, y: p.pos.y + 1.9, z: p.pos.z, lastFire: 0 };
          }
          emit(room, { kind: 'craft', id: p.id, name: p.name, item: { label: item.label, palette: item.palette, behavior: item.behavior } });
        }
      }
    }

    for (const cube of room.cubes) {
      // Handle explosion-scattered cube velocity
      if (cube.vx !== undefined && cube.vz !== undefined) {
        const velocityDampening = 0.98; // Natural slowdown
        cube.x += cube.vx * dt;
        cube.z += cube.vz * dt;
        cube.vx *= velocityDampening;
        cube.vz *= velocityDampening;
        // Stop when velocity is very small
        if (Math.hypot(cube.vx, cube.vz) < 0.01) {
          cube.vx = undefined;
          cube.vz = undefined;
        }
      }
      if (!cube.active && now >= cube.backAt) {
        cube.active = true;
        emit(room, { kind: 'cubeBack', id: cube.id });
      }
    }

    tickProjectiles(room, dt);
    tickCompanions(room, dt, now);

    if (now >= room.endsAt) endRound(room);
  } else if (room.phase === 'ended' && now - room.endedAt > 8000) {
    backToLobby(room);
  }

  if (room.phase === 'playing' || room.phase === 'ended') {
    const now2 = Date.now();
    broadcast(room, {
      t: 'state',
      phase: room.phase,
      timeLeft: Math.max(0, Math.round((room.endsAt - now2) / 1000)),
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        pos: [round2(p.pos.x), round2(p.pos.y), round2(p.pos.z)],
        yaw: round2(p.yaw),
        speed: round2(p.speed),
        hp: Math.round(p.hp),
        cubes: p.cubes,
        alive: p.alive,
        building: p.building ? { label: p.building.spec.label, progress: round2(p.building.progress) } : null,
        items: p.items.map((i) => ({
          id: i.id,
          label: i.label,
          color: i.palette[0],
          glow: i.palette[1],
          behavior: i.behavior,
          category: i.category
        })),
        active: p.active,
        companion: p.companion
          ? { x: round2(p.companion.x), y: round2(p.companion.y), z: round2(p.companion.z), color: p.companionSpec.palette[0], glow: p.companionSpec.palette[1], label: p.companionSpec.label }
          : null,
        kills: p.kills,
        deaths: p.deaths
      })),
      projectiles: room.projectiles.map((pr) => ({
        id: pr.id,
        pos: [round2(pr.x), round2(pr.y), round2(pr.z)],
        kind: pr.kind,
        color: pr.color
      }))
    });
  }
}

const round2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- mesajlar
function handleMessage(room, player, msg) {
  switch (msg.t) {
    case 'motion': {
      const p = msg.pos;
      if (!Array.isArray(p) || p.length < 3) return;
      const lim = (mapById(room.mapId).radius || 150) - 1.5;
      player.pos.x = clamp(num(p[0]), -lim, lim);
      player.pos.y = clamp(num(p[1]), 0, 40);
      player.pos.z = clamp(num(p[2]), -lim, lim);
      player.yaw = num(msg.yaw);
      player.speed = clamp(num(msg.speed), 0, 20);
      return;
    }

    case 'collect': {
      if (room.phase !== 'playing' || !player.alive) return;
      const cube = room.cubes.find((c) => c.id === Number(msg.id));
      if (!cube || !cube.active) return;
      // Auto-collect if very close (within 2 units, no press needed)
      const veryClose = dist2(player.pos, cube) < 1;
      if (veryClose) {
        // Auto-collect: take all available immediately
        const room_ = MAX_CUBES - player.cubes;
        const amount = Math.min(cube.amount, room_);
        player.cubes += amount;
        cube.active = false;
        cube.backAt = Date.now() + CUBE_RESPAWN_MS + Math.random() * 4000;
        emit(room, { kind: 'cubeTaken', id: cube.id, by: player.id, amount });
        send(player.ws, { t: 'cubes', cubes: player.cubes, amount });
        return;
      }
      if (dist2(player.pos, cube) > 4) return;
      const room_ = MAX_CUBES - player.cubes;
      if (room_ <= 0) {
        send(player.ws, { t: 'notice', text: 'Küp çantan dolu (300). Önce bir şey inşa et.' });
        return;
      }
      // Hold to extend: if holding, collect progressively
      // Default single press: take min amount, holding speeds up
      const isHolding = msg.isHolding === true;
      // When holding: take smaller amounts over time (300 in 10 seconds = 30/sec)
      // When pressing: take full amount once
      let amount;
      const doubleCubes = player.powers && player.powers.doubleCubes ? 2 : 1;
      // When holding: take 30 cubes per second doubled if power-up active, capped by what's available
      if (isHolding) {
        const holdRate = 30 * doubleCubes; // cubes per second
        const dt = (Date.now() - (player.lastCollectHold || 0)) / 1000;
        amount = Math.min(cube.amount, room_, Math.ceil(holdRate * dt));
        player.lastCollectHold = Date.now();
      } else {
        // Single press: take the full amount of this cube batch
        amount = Math.min(cube.amount, room_);
        player.lastCollectHold = 0; // Reset hold timer
      }
      player.cubes += amount;
      cube.active = false;
      cube.backAt = Date.now() + CUBE_RESPAWN_MS + Math.random() * 4000;
      emit(room, { kind: 'cubeTaken', id: cube.id, by: player.id, amount });
      send(player.ws, { t: 'cubes', cubes: player.cubes, amount });
      return;
    }

    case 'craft': {
      if (room.phase !== 'playing') return;
      if (!player.alive) {
        send(player.ws, { t: 'craftResult', ok: false, reason: 'dead' });
        return;
      }
      // Raw text tam olarak geçir - herhangi trim/sil/censorship yok
      let text = String(msg.text || '');
      // Sadece boş satırı kontrol, trim yapma
      if (!text || text.replace(/\s/g, '').length === 0) return;
      const now = Date.now();
      if (now - player.lastCraft < 350) return;
      if (player.building) {
        send(player.ws, { t: 'craftResult', ok: false, reason: 'busy', spec: player.building.spec });
        return;
      }
      const spec = generateItem(text);
      if (player.cubes < spec.cost) {
        send(player.ws, { t: 'craftResult', ok: false, reason: 'cubes', spec, missing: spec.cost - player.cubes });
        return;
      }
      player.cubes -= spec.cost;
      player.building = { spec, duration: spec.duration, progress: 0 };
      send(player.ws, { t: 'craftResult', ok: true, spec, cubes: player.cubes });
      emit(room, { kind: 'buildStart', id: player.id, name: player.name, label: spec.label, cost: spec.cost, color: spec.palette[1] });
      return;
    }

    case 'fire': {
      if (room.phase !== 'playing' || !player.alive) return;
      const spec = player.items[player.active];
      if (!spec) return;
      const now = Date.now();
      const cd = (spec.stats.cooldown || 0.5) * 1000;
      if (now - (player.cool[spec.id] || 0) < cd) return;
      player.cool[spec.id] = now;

      const dir = msg.dir || {};
      const d = { x: num(dir.x), y: clamp(num(dir.y), -1, 1), z: num(dir.z) };
      const origin = {
        x: player.pos.x,
        y: player.pos.y + 1.15,
        z: player.pos.z
      };

      if (spec.behavior === 'support') {
        player.hp = Math.min(100, player.hp + (spec.stats.selfHeal || 40));
        emit(room, { kind: 'heal', id: player.id, x: player.pos.x, y: player.pos.y + 1, z: player.pos.z });
        return;
      }

      if (spec.behavior === 'melee') {
        const len = Math.hypot(d.x, d.z) || 1;
        const nx = d.x / len;
        const nz = d.z / len;
        emit(room, { kind: 'melee', x: player.pos.x, y: player.pos.y + 1, z: player.pos.z, color: spec.palette[1],
          dx: nx, dz: nz, by: player.id });
        for (const other of room.players.values()) {
          if (!other.alive || other.id === player.id) continue;
          const dx = other.pos.x - player.pos.x;
          const dz = other.pos.z - player.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 3.4) continue;
          const dot = (dx / (dist || 1)) * nx + (dz / (dist || 1)) * nz;
          if (dot < 0.25) continue;
          damage(room, other, spec.stats.damage, player);
        }
        return;
      }

      if (spec.behavior === 'companion') {
        const c = player.companion;
        if (!c) return;
        const target = { x: player.pos.x + d.x * 10, y: player.pos.y + 1.2, z: player.pos.z + d.z * 10 };
        spawnProjectile(room, player, { x: c.x, y: c.y, z: c.z },
          { x: target.x - c.x, y: target.y - c.y, z: target.z - c.z }, spec, { fromCompanion: true });
        return;
      }

      if (!Math.hypot(d.x, d.z)) return;
      spawnProjectile(room, player, origin, d, spec);
      return;
    }

    case 'switch': {
      const idx = Math.floor(num(msg.index, 0));
      if (idx >= 0 && idx < player.items.length) {
        player.active = idx;
        send(player.ws, { t: 'active', index: idx });
      }
      return;
    }

    case 'selectMap': {
      if (player.id !== room.hostId || room.phase !== 'lobby') return;
      const map = MAPS.find((m) => m.id === msg.mapId);
      if (!map) return;
      room.mapId = map.id;
      syncRoom(room);
      return;
    }

    case 'start': {
      if (player.id !== room.hostId || room.phase !== 'lobby') return;
      startRound(room);
      return;
    }

    case 'say': {
      if (!player.alive) return;
      const text = String(msg.text || '').slice(0, 100).trim();
      if (!text) return;
      emit(room, { kind: 'announce', text: `${player.name} · ${text}` });
      return;
    }

    case 'emote': {
      if (!player.alive) return;
      const text = String(msg.text || '').slice(0, 30).trim();
      if (!text) return;
      emit(room, { kind: 'emote', text: `${player.name} · ${text}` });
      return;
    }

    case 'respawn': {
      if (room.phase !== 'playing' || !player.alive) return;
      player.alive = false;
      player.respawnAt = Date.now() + 5000;
      emit(room, { kind: 'playerState', id: player.id, alive: player.alive, hp: player.hp });
      send(player.ws, { t: 'respawnMessage', text: '5 saniye sonra tekrar doğarsın.' });
      return;
    }

    case 'backToLobby': {
      if (player.id !== room.hostId || room.phase !== 'ended') return;
      backToLobby(room);
      return;
    }

    default:
      return;
  }
}

// ---------------------------------------------------------------- bağlantılar
wss.on('connection', (ws) => {
  let room = null;
  let player = null;

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'join') {
      if (player) return;
      const name = String(msg.name || 'Oyuncu').replace(/[<>&"]/g, '').slice(0, 14).trim() || 'Oyuncu';
      const color = /^#[0-9a-f]{6}$/i.test(String(msg.color || '')) ? msg.color : '#35d0ff';
      const wanted = String(msg.code || '').toUpperCase().trim();

      if (wanted) {
        const found = rooms.get(wanted);
        if (!found) {
          send(ws, { t: 'errorMsg', text: 'Böyle bir oda yok. Kodu kontrol et.' });
          return;
        }
        if (found.phase !== 'lobby') {
          send(ws, { t: 'errorMsg', text: 'Bu odada maç sürüyor. Biraz sonra tekrar dene.' });
          return;
        }
        if (found.players.size >= 8) {
          send(ws, { t: 'errorMsg', text: 'Oda dolu (8/8).' });
          return;
        }
        room = found;
      } else {
        room = createRoom();
      }

      player = makePlayer(nextPlayerId++, ws, name, color);
      const map = mapById(room.mapId);
      const sp = spawnPoint(map, room.players.size, 8);
      player.pos = { x: sp.x, y: 0, z: sp.z };
      room.players.set(player.id, player);
      if (!room.hostId) room.hostId = player.id;

      send(ws, { t: 'welcome', id: player.id, code: room.code, hostId: room.hostId, name: player.name, color: player.color });
      syncRoom(room);
      return;
    }

    if (!player || !room) return;
    if (msg.t === 'leave') {
      cleanup();
      ws.close();
      return;
    }
    try {
      handleMessage(room, player, msg);
    } catch (err) {
      console.error('mesaj hatası', err);
    }
  });

  function cleanup() {
    if (!room || !player) return;
    room.players.delete(player.id);
    room.cubes; // no-op
    if (room.hostId === player.id) {
      room.hostId = room.players.size ? room.players.keys().next().value : null;
    }
    if (room.players.size === 0) {
      const dying = room;
      setTimeout(() => {
        if (rooms.get(dying.code) === dying && dying.players.size === 0) rooms.delete(dying.code);
      }, 60000);
    } else {
      if (room.phase === 'playing' && room.players.size === 1) {
        // tek kişi kaldıysa maç devam eder, süre bitince biter
      }
      syncRoom(room);
    }
    room = null;
    player = null;
  }

  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

const aliveInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* yoksay */
    }
  }
}, 30000);
aliveInterval.unref?.();

const gameLoop = setInterval(() => {
  const dt = TICK_MS / 1000;
  for (const room of rooms.values()) {
    try {
      tick(room, dt);
    } catch (err) {
      console.error('tick hatası', room.code, err);
    }
  }
}, TICK_MS);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CubeWar ${PORT} portunda çalışıyor → http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  clearInterval(gameLoop);
  server.close(() => process.exit(0));
});

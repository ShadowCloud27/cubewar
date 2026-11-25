import * as THREE from 'three';
import { createCharacter } from './character.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 320);
    this.camera.position.set(0, 6, 12);

    this.clock = new THREE.Clock();
    this.time = 0;

    this.mapGroup = null;
    this.obstacles = [];
    this.cubeMeshes = new Map();
    this.cubes = [];
    this.radius = 26;
    this.gravity = -24;

    this.remotes = new Map();
    this.companions = new Map();
    this.projectiles = new Map();
    this.fx = [];
    this.shake = 0;

    this.me = null;
    this.myId = null;
    this.camYaw = 0;
    this.camPitch = 0.22;

    this.local = {
      pos: new THREE.Vector3(0, 0, 8),
      vel: new THREE.Vector3(),
      yaw: 0,
      grounded: true,
      speed: 0,
      alive: true,
      building: false,
      hp: 100
    };

    this.tmp = new THREE.Vector3();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ harita
  clearMap() {
    if (!this.mapGroup) return;
    this.scene.remove(this.mapGroup);
    this.mapGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose?.();
        }
      }
    });
    this.mapGroup = null;
    this.cubeMeshes.clear();
    this.cubes = [];
    this.obstacles = [];
    for (const [, c] of this.companions) {
      c.mesh.parent?.remove(c.mesh);
    }
    this.companions.clear();
    for (const [, p] of this.projectiles) {
      p.mesh.parent?.remove(p.mesh);
    }
    this.projectiles.clear();
    for (const f of this.fx) f.mesh?.parent?.remove(f.mesh);
    this.fx.length = 0;
  }

  showMenuBackdrop() {
    if (this.menuGroup) return;
    const g = new THREE.Group();
    this.menuGroup = g;
    this.scene.background = new THREE.Color(0x05080f);
    this.scene.fog = new THREE.Fog(0x05080f, 14, 46);
    const hemi = new THREE.HemisphereLight(0x9fd8ff, 0x0a1020, 1.2);
    hemi.userData.mapLight = true;
    const key = new THREE.PointLight(0x35d0ff, 60, 50);
    key.position.set(4, 6, 6);
    key.userData.mapLight = true;
    const key2 = new THREE.PointLight(0xff4d8d, 40, 40);
    key2.position.set(-5, 3, -4);
    key2.userData.mapLight = true;
    this.scene.add(hemi, key, key2);

    const shapes = [
      { size: 1.5, x: -2.6, y: 1.6, z: -1.2, c: 0x35d0ff },
      { size: 1, x: 2.4, y: 0.9, z: -0.6, c: 0xff4d8d },
      { size: 0.7, x: 0.6, y: 2.6, z: -2.4, c: 0xffcf5c },
      { size: 0.5, x: -1.2, y: 2.9, z: 0.6, c: 0x6ee7a8 },
      { size: 0.9, x: 3.3, y: 2.4, z: -3.2, c: 0x7b5cff }
    ];
    for (const s of shapes) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(s.size, s.size, s.size),
        new THREE.MeshStandardMaterial({
          color: s.c,
          emissive: s.c,
          emissiveIntensity: 0.55,
          roughness: 0.35,
          metalness: 0.4
        })
      );
      m.position.set(s.x, s.y, s.z);
      m.userData.menuFloat = Math.random() * 6;
      g.add(m);
    }
    this.scene.add(g);
    this.menuTime = 0;
  }

  updateMenu(dt) {
    if (!this.menuGroup) return;
    this.menuTime = (this.menuTime || 0) + dt;
    for (const m of this.menuGroup.children) {
      if (m.userData.menuFloat === undefined) continue;
      m.rotation.x += dt * 0.35;
      m.rotation.y += dt * 0.5;
      m.position.y += Math.sin(this.menuTime * 1.3 + m.userData.menuFloat) * dt * 0.35;
    }
    this.camera.position.set(Math.sin(this.menuTime * 0.15) * 1.2, 3.1, 7.4);
    this.camera.lookAt(0, 1.6, 0);
    this.renderer.render(this.scene, this.camera);
  }

  hideMenuBackdrop() {
    if (!this.menuGroup) return;
    this.scene.remove(this.menuGroup);
    this.menuGroup.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
    this.menuGroup = null;
  }

  buildMap(map, cubes) {
    this.hideMenuBackdrop();
    this.clearMap();
    this.map = map;
    this.radius = map.radius;
    this.gravity = map.gravity ?? -24;
    const t = map.theme;

    this.scene.background = new THREE.Color(t.sky);
    // Enhanced sky gradient
    if (t.name === 'dune') {
      this.scene.background = new THREE.Color(0x1a0e00);
    } else if (t.name === 'ice') {
      this.scene.background = new THREE.Color(0x0a1525).setHSL(0.55, 0.2, 0.9);
    } else {
      this.scene.background = new THREE.Color(t.sky).setHSL(0.55, 0.15, 0.92);
    }
    // Expansive fog with gentle falloff
    this.scene.fog = new THREE.FogExp2(t.fog || 0x4a6d88, 0.012);
    // Add distant starfield for non-urban themes (except dune)
    if (t.name !== 'dune') {
      const starCount = 320;
      const starGeo = new THREE.BufferGeometry();
      const starPos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 60 + Math.random() * 50;
        starPos[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
        starPos[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * r;
        starPos[i * 3 + 2] = Math.cos(phi) * r;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({
        color: 0xbfe4ff,
        size: 0.5,
        transparent: true,
        opacity: 0.65,
        sizeAttenuation: true
      });
      const stars = new THREE.Points(starGeo, starMat);
      stars.userData.slowSpin = 0.001;
      this.scene.add(stars);
    }

    const g = new THREE.Group();
    this.mapGroup = g;
    this.scene.add(g);

    this.scene.children
      .filter((c) => c.isLight && c.userData.mapLight)
      .forEach((l) => this.scene.remove(l));

    const hemi = new THREE.HemisphereLight(t.light, t.ground, 1.25);
    hemi.userData.mapLight = true;
    const dir = new THREE.DirectionalLight(0xffffff, 2.0);
    dir.position.set(9, 20, 7);
    dir.userData.mapLight = true;
    const rim = new THREE.PointLight(t.accent, 90, map.radius * 3);
    rim.position.set(0, 13, 0);
    rim.userData.mapLight = true;
    const warm = new THREE.PointLight(t.accent2, 55, map.radius * 2.4);
    warm.position.set(map.radius * 0.5, 6, -map.radius * 0.4);
    warm.userData.mapLight = true;
    this.scene.add(hemi, dir, rim, warm);

    // zemin
    const groundGeo = new THREE.CircleGeometry(map.radius, 128);
    groundGeo.rotateX(-Math.PI / 2);
    // Ground with subtle grid pattern
    const gridColor = new THREE.Color(t.ground).offsetHSL(0, 0.02, -0.02);
    const gridMat = new THREE.MeshStandardMaterial({
      color: gridColor,
      roughness: 0.88,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeo, gridMat);
    ground.receiveShadow = true;
    g.add(ground);
    // Subtle concentric grid lines
    const gridLineMat = new THREE.LineBasicMaterial({ color: gridColor.offsetHSL(0, 0, -0.1), transparent: true, opacity: 0.12 });
    for (let i = 0; i < map.radius; i += 16) {
      const lineGeo = new THREE.BufferGeometry();
      const linePos = new Float32Array([-map.radius, 0, i, map.radius, 0, i, i, 0, -map.radius, -map.radius, 0, -map.radius]);
      lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
      const gl = new THREE.Line(lineGeo, gridLineMat);
      g.add(gl);
    }
    for (let i = 0; i < map.radius; i += 16) {
      const lineGeo = new THREE.BufferGeometry();
      const linePos = new Float32Array([i, 0, -map.radius, i, 0, map.radius, -i, 0, map.radius, -i, 0, -map.radius]);
      lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
      const gl = new THREE.Line(lineGeo, gridLineMat);
      g.add(gl);
    }

    // halkalar
    for (let i = 1; i <= 4; i++) {
      const r = (map.radius / 4.4) * i + 1.5;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.055, r + 0.055, 96),
        new THREE.MeshBasicMaterial({
          color: t.accent,
          transparent: true,
          opacity: 0.22 - i * 0.03,
          side: THREE.DoubleSide
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.012;
      g.add(ring);
    }

    // kenar duvarı
    const rimWall = new THREE.Mesh(
      new THREE.CylinderGeometry(map.radius, map.radius, 1.6, 96, 1, true),
      new THREE.MeshBasicMaterial({
        color: t.accent,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide
      })
    );
    rimWall.position.y = 0.8;
    g.add(rimWall);

    const glowRing = new THREE.Mesh(
      new THREE.TorusGeometry(map.radius, 0.16, 8, 96),
      new THREE.MeshStandardMaterial({
        color: t.accent,
        emissive: t.accent,
        emissiveIntensity: 1.6,
        roughness: 0.4
      })
    );
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 0.4;
    g.add(glowRing);

    // engeller
    const boxMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(t.groundEdge).offsetHSL(0, 0.05, 0.1),
      emissive: new THREE.Color(t.accent).multiplyScalar(0.06),
      roughness: 0.72,
      metalness: 0.3
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: t.accent, transparent: true, opacity: 0.55 });
    for (const o of map.obstacles) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), boxMat);
      mesh.position.set(o.x, o.h / 2, o.z);
      g.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat);
      edges.position.copy(mesh.position);
      g.add(edges);
      this.obstacles.push({ x: o.x, y: 0, z: o.z, w: o.w, h: o.h, d: o.d });
    }

    this.addDecor(map, g);
    this.addStars(map, g);

    // küpler
    const cubeGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    // küp rengine göre değişen gleçli/material kombinasyonu
    const cubeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(c.id * 0.1 % 1, 0.8, 0.5 + (c.id % 2) * 0.1),
      emissive: new THREE.Color(0xffa41f).multiplyScalar(0.5),
      emissiveIntensity: 0.75,
      roughness: 0.35 + (c.id % 3) * 0.05,
      metalness: 0.35 - (c.id % 3) * 0.05
    });
    for (const c of cubes) {
      const mesh = new THREE.Mesh(cubeGeo, cubeMat);
      mesh.position.set(c.x, 0.62, c.z);
      mesh.rotation.set(0.2, c.id * 0.7, 0.1);
      mesh.userData.baseY = 0.62;
      mesh.userData.phase = c.id * 1.7;
      mesh.userData.floatPhase = Math.random() * Math.PI * 2;
      // küp üzerinde gleç gradyanı için vertex colors
      const verts = mesh.geometry.attributes.position;
      for (let i = 0; i < verts.count; i++) {
        const y = verts.getY(i);
        verts.setY(i, y * 0.8); // gleci yukarı doğru çek
      }
      verts.needsUpdate = true;
      g.add(mesh);
      this.cubeMeshes.set(c.id, mesh);
    }
    this.cubes = cubes;

    // yerel karakteri haritaya taşı
    if (this.local) {
      this.local.pos.set(0, 0, 8);
      this.local.vel.set(0, 0, 0);
      this.local.grounded = true;
    }
  }

  addDecor(map, g) {
    const t = map.theme;
    const deco = t.deco;
    const rnd = mulberry32(map.id === 'dune' ? 7 : map.id === 'ice' ? 21 : 3);

    if (deco === 'neon') {
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(9 + i * 4.5, 0.07, 6, 64),
          new THREE.MeshStandardMaterial({
            color: i === 1 ? t.accent2 : t.accent,
            emissive: i === 1 ? t.accent2 : t.accent,
            emissiveIntensity: 1.4,
            transparent: true,
            opacity: 0.7
          })
        );
        ring.rotation.x = Math.PI / 2.2;
        ring.position.y = 9 + i * 2.2;
        ring.userData.spin = 0.05 + i * 0.03;
        g.add(ring);
      }
      for (let i = 0; i < 26; i++) {
        const h = 2 + rnd() * 8;
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, h, 0.18),
          new THREE.MeshStandardMaterial({
            color: t.accent,
            emissive: t.accent,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.28
          })
        );
        const a = rnd() * Math.PI * 2;
        const r = map.radius * (0.82 + rnd() * 0.16);
        pillar.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
        g.add(pillar);
      }
    }

    if (deco === 'dune') {
      for (let i = 0; i < 22; i++) {
        const h = 1.2 + rnd() * 4;
        const rock = new THREE.Mesh(
          new THREE.ConeGeometry(0.8 + rnd() * 2.4, h, 6),
          new THREE.MeshStandardMaterial({
            color: i % 3 === 0 ? t.groundEdge : t.ground,
            roughness: 1,
            flatShading: true
          })
        );
        const a = rnd() * Math.PI * 2;
        const r = map.radius * (0.88 + rnd() * 0.16);
        rock.position.set(Math.cos(a) * r, h / 2 - 0.2, Math.sin(a) * r);
        rock.rotation.y = rnd() * 6;
        g.add(rock);
      }
      const sun = new THREE.Mesh(
        new THREE.CircleGeometry(7, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.85 })
      );
      sun.position.set(-24, 20, -40);
      sun.lookAt(0, 2, 0);
      sun.userData.spin = 0;
      g.add(sun);
    }

    if (deco === 'ice') {
      for (let i = 0; i < 18; i++) {
        const h = 2 + rnd() * 6;
        const crystal = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.5 + rnd() * 0.9, 0),
          new THREE.MeshStandardMaterial({
            color: t.accent,
            emissive: t.accent,
            emissiveIntensity: 0.55,
            transparent: true,
            opacity: 0.55,
            roughness: 0.15,
            metalness: 0.4
          })
        );
        const a = rnd() * Math.PI * 2;
        const r = map.radius * (0.6 + rnd() * 0.4);
        crystal.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
        crystal.scale.y = 1.7;
        crystal.rotation.y = rnd() * 6;
        g.add(crystal);
        this.obstacles.push({ x: crystal.position.x, y: 0, z: crystal.position.z, w: 0.9, h: h * 0.6, d: 0.9 });
      }
      const snowGeo = new THREE.BufferGeometry();
      const count = 500;
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (rnd() - 0.5) * map.radius * 2;
        pos[i * 3 + 1] = rnd() * 22;
        pos[i * 3 + 2] = (rnd() - 0.5) * map.radius * 2;
      }
      snowGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const snow = new THREE.Points(
        snowGeo,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.7, sizeAttenuation: true })
      );
      snow.userData.snow = true;
      g.add(snow);
    }
  }

  addStars(map, g) {
    const rnd = mulberry32(99);
    const geo = new THREE.BufferGeometry();
    const count = 320;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 60 + rnd() * 80;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 10 + rnd() * 70;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xbfe4ff,
        size: 0.5,
        transparent: true,
        opacity: 0.6,
        sizeAttenuation: true,
        fog: false
      })
    );
    g.add(stars);
  }

  // ------------------------------------------------------------ oyuncular
  setLocalPlayer(id, name, color) {
    this.myId = id;
    if (!this.me) {
      this.me = createCharacter({ color, name });
      this.scene.add(this.me.group);
    } else {
      this.me.setColor(color);
      this.me.setName(name);
    }
    this.me.group.visible = true;
    this.local.hp = 100;
    this.local.alive = true;
  }

  setMyColor(color) {
    this.me?.setColor(color);
  }

  // Kamera bir sütunun/engelin içine girmesin: hedefle kamera arasını örnekle.
  cameraSafe(target, desired) {
    const dir = desired.clone().sub(target);
    let best = 1;
    for (let t = 0.18; t <= 1.0001; t += 0.04) {
      const x = target.x + dir.x * t;
      const y = target.y + dir.y * t;
      const z = target.z + dir.z * t;
      if (this.pointBlocked(x, y, z)) {
        best = Math.max(0.22, t - 0.07);
        break;
      }
    }
    const pos = target.clone().addScaledVector(dir, best);
    pos.y = Math.max(pos.y, 1.1);
    return pos;
  }

  pointBlocked(x, y, z) {
    for (const o of this.obstacles) {
      if (Math.abs(x - o.x) < o.w / 2 + 0.35 && Math.abs(z - o.z) < o.d / 2 + 0.35) {
        if (y > o.y + 0.1 && y < o.y + o.h + 0.4) return true;
      }
    }
    return false;
  }

  setSpawn(pos) {
    if (!Array.isArray(pos)) return;
    this.local.pos.set(pos[0], Math.max(0, pos[1] || 0), pos[2]);
    this.local.vel.set(0, 0, 0);
    this.local.grounded = true;
    this.serverPos = [pos[0], pos[1] || 0, pos[2]];
    this.camYaw = Math.atan2(pos[0], pos[2]);
    this.camera.position.set(
      this.local.pos.x + Math.sin(this.camYaw) * 6.2,
      this.local.pos.y + 3.1,
      this.local.pos.z + Math.cos(this.camYaw) * 6.2
    );
  }

  // ------------------------------------------------------------ girdi
  setLook(dx, dy) {
    this.camYaw -= dx * 0.0055;
    this.camPitch = clamp(this.camPitch + dy * 0.004, -0.22, 0.92);
  }

  getAimDir() {
    const cp = Math.cos(this.camPitch);
    return new THREE.Vector3(
      -Math.sin(this.camYaw) * cp,
      -Math.sin(this.camPitch),
      -Math.cos(this.camYaw) * cp
    ).normalize();
  }

  getMotion() {
    return {
      pos: [this.local.pos.x, this.local.pos.y, this.local.pos.z],
      yaw: this.local.yaw,
      speed: this.local.speed
    };
  }

  // ------------------------------------------------------------ fizik
  updateLocal(dt, input) {
    const L = this.local;
    if (!L.alive) {
      L.vel.set(0, 0, 0);
      return;
    }
    const maxSpeed = input.sprint ? 9.2 : 6.2;
    let wx = input.wx;
    let wz = input.wz;
    const mag = Math.hypot(wx, wz);
    if (mag > 1) {
      wx /= mag;
      wz /= mag;
    }
    const accel = L.grounded ? 17 : 5.5;
    L.vel.x += (wx * maxSpeed - L.vel.x) * Math.min(1, dt * accel);
    L.vel.z += (wz * maxSpeed - L.vel.z) * Math.min(1, dt * accel);

    // velocity smoothing: natural decay when no input
    if (mag === 0) {
      const decay = dt * 4;
      L.vel.x *= Math.max(0, 1 - decay);
      L.vel.z *= Math.max(0, 1 - decay);
    }

    if (input.jump && L.grounded) {
      L.vel.y = 9.1;
      L.grounded = false;
    }

    L.vel.y += this.gravity * dt;
    L.vel.y = Math.max(-40, L.vel.y);

    L.pos.x += L.vel.x * dt;
    L.pos.z += L.vel.z * dt;
    this.collideHorizontal();

    const prevY = L.pos.y;
    L.pos.y += L.vel.y * dt;
    this.collideVertical(prevY);

    L.speed = Math.hypot(L.vel.x, L.vel.z);

    // damped oscillation: reduce angular jitter when near-zero speed
    if (L.speed > 0.6) {
      L.yaw = Math.atan2(L.vel.x, L.vel.z);
    } else {
      // smooth yaw towards camera direction with damping
      L.yaw = lerpAngle(L.yaw, this.camYaw + Math.PI, 1 - Math.exp(-dt * 8));
    }

    // istemci sunucudan çok uzaksa düzelt
    const s = this.serverPos;
    if (s) {
      const d = Math.hypot(s[0] - L.pos.x, s[2] - L.pos.z);
      if (d > 4) {
        L.pos.set(s[0], Math.max(0, s[1]), s[2]);
        L.vel.set(0, 0, 0);
        // doğuşta kamera arenanın merkezine baksın
        this.camYaw = Math.atan2(L.pos.x, L.pos.z);
        this.camera.position.set(
          L.pos.x + Math.sin(this.camYaw) * 6.2,
          L.pos.y + 3,
          L.pos.z + Math.cos(this.camYaw) * 6.2
        );
      }
    }
  }

  collideHorizontal() {
    const L = this.local;
    const r = 0.42;
    const feet = L.pos.y;
    const headY = L.pos.y + 1.75;
    for (const o of this.obstacles) {
      const top = o.y + o.h;
      if (headY < o.y || feet > top - 0.25) continue;
      const dx = L.pos.x - o.x;
      const dz = L.pos.z - o.z;
      const ox = o.w / 2 + r - Math.abs(dx);
      const oz = o.d / 2 + r - Math.abs(dz);
      if (ox <= 0 || oz <= 0) continue;
      if (ox < oz) L.pos.x += Math.sign(dx || 1) * ox;
      else L.pos.z += Math.sign(dz || 1) * oz;
    }
    const dist = Math.hypot(L.pos.x, L.pos.z);
    const lim = this.radius - 1.1;
    if (dist > lim) {
      L.pos.x = (L.pos.x / dist) * lim;
      L.pos.z = (L.pos.z / dist) * lim;
    }
  }

  collideVertical(prevY) {
    const L = this.local;
    const r = 0.36;
    let support = 0;
    for (const o of this.obstacles) {
      if (Math.abs(L.pos.x - o.x) > o.w / 2 + r) continue;
      if (Math.abs(L.pos.z - o.z) > o.d / 2 + r) continue;
      const top = o.y + o.h;
      if (L.vel.y <= 0.2 && prevY >= top - 0.06 && L.pos.y <= top + 0.05) {
        support = Math.max(support, top);
      }
    }
    if (L.pos.y <= support) {
      L.pos.y = support;
      L.vel.y = 0;
      L.grounded = true;
    } else if (L.pos.y <= 0) {
      L.pos.y = 0;
      L.vel.y = 0;
      L.grounded = true;
    } else {
      L.grounded = false;
    }
  }

  // ------------------------------------------------------------ çizim
  update(dt, { state, input } = {}) {
    this.time += dt;

    if (input) {
      this.local.building = !!state?.players?.find((p) => p.id === this.myId)?.building;
    }

    this.updateLocal(dt, input || { wx: 0, wz: 0, jump: false });

    // yerel karakter
    if (this.me) {
      const L = this.local;
      this.me.group.position.copy(L.pos);
      this.me.group.rotation.y = L.yaw;
      this.me.group.visible = L.alive;
      const moving = L.speed > 0.7;
      this.me.update(dt, {
        speed: L.speed,
        grounded: L.grounded,
        vy: L.vel.y,
        moving,
        aimYaw: L.yaw,
        building: L.building,
        hp: L.hp,
        alive: L.alive,
        camera: this.camera
      });
    }

    this.applyState(dt, state);

    // kamera
    const L = this.local;
    const target = this.tmp.set(L.pos.x, L.pos.y + 1.35, L.pos.z);
    const dist = 6.6;
    const cp = Math.cos(this.camPitch);
    const desired = new THREE.Vector3(
      target.x + Math.sin(this.camYaw) * cp * dist,
      target.y + Math.sin(this.camPitch) * dist + 0.55,
      target.z + Math.cos(this.camYaw) * cp * dist
    );
    const safe = this.cameraSafe(target, desired);
    const k = 1 - Math.exp(-dt * 14);
    this.camera.position.lerp(safe, k);

    if (this.shake > 0.001) {
      this.shake *= Math.pow(0.02, dt);
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.camera.position.z += (Math.random() - 0.5) * this.shake;
    }

    this.camera.lookAt(target.x, target.y + 0.1, target.z);

    // sahne dekoru animasyonu
    if (this.mapGroup) {
      this.mapGroup.traverse((o) => {
        if (o.userData.spin) o.rotation.z += o.userData.spin * dt;
        if (o.userData.snow) {
          o.rotation.y += dt * 0.02;
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            let y = pos.getY(i) - dt * 0.9;
            if (y < 0) y = 22;
            pos.setY(i, y);
          }
          pos.needsUpdate = true;
        }
      });
    }

    // küpler
    for (const [, mesh] of this.cubeMeshes) {
      if (!mesh.visible) continue;
      // Polished rotation on all axes with individual timing
      mesh.rotation.y += dt * (1.1 + Math.sin(this.time * 0.5 + mesh.userData.id * 0.3) * 0.3);
      mesh.rotation.x = 0.2 + Math.sin(this.time * 0.7 + mesh.userData.phase) * 0.15;
      mesh.rotation.z = Math.cos(this.time * 0.4 + mesh.userData.id * 0.3) * 0.05;
      // Eased float with reduced oscillation
      const floatPhase = this.time * 0.8 + mesh.userData.floatPhase;
      mesh.position.y = mesh.userData.baseY + Math.sin(floatPhase) * 0.015 * (0.5 + Math.cos(this.time * 0.2) * 0.1);
      // Subtle pulse scale
      const scalePulse = 0.95 + Math.sin(this.time * 1.6 + mesh.userData.id) * 0.02;
      mesh.scale.setScalar(scalePulse);
      // Anime-category glow pulse
      if (mesh.userData.category === 'anime') {
        mesh.material.emissiveIntensity = 0.3 + Math.sin(this.time * 2 + mesh.userData.id) * 0.1;
      }
    }

    // fx
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.life <= 0) {
        f.mesh.parent?.remove(f.mesh);
        if (f.mesh.geometry && f.ownGeo) f.mesh.geometry.dispose();
        f.mesh.material?.dispose?.();
        this.fx.splice(i, 1);
        continue;
      }
      const t = 1 - f.life / f.maxLife;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.vel.y += (f.gravity || 0) * dt;
      if (f.grow) f.mesh.scale.setScalar(f.grow(t));
      if (f.mesh.material) f.mesh.material.opacity = Math.max(0, 1 - t) * (f.opacity ?? 1);
      if (f.spin) f.mesh.rotation.z += f.spin * dt;
    }

    // mermi ışıması
    for (const [, pr] of this.projectiles) {
      pr.mesh.rotation.x += dt * 8;
      pr.mesh.rotation.y += dt * 6;
    }

    // yoldaşlar
    for (const [, c] of this.companions) {
      c.mesh.position.y += Math.sin(this.time * 3 + c.phase) * 0.003;
      c.mesh.rotation.y += dt * 0.8;
    }

    this.renderer.render(this.scene, this.camera);
  }

  applyState(dt, state) {
    if (!state) return;
    const players = state.players || [];

    // uzak oyuncular
    const seen = new Set();
    for (const p of players) {
      if (p.id === this.myId) {
        this.local.hp = p.hp;
        this.local.alive = p.alive;
        this.serverPos = p.pos;
        if (this.me) {
          const active = p.items[p.active];
          if (this.lastItemId !== (active?.id || null)) {
            this.lastItemId = active?.id || null;
            this.me.setItem(active || null);
          }
        }
        continue;
      }
      seen.add(p.id);
      let r = this.remotes.get(p.id);
      if (!r) {
        const ch = createCharacter({ color: p.color, name: p.name });
        this.scene.add(ch.group);
        ch.group.position.set(p.pos[0], p.pos[1], p.pos[2]);
        r = { char: ch, target: new THREE.Vector3(), itemId: undefined, speed: 0, yaw: p.yaw || 0, hp: p.hp, alive: p.alive };
        this.remotes.set(p.id, r);
      }
      r.target.set(p.pos[0], p.pos[1], p.pos[2]);
      const k = 1 - Math.exp(-dt * 13);
      r.char.group.position.lerp(r.target, k);
      r.speed += (p.speed - r.speed) * Math.min(1, dt * 8);
      r.yaw = lerpAngle(r.yaw, p.yaw || 0, 1 - Math.exp(-dt * 10));
      r.char.group.rotation.y = r.yaw;
      const active = p.items[p.active];
      const itemId = active?.id || null;
      if (r.itemId !== itemId) {
        r.itemId = itemId;
        r.char.setItem(active || null);
      }
      r.char.group.visible = p.alive;
      r.char.update(dt, {
        speed: r.speed,
        grounded: p.pos[1] < 0.15,
        vy: 0,
        moving: r.speed > 0.7,
        aimYaw: r.yaw,
        hp: p.hp,
        alive: p.alive,
        building: !!p.building,
        camera: this.camera
      });

      // yoldaş
      if (p.companion) {
        let c = this.companions.get(p.id);
        if (!c) {
          c = makeCompanion(p.companion.color, p.companion.glow);
          this.scene.add(c.mesh);
          this.companions.set(p.id, c);
        }
        c.mesh.position.lerp(this.tmp.set(p.companion.x, p.companion.y, p.companion.z), Math.min(1, dt * 14));
      } else if (this.companions.has(p.id)) {
        const c = this.companions.get(p.id);
        this.scene.remove(c.mesh);
        this.companions.delete(p.id);
      }
    }

    for (const [id, r] of this.remotes) {
      if (!seen.has(id)) {
        this.scene.remove(r.char.group);
        r.char.dispose();
        this.remotes.delete(id);
        if (this.companions.has(id)) {
          this.scene.remove(this.companions.get(id).mesh);
          this.companions.delete(id);
        }
      }
    }

    // mermiler
    const projSeen = new Set();
    for (const pr of state.projectiles || []) {
      projSeen.add(pr.id);
      let entry = this.projectiles.get(pr.id);
      if (!entry) {
        const mesh = makeProjectile(pr.kind, pr.color);
        mesh.position.set(pr.pos[0], pr.pos[1], pr.pos[2]);
        this.scene.add(mesh);
        entry = { mesh };
        this.projectiles.set(pr.id, entry);
      }
      entry.mesh.position.lerp(this.tmp.set(pr.pos[0], pr.pos[1], pr.pos[2]), 0.45);
    }
    for (const [id, entry] of this.projectiles) {
      if (!projSeen.has(id)) {
        this.scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        entry.mesh.material.dispose();
        this.projectiles.delete(id);
      }
    }
  }

  // ------------------------------------------------------------ efektler
  boom(x, y, z, radius = 3, color = 0xffb347) {
    const geo = new THREE.SphereGeometry(1, 16, 12);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(radius * 0.25);
    this.scene.add(mesh);
    this.fx.push({
      mesh,
      ownGeo: true,
      life: 0.45,
      maxLife: 0.45,
      vel: new THREE.Vector3(0, 1.2, 0),
      grow: (t) => radius * (0.25 + t * 1.05),
      opacity: 0.9
    });

    for (let i = 0; i < 14; i++) {
      const g2 = new THREE.BoxGeometry(0.14, 0.14, 0.14);
      const m2 = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
      const part = new THREE.Mesh(g2, m2);
      part.position.set(x, y, z);
      this.scene.add(part);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize();
      this.fx.push({
        mesh: part,
        ownGeo: true,
        life: 0.6 + Math.random() * 0.4,
        maxLife: 1,
        vel: dir.multiplyScalar(radius * 2.2),
        gravity: -12,
        spin: 4
      });
    }

    const d = Math.hypot(this.local.pos.x - x, this.local.pos.z - z);
    this.shake = Math.max(this.shake, clamp(1 - d / (radius * 4), 0, 1) * 0.55);
  }

  burst(x, y, z, color = 0xffcf5c, count = 8, power = 4) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false });
      const part = new THREE.Mesh(geo, mat);
      part.position.set(x, y, z);
      this.scene.add(part);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
      this.fx.push({
        mesh: part,
        ownGeo: true,
        life: 0.45 + Math.random() * 0.3,
        maxLife: 0.7,
        vel: dir.multiplyScalar(power * (0.6 + Math.random())),
        gravity: -14,
        spin: 6
      });
    }
  }

  ring(x, y, z, color = 0x6ee7a8, radius = 1.6) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.32, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.fx.push({
      mesh,
      ownGeo: true,
      life: 0.6,
      maxLife: 0.6,
      vel: new THREE.Vector3(0, 0.4, 0),
      grow: (t) => 1 + t * radius * 1.6,
      opacity: 0.9
    });
  }

  muzzleFlash(x, y, z, color = 0xffcf5c) {
    this.burst(x, y, z, color, 3, 2.2);
  }

  meleeSwing(x, y, z, color = 0x35d0ff) {
    const geo = new THREE.TorusGeometry(1.1, 0.06, 6, 20, Math.PI * 0.9);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.set(0, Math.random() * Math.PI, 0.6);
    this.scene.add(mesh);
    this.fx.push({
      mesh,
      ownGeo: true,
      life: 0.22,
      maxLife: 0.22,
      vel: new THREE.Vector3(0, 0, 0),
      grow: (t) => 1 + t * 0.4,
      opacity: 0.85
    });
  }

  hideCube(id, byMe = false) {
    const mesh = this.cubeMeshes.get(id);
    if (!mesh || !mesh.visible) return;
    mesh.visible = false;
    if (byMe) this.burst(mesh.position.x, mesh.position.y, mesh.position.z, 0xffcf5c, 10, 5);
  }

  showCube(id) {
    const mesh = this.cubeMeshes.get(id);
    if (mesh) mesh.visible = true;
  }

  nearestCube(pos) {
    let best = null;
    let bestD = 4;
    for (const c of this.cubes) {
      const mesh = this.cubeMeshes.get(c.id);
      if (!mesh || !mesh.visible) continue;
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }
}

function makeCompanion(color = 0xffb347, glow = 0xff6a00) {
  const mesh = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
  const glowMat = new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 1.4, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.5, 0.62), bodyMat);
  mesh.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.46), bodyMat);
  head.position.set(0, 0.36, 0.1);
  mesh.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), glowMat);
    eye.position.set(s * 0.13, 0.4, 0.34);
    mesh.add(eye);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.34), glowMat);
    wing.position.set(s * 0.52, 0.14, -0.05);
    wing.rotation.z = s * 0.35;
    mesh.add(wing);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), glowMat);
  tail.position.set(0, -0.1, -0.45);
  mesh.add(tail);
  mesh.scale.setScalar(0.9);
  return { mesh, phase: Math.random() * 6 };
}

function makeProjectile(kind, color) {
  let geo;
  let mat;
  if (kind === 'rocket') {
    geo = new THREE.CylinderGeometry(0.1, 0.13, 0.55, 8);
    geo.rotateX(Math.PI / 2);
    mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3 });
  } else if (kind === 'bolt') {
    geo = new THREE.SphereGeometry(0.16, 10, 8);
    mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  } else if (kind === 'companion') {
    geo = new THREE.SphereGeometry(0.19, 10, 8);
    mat = new THREE.MeshBasicMaterial({ color });
  } else {
    geo = new THREE.BoxGeometry(0.12, 0.12, 0.4);
    mat = new THREE.MeshBasicMaterial({ color });
  }
  const mesh = new THREE.Mesh(geo, mat);
  const light = new THREE.PointLight(color, 6, 6);
  mesh.add(light);
  return mesh;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

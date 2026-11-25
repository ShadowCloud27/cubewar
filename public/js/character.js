import * as THREE from 'three';

// Yay-sönümleme tabanlı prosedürel animasyon: uzuvlar hedef açıya fizikle oturur.
class Spring {
  constructor(value = 0, stiffness = 150, damping = 16, mass = 1) {
    this.value = value;
    this.target = value;
    this.vel = 0;
    this.k = stiffness / mass;
    this.d = damping / Math.sqrt(Math.max(mass, 1));
    this.restitution = 0.1;
  }

  update(dt) {
    const steps = Math.min(4, Math.ceil(dt / 0.016));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = (this.target - this.value) * this.k - this.vel * this.d;
      this.vel += a * h;
      // Bouncy restitution for natural motion
      this.vel *= (1 - this.restitution);
      this.value += this.vel * h;
    }
    return this.value;
  }
}

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  return m;
}

export function createCharacter({ color = '#35d0ff', accent = '#ff4d8d', name = 'Oyuncu', team = null } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const skin = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.12,
    emissive: new THREE.Color(color).multiplyScalar(0.16)
  });
  const joint = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.8, metalness: 0.1 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 1.1,
    roughness: 0.4,
    metalness: 0.2,
    transparent: true,
    opacity: 0.95
  });

  // gövde
  const torso = box(0.66, 0.68, 0.36, skin);
  torso.position.y = 1.3;
  body.add(torso);

  const chest = box(0.36, 0.16, 0.06, glowMat);
  chest.position.set(0, 1.38, 0.2);
  body.add(chest);

  const hips = box(0.56, 0.2, 0.34, joint);
  hips.position.y = 0.94;
  body.add(hips);

  // kafa
  const head = box(0.46, 0.44, 0.42, skin);
  head.position.y = 1.86;
  body.add(head);

  const visor = box(0.34, 0.12, 0.03, glowMat);
  visor.position.set(0, 1.9, 0.215);
  body.add(visor);

  const cap = box(0.48, 0.08, 0.44, joint);
  cap.position.y = 2.08;
  body.add(cap);

  // kollar (omuz pivotu)
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.43, 1.56, 0);
    const upper = box(0.18, 0.56, 0.2, skin);
    upper.position.y = -0.28;
    pivot.add(upper);
    const glove = box(0.2, 0.16, 0.22, joint);
    glove.position.y = -0.58;
    pivot.add(glove);
    body.add(pivot);
    arms.push({ pivot, side, spring: new Spring(0, 190, 20) });
  }
  const rightArm = arms[1];

  // eller
  const hand = new THREE.Group();
  hand.position.y = -0.62;
  rightArm.pivot.add(hand);

  // bacaklar
  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.17, 0.92, 0);
    const leg = box(0.24, 0.72, 0.26, skin);
    leg.position.y = -0.36;
    pivot.add(leg);
    const foot = box(0.26, 0.16, 0.34, joint);
    foot.position.set(0, -0.76, 0.05);
    pivot.add(foot);
    body.add(pivot);
    legs.push({ pivot, side, spring: new Spring(0, 210, 22) });
  }

  // temas gölgesi
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  // isim etiketi
  const label = makeLabel(name);
  group.add(label);

  // can barı
  const hpGroup = new THREE.Group();
  hpGroup.position.y = 2.34;
  const hpBg = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x0a1020, transparent: true, opacity: 0.8, depthTest: false })
  );
  const hpFillGeo = new THREE.PlaneGeometry(1, 0.1);
  hpFillGeo.translate(0.5, 0, 0);
  const hpFill = new THREE.Mesh(
    hpFillGeo,
    new THREE.MeshBasicMaterial({ color: 0x6ee7a8, transparent: true, opacity: 0.95, depthTest: false })
  );
  hpFill.position.set(-0.5, 0, 0.001);
  hpGroup.add(hpBg, hpFill);
  hpGroup.visible = false;
  group.add(hpGroup);

  let heldItem = null;
  let pendingBuildMesh = null;

  function disposeObject(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose?.();
      }
    });
  }

  function setItem(spec) {
    if (heldItem) {
      hand.remove(heldItem);
      disposeObject(heldItem);
      heldItem = null;
    }
    if (!spec) return;
    heldItem = buildWeapon(spec);
    hand.add(heldItem);
  }

  function buildWeapon(spec) {
    const g = new THREE.Group();
    const c1 = new THREE.Color(spec.color || spec.palette?.[0] || '#9aa7b8');
    const c2 = new THREE.Color(spec.glow || spec.palette?.[1] || '#35d0ff');
    const m1 = new THREE.MeshStandardMaterial({ color: c1, roughness: 0.45, metalness: 0.55 });
    const m2 = new THREE.MeshStandardMaterial({
      color: c2,
      emissive: c2,
      emissiveIntensity: 1.3,
      roughness: 0.3,
      metalness: 0.3
    });
    const behavior = spec.behavior || 'projectile';
    const cat = spec.category;

    if (behavior === 'melee') {
      const grip = box(0.07, 0.22, 0.07, m1);
      grip.position.y = -0.05;
      g.add(grip);
      const blade = box(0.06, 0.72, 0.12, m2);
      blade.position.y = 0.4;
      blade.rotation.z = 0.06;
      g.add(blade);
      g.rotation.x = -0.15;
    } else if (behavior === 'support') {
      const cube = box(0.24, 0.24, 0.24, m2);
      g.add(cube);
      const cross1 = box(0.1, 0.3, 0.02, m1);
      cross1.position.z = 0.13;
      const cross2 = box(0.3, 0.1, 0.02, m1);
      cross2.position.z = 0.13;
      g.add(cross1, cross2);
    } else if (cat === 'energy') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.62, 10), m1);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.16;
      g.add(barrel);
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 14), m2);
        ring.position.z = 0.02 + i * 0.16;
        g.add(ring);
      }
      const grip = box(0.08, 0.2, 0.09, m1);
      grip.position.set(0, -0.14, -0.02);
      g.add(grip);
    } else if (cat === 'explosive' || cat === 'super') {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.8, 12), m1);
      tube.rotation.x = Math.PI / 2;
      tube.position.z = 0.18;
      g.add(tube);
      const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.03, 6, 14), m2);
      muzzle.position.z = 0.58;
      g.add(muzzle);
      const grip = box(0.09, 0.22, 0.1, m1);
      grip.position.set(0, -0.16, 0);
      g.add(grip);
      const sight = box(0.05, 0.12, 0.12, m2);
      sight.position.set(0, 0.14, 0.05);
      g.add(sight);
    } else if (cat === 'vehicle') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.95, 12), m1);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.25;
      g.add(barrel);
      const brake = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 14), m2);
      brake.position.z = 0.72;
      g.add(brake);
    } else {
      // tüfek
      const receiver = box(0.1, 0.14, 0.62, m1);
      receiver.position.z = 0.16;
      g.add(receiver);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.6, 8), m1);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.72;
      g.add(barrel);
      const mag = box(0.08, 0.26, 0.12, m2);
      mag.position.set(0, -0.16, 0.18);
      g.add(mag);
      const stock = box(0.07, 0.16, 0.22, m1);
      stock.position.set(0, -0.02, -0.2);
      g.add(stock);
      const rail = box(0.04, 0.04, 0.3, m2);
      rail.position.set(0, 0.09, 0.3);
      g.add(rail);
    }

    // inşa parıltısı
    const glint = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshBasicMaterial({ color: c2, transparent: true, opacity: 0 })
    );
    glint.position.z = 0.7;
    glint.name = 'muzzle';
    g.add(glint);

    g.scale.setScalar(0.95);
    g.position.set(0, -0.02, 0.1);
    return g;
  }

  let flashTime = 0;

  function flash() {
    flashTime = 0.09;
  }

  const state = {
    phase: 0,
    squash: new Spring(0, 240, 18),
    lean: new Spring(0, 120, 14),
    bob: 0,
    wasGrounded: true,
    lastHp: 100
  };

  function update(dt, opts) {
    const {
      speed = 0,
      maxSpeed = 9,
      grounded = true,
      vy = 0,
      moving = false,
      aimYaw = 0,
      building = false,
      hp = 100,
      camera = null,
      alive = true
    } = opts || {};

    const run = Math.min(1, speed / 6.4);
    const wasMoving = moving;
    state.phase += dt * (5 + run * 11) * (moving ? 1 : 0.22);

    const air = !grounded;
    // yürüyüş / koşu animasyonu: dış bacaklar daha çok, iç bacaklar daha az
    for (const leg of legs) {
      let targetAngle;
      if (air) {
        // Zıplama pozisyonu - bacaklar açık
        targetAngle = leg.side > 0 ? 0.55 : -0.35;
      } else if (building) {
        targetAngle = 0;
      } else if (moving) {
        // Düşürme cycling with natural foot roll
        const walkPhase = state.phase % (Math.PI * 2);
        targetAngle = Math.sin(walkPhase - (leg.side > 0 ? 0 : Math.PI)) * 0.9 * run;
      } else {
        // Durağan: bacakları neutral pozisyona geri
        targetAngle = 0;
      }
      // Smooth damping for natural motion
      if (leg.spring.target === undefined) leg.spring.target = targetAngle;
      else leg.spring.target = lerp(leg.spring.target, targetAngle, 0.12);
      leg.pivot.rotation.x = leg.spring.update(dt);
      // Natural foot roll during walk
      if (moving) {
        leg.pivot.rotation.z = leg.side * (0.06 + run * 0.05);
      } else {
        leg.pivot.rotation.z = leg.side * (0.06 + Math.sin(state.phase * 3) * 0.03);
      }
    }

    for (const arm of arms) {
      let targetAngle;
      if (building) {
        // Build pose - arms raised
        targetAngle = -1.2 + Math.sin(state.phase * 2) * 0.08;
      } else if (air) {
        // Jump pose - arms up for balance
        targetAngle = -0.7;
      } else if (moving) {
        // Walking swing with natural rhythm
        const walkPhase = state.phase % (Math.PI * 2);
        targetAngle = Math.sin(walkPhase + (arm.side > 0 ? Math.PI : 0)) * 0.7 * run;
      } else if (arm.side > 0 && heldItem) {
        // Holding weapon - arm extends naturally
        targetAngle = -0.55 + Math.sin(state.phase * 1.5) * 0.05;
      } else {
        // Rest at natural hang
        targetAngle = swing * 0.55 - 0.12;
      }
      // Smooth damping for fluid motion
      if (arm.spring.target === undefined) arm.spring.target = targetAngle;
      else arm.spring.target = lerp(arm.spring.target, targetAngle, 0.14);
      arm.pivot.rotation.x = arm.spring.update(dt);
      // Natural arm swing during walk
      if (moving) {
        arm.pivot.rotation.z = arm.side * (0.08 + run * 0.06 + Math.sin(state.phase * 2) * 0.02);
      } else {
        arm.pivot.rotation.z = arm.side * (0.08 + Math.sin(state.phase * 3) * 0.03);
      }
    }

    // iniş yayı + koşu sallanması
    if (grounded && !state.wasGrounded && vy < -3) {
      state.squash.vel = Math.min(3, -vy * 0.18);
    }
    state.wasGrounded = grounded;
    state.squash.target = 0;
    const squash = state.squash.update(dt);

    state.lean.target = grounded ? Math.min(0.22, speed * 0.02) : 0.08;
    const lean = state.lean.update(dt);

    // hareket bobi: yürürken daha fluide
    state.bob += dt * (4 + run * 8) * (moving ? 1 : 0.5);
    const bobY = grounded ? Math.abs(Math.sin(state.bob)) * 0.045 * run : 0;

    // vücut ölçekleme ve pozisyonu
    const squashFactor = squash * 0.35;
    body.scale.set(1 + squashFactor, 1 - squashFactor * 1.4, 1 + squashFactor);
    body.position.y = bobY - Math.max(0, squash) * 0.12;
    body.rotation.x = lean;
    body.rotation.z = Math.sin(state.phase) * 0.03 * run;

    // isim etiketi her zaman kameraya bakar (sprite otomatik)
    label.position.y = 2.4;

    // can barı
    const showHp = hp < 99.5 && alive;
    hpGroup.visible = showHp;
    if (showHp) {
      hpFill.scale.x = Math.max(0.001, hp / 100);
      hpFill.material.color.setHex(hp > 55 ? 0x6ee7a8 : hp > 25 ? 0xffcf5c : 0xff4d6d);
      if (camera) hpGroup.quaternion.copy(camera.quaternion);
      hpGroup.position.y = 2.18;
    }

    // namlu ışığı
    if (heldItem) {
      const muzzle = heldItem.getObjectByName('muzzle');
      if (muzzle) {
        if (flashTime > 0) {
          flashTime -= dt;
          muzzle.material.opacity = 0.95;
          muzzle.scale.setScalar(2.6);
        } else {
          muzzle.material.opacity = 0;
          muzzle.scale.setScalar(1);
        }
      }
    }

    shadow.material.opacity = grounded ? 0.32 : 0.14;
    shadow.position.y = -group.position.y + 0.03;
  }

  function setColor(hex) {
    skin.color.set(hex);
    skin.emissive.set(hex);
    skin.emissive.multiplyScalar(0.16);
  }

  function setAccent(hex) {
    glowMat.color.set(hex);
    glowMat.emissive.set(hex);
  }

  function setName(text) {
    label.material.map.dispose();
    const fresh = makeLabel(text);
    label.material.map = fresh.material.map;
    label.material.needsUpdate = true;
    fresh.material.dispose();
  }

  function dispose() {
    disposeObject(group);
  }

  
  // Team indicator (small circle above player)
  let teamIndicator = null;
  if (team) {
    const teamGeometry = new THREE.CircleGeometry(0.15, 16);
    const teamMat = team === 'red' 
      ? new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8 })
      : new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: 0.8 });
    teamIndicator = new THREE.Mesh(teamGeometry, teamMat);
    teamIndicator.position.set(0, 0.8, 0); // Above head
    teamIndicator.rotation.x = -Math.PI / 2; // Flat on ground
    group.add(teamIndicator);
  }
return { group, body, update, setItem, setColor, setAccent, setName, flash, dispose, hand, arms, legs };
}

// Linear interpolation for smooth damping
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y + h, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textWidth = Math.min(300, ctx.measureText(text).width + 34);
  ctx.fillStyle = 'rgba(6,10,20,0.55)';
  roundedRect(ctx, 160 - textWidth / 2, 16, textWidth, 48, 16);
  ctx.fill();
  ctx.fillStyle = '#dff1ff';
  ctx.fillText(text, 160, 41);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
  );
  sprite.scale.set(2.6, 0.65, 1);
  sprite.position.y = 2.4;
  sprite.renderOrder = 5;
  return sprite;
}

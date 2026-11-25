// Arena tanımları: sunucu bu veriyi istemciye gönderir, istemci de sahnede kurar.

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MAPS = [
  {
    id: 'neon',
    name: 'Neon Arena',
    tag: 'Dengeli 4 sütun',
    radius: 150,
    gravity: -24,
    seed: 90210,
    cubeCount: 150,
    theme: {
      deco: 'neon',
      sky: 0x070a17,
      fog: 0x0a0f22,
      ground: 0x121a30,
      groundEdge: 0x1d2b4d,
      accent: 0x35d0ff,
      accent2: 0xff4d8d,
      light: 0x9fd8ff
    },
    obstacles: [
      { x: 0, z: 0, w: 7, d: 7, h: 1.5 },
      { x: 15, z: 12, w: 3, d: 3, h: 4.0 },
      { x: -15, z: -12, w: 3, d: 3, h: 4.0 },
      { x: 18, z: 0, w: 3, d: 5, h: 2.0 },
      { x: -18, z: 0, w: 3, d: 5, h: 2.0 },
      { x: 0, z: 22, w: 4, d: 2, h: 1.0 },
      { x: 0, z: -22, w: 4, d: 2, h: 1.0 }
    ]
  },
  {
    id: 'dune',
    name: 'Kum Fırtınası',
    tag: 'Geniş açık alanlar',
    radius: 150,
    gravity: -20,
    seed: 424242,
    cubeCount: 120,
    theme: {
      deco: 'dune',
      sky: 0x2a1a12,
      fog: 0x3a2418,
      ground: 0x6b4a2f,
      groundEdge: 0x8a6440,
      accent: 0xffb347,
      accent2: 0xff6a3d,
      light: 0xffd7a3
    },
    obstacles: [
      { x: 0, z: 0, w: 8, d: 8, h: 2.0 },
      { x: 20, z: 10, w: 4, d: 4, h: 1.5 },
      { x: -20, z: -10, w: 4, d: 4, h: 1.5 },
      { x: 25, z: 0, w: 3, d: 6, h: 1.0 },
      { x: -25, z: 0, w: 3, d: 6, h: 1.0 },
      { x: 15, z: 20, w: 3, d: 3, h: 1.5 },
      { x: -15, z: -20, w: 3, d: 3, h: 1.5 }
    ]
  },
  {
    id: 'ice',
    name: 'Buz Kubbesi',
    tag: 'Daha muchos flat area',
    radius: 150,
    gravity: -16,
    seed: 777001,
    cubeCount: 100,
    theme: {
      deco: 'ice',
      sky: 0x0a1c2c,
      fog: 0x0e2b40,
      ground: 0x2b5f7a,
      groundEdge: 0x3f86a8,
      accent: 0x8ef0ff,
      accent2: 0x7b5cff,
      light: 0xd8f6ff
    },
    obstacles: [
      { x: 0, z: 0, w: 5, d: 5, h: 3.5 },
      { x: 12, z: 8, w: 2, d: 2, h: 5.0 },
      { x: -12, z: -8, w: 2, d: 2, h: 5.0 },
      { x: 0, z: 15, w: 3, d: 3, h: 2.0 },
      { x: 0, z: -15, w: 3, d: 3, h: 2.0 },
      { x: 18, z: 0, w: 2, d: 4, h: 1.5 },
      { x: -18, z: 0, w: 2, d: 4, h: 1.5 }
    ]
  },
  {
    id: 'valorant1',
    name: 'Bind A Site',
    tag: 'Close Quarters 2 Bomb Site',
    radius: 150,
    gravity: -24,
    seed: 2020,
    cubeCount: 130,
    theme: {
      deco: 'neon',
      sky: 0x0d0f1c,
      fog: 0x141a2e,
      ground: 0x1a2535,
      groundEdge: 0x25354a,
      accent: 0xff0000,
      accent2: 0xff8c00,
      light: 0xffd700
    },
    obstacles: [
      { x: 0, z: 0, w: 5, d: 5, h: 2.5 },
      { x: 12, z: 8, w: 2, d: 2, h: 4.0 },
      { x: -12, z: -8, w: 2, d: 2, h: 4.0 },
      { x: 15, z: -12, w: 2, d: 2, h: 3.5 },
      { x: -15, z: 12, w: 2, d: 2, h: 3.5 },
      { x: 8, z: 16, w: 1, d: 1, h: 5.0 },
      { x: -8, z: -16, w: 1, d: 1, h: 5.0 },
      { x: 0, z: 20, w: 3, d: 3, h: 1.5 },
      { x: 0, z: -20, w: 3, d: 3, h: 1.5 }
    ]
  },
  {
    id: 'valorant2',
    name: 'Bind B Site',
    tag: 'Mid Control 2 Bomb Site',
    radius: 150,
    gravity: -24,
    seed: 2021,
    cubeCount: 130,
    theme: {
      deco: 'neon',
      sky: 0x0d0f1c,
      fog: 0x141a2e,
      ground: 0x1a2535,
      groundEdge: 0x25354a,
      accent: 0x00ff00,
      accent2: 0x32cd32,
      light: 0x98fb98
    },
    obstacles: [
      { x: 0, z: 0, w: 5, d: 5, h: 2.5 },
      { x: 12, z: 8, w: 2, d: 2, h: 4.0 },
      { x: -12, z: -8, w: 2, d: 2, h: 4.0 },
      { x: 15, z: -12, w: 2, d: 2, h: 3.5 },
      { x: -15, z: 12, w: 2, d: 2, h: 3.5 },
      { x: 8, z: 16, w: 1, d: 1, h: 5.0 },
      { x: -8, z: -16, w: 1, d: 1, h: 5.0 },
      { x: 0, z: 20, w: 3, d: 3, h: 1.5 },
      { x: 0, z: -20, w: 3, d: 3, h: 1.5 }
    ]
  },
  {
    id: 'valorant3',
    name: 'Mid Tunnel',
    tag: 'Geniş mid alanı many route',
    radius: 150,
    gravity: -24,
    seed: 2022,
    cubeCount: 110,
    theme: {
      deco: 'neon',
      sky: 0x0d0f1c,
      fog: 0x141a2e,
      ground: 0x1a2535,
      groundEdge: 0x25354a,
      accent: 0x00bfff,
      accent2: 0x1e90ff,
      light: 0x6495ed
    },
    obstacles: [
      { x: 0, z: 0, w: 4, d: 4, h: 3.0 },
      { x: 10, z: 10, w: 2, d: 2, h: 4.5 },
      { x: -10, z: -10, w: 2, d: 2, h: 4.5 },
      { x: 12, z: 0, w: 2, d: 5, h: 3.0 },
      { x: -12, z: 0, w: 2, d: 5, h: 3.0 },
      { x: 0, z: 14, w: 2, d: 2, h: 2.5 },
      { x: 0, z: -14, w: 2, d: 2, h: 2.5 },
      { x: 0, z: 0, w: 3, d: 3, h: 2.0 }
    ]
  }
];

// Küp üretimi: harita boyutuna ve zırla sayısına göre küpleri oluşturur
function genCubes(map) {
  const cubes = [];
  const cubeSize = 0.42; // Tekil küp boyutu
  const cubesPerLarge = 125; // Bir "küp bloğun" içindeki küçük küp sayısı (5x5x5)
  const largeCubeEdge = cubeSize * 5; // 5 küçük küp yan yana = 1 büyük kubenın kenarı
  const mapRadius = map.radius;
  const gravity = map.gravity ?? -24;
  
  // Çok az cube sayısı için minimum garantisi
  const targetCount = Math.max(20, map.cubeCount * 2);
  
  // Rastgele konumda küpler dağıl (engellere çarpmayacak şekilde)
  let attempts = 0;
  const maxAttempts = targetCount * 5;
  
  while (cubes.length < targetCount && attempts < maxAttempts) {
    // Rastgele konum
    const angle = Math.random() * Math.PI * 2;
    const radius = mapRadius * (0.6 + Math.random() * 0.3); // Merkezden biraz içine
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    
    // Y konumu: zeminden biraz yukarı, engellere çarpmaması için
    const y = 2 + Math.random() * 3; // 2-5 aralığında spawn
    
    // Engellere çarpma kontrolü (basit kontrol)
    let tooClose = false;
    for (const obs of map.obstacles) {
      const dx = Math.abs(x - obs.x);
      const dz = Math.abs(z - obs.z);
      if (dx < obs.w / 2 + 2 && dz < obs.d / 2 + 2) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) {
      attempts++;
      continue;
    }
    
    // Küp objesi
    const cube = {
      id: cubes.length,
      x: parseFloat(x.toFixed(2)),
      z: parseFloat(z.toFixed(2)),
      y: parseFloat(y.toFixed(2)),
      amount: cubesPerLarge, // 125 küçük küp temsil et
      gravity: gravity,
      active: true,
      backAt: 0
    };
    cubes.push(cube);
  }
  
  return cubes;
}

function mapById(id) {
  for (const m of MAPS) {
    if (m.id === id) return m;
  }
  return MAPS[0]; // fallback to neon
}

function spawnPoint(map, index, count) {
  const sides = [
    { x: -map.radius, z: 0 },     // left
    { x: map.radius, z: 0 },      // right
    { x: 0, z: -map.radius },     // bottom
    { x: 0, z: map.radius },      // top
  ];
  const side = sides[index % 4];
  const angle = (index * 0.785) + Math.random() * 0.5;
  return {
    x: side.x * Math.cos(angle) - side.z * Math.sin(angle),
    z: side.x * Math.sin(angle) + side.z * Math.cos(angle),
    y: 0
  };
}
export { mapById, spawnPoint, genCubes }

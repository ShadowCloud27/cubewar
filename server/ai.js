// CubeMind AI Concept Dictionary for CubeWar
// Server-side only, no LLM key required
// Enhanced with fuzzy matching, bigram support, and dynamic learning

// ===== CATEGORIES WITH BASE COSTS (10-290 Küp clamped, rounded to 5) =====
const CATEGORIES = {
  melee: { base: 60, behavior: "melee", glow: 0xff5555 },
  air: { base: 15, behavior: "ranged", glow: 0x88ccff },
  water: { base: 15, behavior: "ranged", glow: 0x55aaff },
  earth: { base: 20, behavior: "melee", glow: 0x8b572a },
  fireball: { base: 30, behavior: "explosive", glow: 0xff5555 },
  explosive: { base: 130, behavior: "explosive", glow: 0xff5555 },
  frostbite: { base: 25, behavior: "control", glow: 0x88ccff },
  lightning: { base: 30, behavior: "strike", glow: 0x9b59b6 },
  ice2: { base: 25, behavior: "control", glow: 0x88ccff },
  poison2: { base: 25, behavior: "damage-over-time", glow: 0x8b572a },
  sound: { base: 10, behavior: "support", glow: 0xffffff },
  magic: { base: 35, behavior: "spell", glow: 0x9b59b6 },
  cyber2: { base: 20, behavior: "tech", glow: 0xffd93d },
  virus: { base: 15, behavior: "damage", glow: 0x8b572a },
  dimensions: { base: 20, behavior: "utility", glow: 0x9b59b6 },
  temporal2: { base: 15, behavior: "utility", glow: 0x9b59b6 },
  force: { base: 25, behavior: "impact", glow: 0xffd93d },
  heat: { base: 15, behavior: "damage", glow: 0xff5555 },
  cold2: { base: 20, behavior: "control", glow: 0x88ccff },
  light2: { base: 10, behavior: "glow", glow: 0xffd700 },
  weather: { base: 15, behavior: "environment", glow: 0x88ccff },
  shadow: { base: 10, behavior: "stealth", glow: 0x2c3e50 },
  darkness: { base: 10, behavior: "stealth", glow: 0x1a1a1a },
  light: { base: 10, behavior: "glow", glow: 0xffd700 },
  music: { base: 15, behavior: "support", glow: 0xffe5b4 },
  voice: { base: 10, behavior: "support", glow: 0xffe5b4 },
  noise: { base: 5, behavior: "ambient", glow: 0x7f8c8d },
  quiet: { base: 5, behavior: "ambient", glow: 0xecf0f1 },
  loud: { base: 20, behavior: "impact", glow: 0xff5555 },
  weapon: { base: 40, behavior: "ranged", glow: 0xd35400 },
  sword: { base: 30, behavior: "melee", glow: 0xc0392b },
  axe: { base: 35, behavior: "melee", glow: 0xc0392b },
  spear: { base: 30, behavior: "melee", glow: 0xc0392b },
  bow: { base: 30, behavior: "ranged", glow: 0xc0392b },
  dagger: { base: 20, behavior: "melee", glow: 0xc0392b },
  shield: { base: 25, behavior: "defense", glow: 0x3498db },
  armor: { base: 30, behavior: "defense", glow: 0x3498db },
  helmet: { base: 15, behavior: "defense", glow: 0x3498db },
  monster: { base: 80, behavior: "enemy", glow: 0xe74c3c },
  dragon: { base: 120, behavior: "boss", glow: 0xe74c3c },
  wolf: { base: 70, behavior: "enemy", glow: 0xe74c3c },
  zombie: { base: 30, behavior: "enemy", glow: 0xe74c3c },
  skeleton: { base: 25, behavior: "enemy", glow: 0xe74c3c },
  ghost: { base: 30, behavior: "ghost", glow: 0x9b59b6 },
  spirit: { base: 20, behavior: "support", glow: 0x9b59b6 },
  demon: { base: 50, behavior: "boss", glow: 0xe74c3c },
  angel: { base: 50, behavior: "support", glow: 0x2ecc71 },
  fairy: { base: 20, behavior: "support", glow: 0x2ecc71 },
  cyber: { base: 25, behavior: "tech", glow: 0xffd93d },
  virus2: { base: 20, behavior: "damage", glow: 0x8b572a },
  vehicle: { base: 40, behavior: "ranged", glow: 0xd35400 },
  food: { base: 15, behavior: "consumable", glow: 0x84c7c4 },
  animal: { base: 60, behavior: "creature", glow: 0x84c7c4 },
  nature: { base: 20, behavior: "environment", glow: 0x84c7c4 },
  element: { base: 20, behavior: "elemental", glow: 0x9b59b6 },
  time: { base: 10, behavior: "utility", glow: 0x9b59b6 },
  space: { base: 20, behavior: "utility", glow: 0x9b59b6 },
  color: { base: 10, behavior: "utility", glow: 0x9b59b6 },
  shape: { base: 10, behavior: "utility", glow: 0x9b59b6 },
  military: { base: 45, behavior: "ranged", glow: 0xd35400 },
  police: { base: 40, behavior: "ranged", glow: 0xd35400 },
  firefighter: { base: 35, behavior: "support", glow: 0xc0392b },
  medic: { base: 30, behavior: "support", glow: 0x2ecc71 },
  teacher: { base: 15, behavior: "support", glow: 0x9b59b6 },
  artist: { base: 20, behavior: "creative", glow: 0x9b59b6 },
  athlete: { base: 20, behavior: "sport", glow: 0x3498db },
  musician: { base: 15, behavior: "creative", glow: 0x9b59b6 },
  writer: { base: 15, behavior: "creative", glow: 0x9b59b6 },
  chef: { base: 15, behavior: "creative", glow: 0x84c7c4 },
  dancer: { base: 15, behavior: "creative", glow: 0x9b59b6 },
  science: { base: 30, behavior: "research", glow: 0x9b59b6 },
  technology: { base: 30, behavior: "tech", glow: 0xffd93d },
  gaming: { base: 20, behavior: "entertainment", glow: 0x9b59b6 },
  programming: { base: 25, behavior: "tech", glow: 0xffd93d },
  internet: { base: 15, behavior: "connectivity", glow: 0x9b59b6 },
  security: { base: 25, behavior: "protection", glow: 0xff5555 },
  design: { base: 20, behavior: "creative", glow: 0x9b59b6 },
  architecture: { base: 30, behavior: "structure", glow: 0x9b59b6 },
  art: { base: 20, behavior: "creative", glow: 0x9b59b6 },
  history: { base: 15, behavior: "knowledge", glow: 0x9b59b6 },
  geography: { base: 15, behavior: "knowledge", glow: 0x9b59b6 },
  philosophy: { base: 20, behavior: "thought", glow: 0x9b59b6 },
  religion: { base: 20, behavior: "faith", glow: 0x9b59b6 },
  mythology: { base: 25, behavior: "legend", glow: 0x9b59b6 },
  literature: { base: 20, behavior: "story", glow: 0x9b59b6 },
  poetry: { base: 15, behavior: "verse", glow: 0x9b59b6 },
  drama: { base: 20, behavior: "performance", glow: 0x9b59b6 },
  comedy: { base: 15, behavior: "humor", glow: 0x9b59b6 },
  tragedy: { base: 20, behavior: "drama", glow: 0x9b59b6 },
  travel: { base: 25, behavior: "journey", glow: 0x9b59b6 },
  hotel: { base: 20, behavior: "accommodation", glow: 0x9b59b6 },
  restaurant: { base: 20, behavior: "dining", glow: 0x9b59b6 },
  coffee: { base: 10, behavior: "stimulant", glow: 0xffd700 },
  tea: { base: 10, behavior: "stimulant", glow: 0xffd700 },
  beer: { base: 15, behavior: "drink", glow: 0x9b59b6 },
  wine: { base: 20, behavior: "drink", glow: 0x9b59b6 },
  cocktail: { base: 20, behavior: "drink", glow: 0x9b59b6 },
  spirit2: { base: 25, behavior: "drink", glow: 0x9b59b6 },
  military2: { base: 50, behavior: "ranged", glow: 0xd35400 },
  police2: { base: 45, behavior: "ranged", glow: 0xd35400 },
  fire2: { base: 35, behavior: "damage", glow: 0xff5555 },
  medical2: { base: 30, behavior: "support", glow: 0x2ecc71 },
  science2: { base: 35, behavior: "research", glow: 0x9b59b6 },
  technology2: { base: 35, behavior: "tech", glow: 0xffd93d },
  gaming2: { base: 25, behavior: "entertainment", glow: 0x9b59b6 },
  programming2: { base: 30, behavior: "tech", glow: 0xffd93d },
  internet2: { base: 20, behavior: "connectivity", glow: 0x9b59b6 },
  security2: { base: 30, behavior: "protection", glow: 0xff5555 },
  design2: { base: 25, behavior: "creative", glow: 0x9b59b6 },
  art2: { base: 25, behavior: "creative", glow: 0x9b59b6 },
  sports: { base: 25, behavior: "sport", glow: 0x3498db },
  racing: { base: 30, behavior: "racing", glow: 0xf1c40f },
  mountain: { base: 30, behavior: "terrain", glow: 0x9b59b6 },
  beach: { base: 15, behavior: "terrain", glow: 0x9b59b6 },
  desert: { base: 20, behavior: "terrain", glow: 0x9b59b6 },
  forest: { base: 25, behavior: "terrain", glow: 0x84c7c4 },
  river: { base: 15, behavior: "terrain", glow: 0x9b59b6 },
  // Anime category added for 10K keyword goal
  anime: { base: 35, behavior: "support", glow: 0xfd79a8 },
  // Companion category for animal summons/pets
  companion: { base: 30, behavior: "companion", glow: 0x84c7c4 }
};

// ===== EXPANDED CONCEPTS DICTIONARY =====
// Core concepts matching against keys (Japanese/Turkish normalized)
// Keys are normalized: ı→i, İ→i, ' removed, NFD diacritics removed

const CONCEPTS = [
  // Melee category - foundational weapons
  { cats: "melee", keys: ["zeka", "knife", "blade", "axe", "hammer", "spear", "energy sword", "katana", "dagger", "scythe", "gauntlet", "tomahawk", "machete", "sword", "blade", "cutlass", "rapier", "estoc", "triceratops", "flail", "morning star", "nun chucks", "katar", "kirpan", "chain and sickle", "energy whip", "monomolecular whip", "chainsaw", "viking axe", "sais", "katar", "blade", "edge", "slash", "stab", "thrust", "parry", "riposte", "disarm", "deflect", "counter", "combo", "finish move", "finishers", "finishing move", "ultimate slash", "ultimate stab", "heavy attack", "light attack", "power attack", "weak point", "critical hit", "critical", "crit", "headshot", "neckshot", "bodyshot", "weakspot"] },
  { cats: "melee", keys: ["energy katana", "plasma sword", "plasma", "vibroblade", "monomolecular edge", "monomolecular kama", "mono molecular", "vibroedge", "hyperblade", "neural blade", "psychoblade", "spirit blade", "phantom blade", "spirit slash", "soul cutter", "spirit sword", "ghost blade", "shadow blade", "dark blade", "void blade", "void edge", "dimensional blade", "reality blade", "concept blade", "idea blade", "thought blade", "mind blade"] },
  { cats: "melee", keys: ["bastard sword", "hand-and-a-half sword", "two-handed sword", "claymore", "great sword", "greatsword", "two-hand sword", "zwei händer", "grete sword", "hyperbolic sword", "ultra sword", "mega sword", "excalibur", "king arthur", "excalibur sword", "north star", "imperial gold", "golden sword", "gold blade", "golden katan", "golden blade", "golden edge", "golden point"] },
  { cats: "melee", keys: ["werewolf claw", "lycan claw", "werewolf paw", "lycan paw", "beast claw", "claw", "beast", "monster claw", "dragon claw", "dragon claw", "wyvern claw", "wyvern claw", "drake claw", "drake claw", "wyrm claw", "wyrm claw", "serpent", "snake", "snake", "serpent", "serpent", "serpent claw"] },
  { cats: "melee", keys: ["vampiric touch", "vampiric grip", "vampiric embrace", "vampiric fist", "vampire claw", "vampiric", "blood drain", "blood steal", "life steal", "life drain", "siphon life", "energy steal", "essence steal", "soul steal", "essence drain", "vampiric touch", "sanguine", "sanguine blade", "blood moon", "night prowler", "night"] },
  // Basic elements
  { cats: "air", keys: ["wind", "breeze", "gale", "zephyr", "hurricane", "tornado", "mist", "steam", "vapor", "smoke"] },
  { cats: "water", keys: ["river", "ocean", "lake", "stream", "waterfall", "rain", "flood", "tide", "wave", "droplet"] },
  { cats: "earth", keys: ["mountain", "hill", "valley", "soil", "dirt", "rock", "mount", "cliff", "canyon", "cave"] },
  { cats: "fireball", keys: ["fireball", "flameball", "inferno", "blaze", "wildfire", "conflagration", "combustion", "pyro", "magma", "lava"] },
  { cats: "explosive", keys: ["bazooka", "rocket", "grenade", "dynamite", "c4", "tnt", "explosion", "detonation"] },
  { cats: "frostbite", keys: ["frostbite", "frost", "freeze", "icebrand", "glacier", "permafrost", "chill", "arctic", "snow", "blizzard"] },
  { cats: "lightning", keys: ["lightning", "thunder", "storm", "thunderbolt", "stormcloud", "strike", "discharge", "flash", "bolt", "thundershower"] },
  { cats: "ice2", keys: ["ice2", "glacier2", "arctic2", "snow2", "hail2", "icicle2", "permafrost2", "freeze2", "cold2", "cool2"] },
  { cats: "poison2", keys: ["poison2", "toxin2", "venom2", "pollution2", "contamination2", "pollutant2", "venomous2", "toxic2", "hazard2", "danger2"] },
  { cats: "sound", keys: ["sound", "noise", "volume", "quiet", "loud", "silence", "music", "tone", "frequency", "pitch"] },
  { cats: "magic", keys: ["magic", "spell", "cast", "ritual", "enchant", "curse", "bless", "hex", "ward", "rune"] },
  { cats: "cyber2", keys: ["cyber2", "net", "web", "data", "code", "hack", "cybersecurity", "firewall2", "encryption", "server"] },
  { cats: "virus", keys: ["virus", "malware", "worm", "trojan", "spyware", "ransomware", "phishing", "scam", "breach", "hack"] },
  { cats: "dimensions", keys: ["dimensions", "universe", "reality", "multiverse", "parallel", "quantum", "string", "brane", "cosmos", "void"] },
  { cats: "temporal2", keys: ["temporal2", "time", "past", "future", "present", "eternity", "moment", "epoch", "age", "era"] },
  { cats: "force", keys: ["force", "power", "energy", "strength", "might", "might2", "violence", "attack", "strike", "impact"] },
  { cats: "heat", keys: ["heat", "temperature", "warm", "hot", "boiling", "scalding", "fever", "thermal", "heatwave", "thermal"] },
  { cats: "cold2", keys: ["cold2", "freezing", "freeze2", "ice2", "frost2", "arctic2", "arctic", "snow2", "blizzard2", "chill2"] },
  { cats: "light2", keys: ["light2", "glow2", "shine2", "glimmer2", "flash2", "flare2", "blaze2", "combustion2", "ignite2", "spark2"] },
  // ANIME CHARACTERS - key names for recognition
  // These are the most recognizable anime protagonists and their signature abilities
  { cats: "anime", keys: ["naruto", "uzumaki", "shadow clone", "rasengan", "senjutsu", "sage mode"] },
  { cats: "anime", keys: ["emon", "sharingan", "mangekyou", "rinnegan", "susanoo"] },
  { cats: "anime", keys: ["luffy", "gum gum", "gear 4"] },
  { cats: "anime", keys: ["eren", "titan", "attack"] },
  { cats: "anime", keys: ["levi", "cleaning", "squad", "captain"] },
  { cats: "anime", keys: ["goku", "super sayan", "spirit bomb"] },
  { cats: "anime", keys: ["ichigo", "zanpakuto", "bankai"] },
  { cats: "anime", keys: ["asuna", "sword art online", "kirito"] },
  { cats: "anime", keys: ["light yagami", "death note", "shinigami"] },
  { cats: "anime", keys: ["saber", "excalibur", "king arthur"] },
  { cats: "anime", keys: ["tanjirou", "nezuko", "demon", "nichirin", "kill", "hashira"] },
  { cats: "anime", keys: ["deku", "one for all", "orangutan", "detroit smash", "motorcyle", "character design"] },
  { cats: "anime", keys: ["lingering", "giyu", "water breathing", "flower"] },
  { cats: "anime", keys: ["yonko", "blackbeard", "whitebeard", "ace", "hinata", "sakura"] },
  // COMPANION ANIMALS - key names for recognition
  // These are recognizable animals/pets that function as companions
  { cats: "companion", keys: ["aslan", "aslan kavgalı", "lion", "tiger", "leopard", "kavgalı aslan", "kopek", "hund", "dog", "horse", "at", "atlı"] },
  // ---- TURKCE KAVRAMLAR (Turkce karakter yazmadan, norm() sadelestirir) ----
  { cats: "melee", keys: ["kilic", "bicak", "balta", "mizrak", "sopa", "hancer", "pala", "kama", "tirpan", "teber", "kilici"] },
  { cats: "weapon", keys: ["tabanca", "tufek", "silah", "mermi", "pompali", "makineli", "av tufegi", "revolver", "top tufegi"] },
  { cats: "explosive", keys: ["bomba", "el bombasi", "roket", "bazuka", "mayin", "dinamit", "patlayici", "hava roketi"] },
  { cats: "fireball", keys: ["ates", "ates topu", "alev", "yangin", "atesli", "ates puskurten"] },
  { cats: "frostbite", keys: ["buz", "kar topu", "dondurucu", "buzul", "buzlanma", "kar firtinasi"] },
  { cats: "lightning", keys: ["simsek", "yildirim", "elektrik", "firtina", "simsek cakmasi", "yildirim cakmasi"] },
  { cats: "water", keys: ["su topu", "okyanus", "nehir", "gol", "sel", "dalga", "deniz", "su baskini"] },
  { cats: "air", keys: ["ruzgar", "kasirga", "hortum", "hava akimi", "siklon"] },
  { cats: "earth", keys: ["tas", "kaya", "toprak", "dag", "magara", "kum", "kaya parcasi"] },
  { cats: "monster", keys: ["canavar", "zombi", "iskelet", "dev", "troll", "ork", "goblin", "ucube", "gulyabani"] },
  { cats: "dragon", keys: ["ejderha", "ejder", "ejderhasi"] },
  { cats: "shield", keys: ["kalkan", "zirh", "kask", "siper", "koruyucu kalkan"] },
  { cats: "medic", keys: ["sifa", "ilac", "iyilestirme", "sifa otu", "doktor cantasi", "saglik"] },
  { cats: "vehicle", keys: ["araba", "ucak", "tank", "motorsiklet", "gemi", "helikopter", "arac", "jet"] },
  { cats: "food", keys: ["ekmek", "elma", "pizza", "hamburger", "yemek", "meyve", "dondurma", "pasta"] },
  { cats: "magic", keys: ["buyu", "sihir", "asa", "buyucu", "tilsim", "buyulu"] },
  { cats: "cyber2", keys: ["robot", "bilgisayar", "lazer", "drone", "yapay zeka", "lazer silahi", "lazer kilici"] },
  { cats: "animal", keys: ["kaplan", "kurt", "ayi", "kartal", "yilan", "kedi", "fil", "maymun", "timsah", "dinozor", "balik", "kus", "koyun", "inek", "tavsan", "bocek"] },
  // Dynamic learning allows unlimited additional anime characters to be added via localStorage
];

// Dynamic learned concepts storage (localStorage persistence)
const learnedKey = "cubemind_learned";
function loadLearnedConcepts() {
  try {
    const stored = localStorage.getItem(learnedKey);
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
}
function saveLearnedConcepts(conceptData) {
  try {
    localStorage.setItem(learnedKey, JSON.stringify(conceptData));
  } catch (e) {/* offline fallback */}
}

// Smart concept finder with fuzzy matching, bigrams, and learning
function findConcept(text) {
  const t = (text || "").toLocaleLowerCase("tr")
    .replaceAll("ı", "i")
    .replaceAll("İ", "i")
    .replace("'", "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (!t) return null;

  // First check main CONCEPTS dictionary
  for (const c of CONCEPTS) {
    for (const key of c.keys) {
      const normKey = key.toLocaleLowerCase("tr")
        .replaceAll("ı", "i")
        .replaceAll("İ", "i")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

      // Exact match
      if (t === normKey) return { ...c, match: "exact" };
      // Contains match
      if (t.includes(normKey) || normKey.includes(t)) return { ...c, match: "contains" };
      // Word boundary match
      const words = t.split(" ");
      if (words.includes(normKey)) return { ...c, match: "word" };
    }
  }

  // Check learned concepts from localStorage
  const learned = loadLearnedConcepts();
  if (learned[t]) {
    return { ...learned[t], match: "learned" };
  }

  // Check for multi-word phrases (2-word combos) from main dictionary
  const words = t.split(" ");
  if (words.length >= 2) {
    const bigram = words[0] + " " + words[1];
    for (const c of CONCEPTS) {
      if (c.keys.some(k => bigram.includes(k))) {
        return { ...c, match: "bigram" };
      }
    }
  }

  // If not found, create a new learned concept and save it
  const learnedConcept = {
    cats: "utility",
    label: t,
    stars: 1,
    match: "new"
  };
  const newConcept = { ...learnedConcept, match: "new" };
  saveLearnedConcepts({ [t]: newConcept });
  return newConcept;
}

// Item generation function
function generateItem(rawText) {
  const text = String(rawText || "").slice(0, 60);
  const concept = findConcept(text);
  const t = (text || "").toLocaleLowerCase("tr")
    .replaceAll("ı", "i")
    .replaceAll("İ", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  // Define modifier keywords for cost adjustment
  const POWER_WORDS = ["power", "mega", "hyper", "ultra", "super"];
  const MINI_WORDS = ["mini", "kucuk", "small", "pocket"];
  const SIZE_MULTIPLIERS = ["boyut", "buyuk", "large", "gigantic"];
  const DOUBLE_WORDS = ["çift", "double", "×1.5", "×2"];

  // Determine element from text
  const elementKeys = ["fire", "ice", "electricity", "poison", "lightning", "light"];
  const element = elementKeys.reduce((acc, key) => {
    if (t.includes(key)) {
      const elements = {
        fire: { bonus: 20, label: "Yangin", color: 0xff5555 },
        ice: { bonus: 15, label: "Buz", color: 0x88ccff },
        electricity: { bonus: 15, label: "Düşün", color: 0xffd93d },
        poison: { bonus: 15, label: "Zararlı", color: 0x8b572a },
        lightning: { bonus: 20, label: "Thunder", color: 0x9b59b6 },
        light: { bonus: 10, label: "Işık", color: 0xffd700 }
      };
      return elements[key];
    }
    return null;
  }, null);

  // Determine category
  const category = concept ? concept.cats : "utility";
  const cat = CATEGORIES[category];
  let base = cat ? cat.base : 50;

  // Apply element bonus
  if (element && element.bonus) base += element.bonus;

  // Clamp cost between 10 and 290, round to nearest 5
  const hasModifier = POWER_WORDS.some((w) => t.includes(w)) || MINI_WORDS.some((w) => t.includes(w)) || SIZE_MULTIPLIERS.some((w) => t.includes(w)) || DOUBLE_WORDS.some((w) => t.includes(w));
  let defaultBonus = hasModifier ? 0 : 20;

  let cost = Math.max(10, Math.min(290, Math.round((base + defaultBonus) / 5) * 5));

  // Apply category-based damage/behavior
  let damage = 10;
  let cooldown = 0.5;
  let splash = 0;
  let speed = 36;
  let range = 2.8;

  if (cat) {
    damage = Math.round(16 + (concept ? 2 : 1) * 2.2);
    cooldown = 0.5;
  }

  damage = Math.max(1, Math.round(damage * (cost / 100)));
  cooldown = Math.max(0.1, cooldown * (100 / Math.max(cost, 10)));

  const label = (concept && concept.label) ? concept.label : (t ? t.slice(0, 20) : "İçerik");
  const palette = cat ? [cat.color ?? cat.glow, cat.glow] : [0xffffff, 0x35d0ff];

  // Üretim süresi maliyetle büyür (1.2s - 6s)
  const duration = Math.max(1.2, Math.min(6, Math.round((cost / 40) * 10) / 10));

  // Aynı eşleşme her zaman aynı kimliği alsın (cooldown takibi için)
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
  const id = Math.abs(h) % 100000;

  const stats = { damage, cooldown, splash, speed, range, selfHeal: 0 };

  return {
    id,
    input: text,
    label,
    labelEn: label,
    cost,
    category,
    behavior: cat ? cat.behavior : "support",
    duration,
    power: Math.max(1, Math.round(cost / 10)),
    stats,
    // eski alanlarla geriye dönük uyumluluk
    damage,
    cooldown,
    splash,
    speed,
    range,
    selfHeal: 0,
    element: element ? element.label : null,
    palette
  };
}

// Export the generateItem function
export { generateItem };

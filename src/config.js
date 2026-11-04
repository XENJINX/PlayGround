// NEXUS — one tower, six forms.
// Central balance and content data.

export const WORLD = Object.freeze({ width: 800, height: 640 });
export const TOWER_POS = Object.freeze({ x: 400, y: 370 });
export const TOWER_RADIUS = 42;

export const MAX_WAVES = 20;
export const START_GOLD = 260;
export const START_LIVES = 20;
export const MAX_LEVEL = 10;

// Cost to go from level 1 -> 2, 2 -> 3, ... 9 -> 10.
export const UPGRADE_COSTS = [60, 100, 160, 240, 360, 520, 740, 1000, 1350];

export const REFORGE_COOLDOWN = 2.2;
export const OVERDRIVE_DURATION = 4;
export const OVERDRIVE_RATE = 1.35;
export const OVERDRIVE_RANGE = 1.06;

export const TARGET_MODES = [
  { id: 'first', label: 'FIRST', hint: 'closest to exit' },
  { id: 'last', label: 'LAST', hint: 'furthest from exit' },
  { id: 'strong', label: 'STRONG', hint: 'highest integrity' },
  { id: 'close', label: 'CLOSE', hint: 'nearest the core' },
];

export const FORMS = {
  pulse: {
    name: 'PULSE',
    role: 'RAPID',
    color: '#5ff4ff',
    cost: 45,
    tagline: 'Homing bolt array',
    description:
      'Twin emitters fire rapid homing bolts. Dependable single-target pressure with no blind spots.',
    interval: 0.3,
    damage: 16,
    range: 275,
    projectileSpeed: 940,
  },
  mortar: {
    name: 'MORTAR',
    role: 'SPLASH',
    color: '#ffb454',
    cost: 95,
    tagline: 'Arc-shell battery',
    description:
      'Lobs predictive shells that detonate in a wide radius. Punishes dense packs and long lanes.',
    interval: 1.3,
    damage: 48,
    range: 330,
    splash: 76,
    travel: 0.7,
  },
  cryo: {
    name: 'CRYO',
    role: 'CONTROL',
    color: '#9dc8ff',
    cost: 75,
    tagline: 'Cryo shard projector',
    description:
      'Shards burst into freezing mist, slowing targets and amplifying all damage they take by 30%.',
    interval: 0.72,
    damage: 10,
    range: 275,
    splash: 48,
    slow: 0.45,
    slowDuration: 2.6,
    amp: 0.3,
    ampDuration: 2.2,
    projectileSpeed: 640,
  },
  blaze: {
    name: 'BLAZE',
    role: 'BURN',
    color: '#ff744f',
    cost: 85,
    tagline: 'Plasma cone',
    description:
      'A searing short-range cone that scorches every target in front of it and leaves them burning.',
    interval: 0.14,
    damage: 7.5,
    range: 185,
    cone: 58,
    burnDps: 7,
    burnDuration: 2.4,
  },
  tesla: {
    name: 'TESLA',
    role: 'CHAIN',
    color: '#c995ff',
    cost: 120,
    tagline: 'Arc capacitor',
    description:
      'Unleashes chained lightning across nearby targets. Each jump loses a little power but hits another body.',
    interval: 0.8,
    damage: 21,
    range: 270,
    chains: 3,
    chainRange: 132,
    falloff: 0.87,
  },
  rail: {
    name: 'RAIL',
    role: 'PIERCE',
    color: '#ff6f9c',
    cost: 150,
    tagline: 'Singularity lance',
    description:
      'Charges a hypervelocity lance that pierces every hostile in a line. The answer to bosses and armor columns.',
    interval: 2,
    damage: 135,
    range: 430,
    charge: 0.45,
    pierce: 18,
  },
};

export const FORM_ORDER = ['pulse', 'mortar', 'cryo', 'blaze', 'tesla', 'rail'];

export const FORM_ICONS = {
  pulse:
    '<path d="M3 12h5l2.2-7 3.6 14 2.2-7H21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  mortar:
    '<circle cx="13" cy="15" r="5.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 10.5 12 3l3 6.8M11 9.8h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  cryo:
    '<path d="M12 2.5v19M4 7.2l16 9.6M20 7.2 4 16.8M9 4.4l3 2 3-2M9 19.6l3-2 3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  blaze:
    '<path d="M12 2.6c3.2 4.2 5.4 5.9 5.4 9.5a5.4 5.4 0 0 1-10.8 0c0-2 .9-3.4 2.3-4.6.4 1.5 1.4 2.1 2.4 2.2C11 6.7 11.4 4.5 12 2.6Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 20.4c-1.7 0-3-1.2-3-2.8 0-1.4 1.2-2.3 2.9-4 1.6 1.7 3 2.6 3 4 0 1.6-1.2 2.8-2.9 2.8Z" fill="currentColor" opacity=".55"/>',
  tesla:
    '<path d="M13.4 2 5 13.4h5.6L9.8 22 19 10.2h-6L13.4 2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  rail:
    '<path d="M3 7.5h12M3 16.5h12M17 6l4 6-4 6M15 12h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
};

export const ENEMY_TYPES = {
  drone: {
    name: 'DRONE',
    hp: 40,
    speed: 92,
    gold: 5,
    score: 10,
    radius: 13,
    color: '#ff5b9e',
    lives: 1,
  },
  runner: {
    name: 'RUNNER',
    hp: 25,
    speed: 158,
    gold: 4,
    score: 12,
    radius: 10,
    color: '#ffa64d',
    lives: 1,
  },
  brute: {
    name: 'BRUTE',
    hp: 170,
    speed: 64,
    gold: 12,
    score: 28,
    radius: 20,
    color: '#ff7a45',
    lives: 2,
  },
  shield: {
    name: 'AEGIS',
    hp: 85,
    shield: 75,
    speed: 80,
    gold: 10,
    score: 24,
    radius: 15,
    color: '#7aa8ff',
    lives: 1,
  },
  splitter: {
    name: 'SPLITTER',
    hp: 105,
    speed: 84,
    gold: 8,
    score: 20,
    radius: 16,
    color: '#b06bff',
    lives: 1,
    split: true,
  },
  shard: {
    name: 'SHARD',
    hp: 30,
    speed: 136,
    gold: 0,
    score: 4,
    radius: 8,
    color: '#cf9aff',
    lives: 1,
  },
  boss: {
    name: 'BOSS',
    hp: 900,
    speed: 46,
    gold: 70,
    score: 300,
    radius: 31,
    color: '#ff3d5e',
    lives: 5,
    slowResist: 0.55,
    boss: true,
  },
};

export const BOSS_NAMES = {
  5: 'GOLIATH',
  10: 'LEVIATHAN',
  15: 'OBLIVION',
  20: 'SINGULARITY',
};

export const ENEMY_ORDER = ['drone', 'runner', 'brute', 'shield', 'splitter'];

export function getFormStats(formId, level) {
  const form = FORMS[formId];
  const damageMult = 1 + 0.33 * (level - 1);
  const rateMult = 1 + 0.075 * (level - 1);
  const damage = form.damage * damageMult;
  const interval = form.interval / rateMult;
  const range = form.range + 11 * (level - 1);
  const chains = form.chains ? form.chains + Math.floor((level - 1) / 3) : 0;
  let dps = damage / interval;
  if (form.chains) {
    let chainMult = 1;
    for (let i = 0; i < chains - 1; i += 1) chainMult += form.falloff ** (i + 1);
    dps *= chainMult;
  }
  return {
    damage,
    interval,
    rate: 1 / interval,
    range,
    chains,
    dps,
    damageMult,
    rateMult,
    slow: form.slow ? Math.min(0.65, form.slow + (level - 1) * 0.012) : 0,
    burnDps: form.burnDps ? form.burnDps * damageMult : 0,
  };
}

export function upgradeCost(level) {
  if (level >= MAX_LEVEL) return null;
  return UPGRADE_COSTS[level - 1];
}

function hashSeed(seed, wave) {
  let h = (seed ^ Math.imul(wave + 1, 374761393)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(a) {
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rng, pool) {
  let total = 0;
  for (const item of pool) total += item[1];
  let roll = rng() * total;
  for (const item of pool) {
    roll -= item[1];
    if (roll <= 0) return item[0];
  }
  return pool[pool.length - 1][0];
}

export function buildWave(wave, seed = 1337) {
  const rng = mulberry32(hashSeed(seed, wave));
  const boss = wave % 5 === 0;
  const baseCount = Math.min(30, 7 + Math.round(wave * 1.15));
  const count = boss ? Math.max(4, Math.round(baseCount * 0.8)) : baseCount;
  const pool = [['drone', 4.5]];
  if (wave >= 2) pool.push(['runner', Math.min(3, 1.5 + wave * 0.06)]);
  if (wave >= 3) pool.push(['brute', 1.2]);
  if (wave >= 4) pool.push(['shield', 0.9 + wave * 0.02]);
  if (wave >= 6) pool.push(['splitter', 0.85]);

  const entries = [];
  let at = 0;
  const baseInterval = Math.max(0.32, 0.6 - wave * 0.012);
  for (let i = 0; i < count; i += 1) {
    entries.push({ type: pickWeighted(rng, pool), at });
    at += baseInterval * (0.7 + rng() * 0.6);
  }

  const counts = {};
  for (const entry of entries) counts[entry.type] = (counts[entry.type] || 0) + 1;

  let bossHp = 0;
  if (boss) {
    bossHp = Math.round(900 * (1 + 0.3 * (wave - 5)));
    entries.push({ type: 'boss', at: at + 0.9 });
    counts.boss = 1;
  }

  return {
    wave,
    boss,
    bossHp,
    bossName: BOSS_NAMES[wave] || 'TITAN',
    entries,
    counts,
    total: entries.length,
    hpMul: 1 + 0.15 * (wave - 1) + 0.0065 * (wave - 1) ** 2,
    goldMul: 1 + 0.04 * (wave - 1),
    bonus: 25 + wave * 8,
  };
}

export function describeComposition(counts) {
  return ENEMY_ORDER.filter((id) => counts[id]).map((id) => ({
    id,
    name: ENEMY_TYPES[id].name,
    count: counts[id],
    color: ENEMY_TYPES[id].color,
  }));
}

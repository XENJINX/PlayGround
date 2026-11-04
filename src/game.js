import {
  WORLD,
  TOWER_POS,
  TOWER_RADIUS,
  MAX_WAVES,
  START_GOLD,
  START_LIVES,
  MAX_LEVEL,
  REFORGE_COOLDOWN,
  OVERDRIVE_DURATION,
  OVERDRIVE_RATE,
  OVERDRIVE_RANGE,
  FORMS,
  TARGET_MODES,
  ENEMY_TYPES,
  buildWave,
  getFormStats,
  upgradeCost,
} from './config.js';
import { buildPath } from './path.js';

const PATH_VERTS = [
  { x: -40, y: 110 },
  { x: 660, y: 110 },
  { x: 660, y: 290 },
  { x: 130, y: 290 },
  { x: 130, y: 470 },
  { x: 840, y: 470 },
];

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

function dist2(ax, ay, bx, by) {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

function poly(ctx, x, y, r, sides, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const a = rot + (i / sides) * TAU;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem('nexus-best') || '{}');
  } catch {
    return {};
  }
}

function saveBest(best) {
  try {
    localStorage.setItem('nexus-best', JSON.stringify(best));
  } catch {
    /* storage may be unavailable */
  }
}

export class Game {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = options.audio || null;
    this.onEvent = options.onEvent || (() => {});
    this.speed = 1;
    this.paused = false;
    this.mode = 'menu';
    this.time = 0;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = WORLD.width * dpr;
    canvas.height = WORLD.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.path = buildPath(PATH_VERTS, 56, 5);
    this.path2D = new Path2D();
    this.path.points.forEach((p, i) => {
      if (i === 0) this.path2D.moveTo(p.x, p.y);
      else this.path2D.lineTo(p.x, p.y);
    });
    this.bg = this.buildBackground();

    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.best = loadBest();
    this.resetState();
    this.mode = 'menu';
    this.preview = buildWave(1, this.seed);
    this.enemies = [];
    this.waveInfo = null;

    this.lastTs = performance.now();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  resetState() {
    this.wave = 0;
    this.lives = START_LIVES;
    this.gold = START_GOLD;
    this.score = 0;
    this.kills = 0;
    this.level = 1;
    this.form = 'pulse';
    this.targetMode = 'first';
    this.enemies = [];
    this.projectiles = [];
    this.beams = [];
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.spawnQueue = [];
    this.spawnClock = 0;
    this.waveInfo = null;
    this.preview = buildWave(1, this.seed);
    this.mode = 'menu';
    this.paused = false;
    this.towerCooldown = 0;
    this.blazeTick = 0;
    this.railCharge = null;
    this.railRecoil = 0;
    this.reforgeCool = 0;
    this.overdrive = 0;
    this.aimAngle = -Math.PI / 2;
    this.shake = 0;
    this.flash = 0;
    this.boss = null;
    this.muzzle = 0;
    this.firingBlaze = false;
    this.refreshFx = 0;
    this.upgradeFx = 0;
    this.reforgeFx = 0;
    this.spawnFx = 0;
    this.idCounter = 1;
    this.nextTextId = 1;
  }

  emit(type, data = {}) {
    try {
      this.onEvent({ type, ...data });
    } catch (err) {
      console.error(err);
    }
  }

  startRun() {
    this.resetState();
    this.mode = 'prep';
    this.paused = false;
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.preview = buildWave(1, this.seed);
    this.aimAngle = -Math.PI / 2;
    this.emit('runStart');
    this.particles.length = 0;
    this.burst(TOWER_POS.x, TOWER_POS.y, FORMS.pulse.color, 30, 180, 3.2, 0.9);
    this.ring(TOWER_POS.x, TOWER_POS.y, FORMS.pulse.color, 30, 110, 0.7);
    this.audio?.upgrade();
  }

  startWave() {
    if (this.mode !== 'prep') return false;
    const next = Math.min(MAX_WAVES, this.wave + 1);
    this.wave = next;
    this.waveInfo = buildWave(next, this.seed);
    this.preview = null;
    this.spawnQueue = this.waveInfo.entries.map((e) => ({ ...e }));
    this.spawnClock = 0;
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.beams.length = 0;
    this.railCharge = null;
    this.blazeTick = 0;
    this.mode = 'wave';
    this.paused = false;
    this.audio?.waveStart(this.waveInfo.boss);
    this.emit('waveStart', {
      wave: next,
      boss: this.waveInfo.boss,
      bossName: this.waveInfo.bossName,
      total: this.waveInfo.total,
    });
    return true;
  }

  canAct() {
    return (this.mode === 'prep' || this.mode === 'wave') && !this.paused;
  }

  upgrade() {
    if (!this.canAct()) return { ok: false, message: 'SYSTEM LOCKED' };
    if (this.level >= MAX_LEVEL) return { ok: false, message: 'CORE AT MAX OUTPUT' };
    const cost = upgradeCost(this.level);
    if (this.gold < cost) return { ok: false, message: 'INSUFFICIENT CREDITS' };
    this.gold -= cost;
    this.level += 1;
    this.upgradeFx = 0.75;
    this.towerPulse = 1;
    this.audio?.upgrade();
    this.emit('upgrade', { level: this.level, cost });
    return { ok: true };
  }

  reforge(formId) {
    if (!this.canAct()) return { ok: false, message: 'SYSTEM LOCKED' };
    if (!FORMS[formId]) return { ok: false, message: 'UNKNOWN FORM' };
    if (this.form === formId) return { ok: false, message: 'FORM ALREADY ACTIVE' };
    if (this.reforgeCool > 0) {
      return { ok: false, message: `REFORGE COOLING ${this.reforgeCool.toFixed(1)}s` };
    }
    const cost = FORMS[formId].cost;
    if (this.gold < cost) return { ok: false, message: 'INSUFFICIENT CREDITS' };
    this.gold -= cost;
    this.form = formId;
    this.reforgeCool = REFORGE_COOLDOWN;
    this.overdrive = OVERDRIVE_DURATION;
    this.railCharge = null;
    this.blazeTick = 0;
    this.reforgeFx = 0.8;
    this.muzzle = 0.1;
    this.audio?.reforge();
    this.emit('reforge', { form: formId, name: FORMS[formId].name, cost });
    return { ok: true };
  }

  setTargetMode(id) {
    if (!TARGET_MODES.some((m) => m.id === id)) return;
    this.targetMode = id;
    this.audio?.ui();
    this.emit('target', { mode: id });
  }

  cycleTarget() {
    const i = TARGET_MODES.findIndex((m) => m.id === this.targetMode);
    this.setTargetMode(TARGET_MODES[(i + 1) % TARGET_MODES.length].id);
  }

  togglePause() {
    if (this.mode !== 'prep' && this.mode !== 'wave') return;
    this.paused = !this.paused;
    this.audio?.ui();
    this.emit('pause', { paused: this.paused });
  }

  setPaused(paused) {
    if (this.mode !== 'prep' && this.mode !== 'wave') return;
    this.paused = paused;
    this.emit('pause', { paused });
  }

  setSpeed(speed) {
    this.speed = speed;
    this.emit('speed', { speed });
  }

  getStats() {
    return getFormStats(this.form, this.level);
  }

  getUI() {
    const stats = this.getStats();
    const wave = this.waveInfo;
    let boss = null;
    if (this.boss && !this.boss.dead) {
      boss = {
        name: this.boss.bossName || 'TITAN',
        hp: Math.max(0, this.boss.hp + this.boss.shield),
        maxHp: this.boss.maxHp + this.boss.maxShield,
      };
    }
    return {
      mode: this.mode,
      paused: this.paused,
      speed: this.speed,
      wave: this.wave,
      maxWaves: MAX_WAVES,
      nextWave: Math.min(MAX_WAVES, this.wave + 1),
      lives: this.lives,
      gold: this.gold,
      score: this.score,
      kills: this.kills,
      level: this.level,
      maxLevel: MAX_LEVEL,
      form: this.form,
      targetMode: this.targetMode,
      stats,
      upgradeCost: upgradeCost(this.level),
      reforgeCool: this.reforgeCool,
      overdrive: this.overdrive,
      preview: this.preview,
      activeEnemies: this.enemies.filter((e) => !e.dead).length,
      remainingSpawns: this.spawnQueue.length,
      waveInfo: wave,
      boss,
      best: this.best,
    };
  }

  frame(ts) {
    const rawDt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    const dt = clamp(Number.isFinite(rawDt) ? rawDt : 0, 0, 0.05);

    if (this.mode === 'menu') {
      this.update(dt);
    } else if (!this.paused && (this.mode === 'prep' || this.mode === 'wave')) {
      let remaining = dt * this.speed;
      let guard = 0;
      while (remaining > 0 && guard < 8) {
        const step = Math.min(remaining, 1 / 60);
        this.update(step);
        remaining -= step;
        guard += 1;
      }
    } else {
      this.updateVisuals(dt * 0.35);
    }

    this.render();
    requestAnimationFrame(this.frame);
  }

  updateVisuals(dt) {
    this.time += dt;
    this.updateParticles(dt);
    this.updateTexts(dt);
    this.updateRings(dt);
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.railRecoil = Math.max(0, this.railRecoil - dt * 5);
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.refreshFx = Math.max(0, this.refreshFx - dt);
    this.upgradeFx = Math.max(0, this.upgradeFx - dt);
    this.reforgeFx = Math.max(0, this.reforgeFx - dt);
    this.spawnFx = Math.max(0, this.spawnFx - dt);
  }

  update(dt) {
    this.time += dt;
    this.reforgeCool = Math.max(0, this.reforgeCool - dt);
    this.overdrive = Math.max(0, this.overdrive - dt);
    this.towerCooldown = Math.max(0, this.towerCooldown - dt);
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.railRecoil = Math.max(0, this.railRecoil - dt * 5);
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.refreshFx = Math.max(0, this.refreshFx - dt);
    this.upgradeFx = Math.max(0, this.upgradeFx - dt);
    this.reforgeFx = Math.max(0, this.reforgeFx - dt);
    this.spawnFx = Math.max(0, this.spawnFx - dt);

    this.updateParticles(dt);
    this.updateTexts(dt);
    this.updateRings(dt);

    if (this.mode === 'wave') {
      this.spawnClock += dt;
      this.drainSpawnQueue();
      this.updateEnemies(dt);
      if (this.mode !== 'wave') return;
      this.updateTower(dt);
      this.updateProjectiles(dt);
      this.updateBeams(dt);
      this.enemies = this.enemies.filter((e) => !e.dead);
      if (this.mode === 'wave') this.checkWaveEnd();
    } else {
      this.firingBlaze = false;
      this.aimAngle += dt * 0.32;
      if (this.railCharge) this.railCharge = null;
    }
  }

  advance(seconds) {
    if (!Number.isFinite(seconds)) return;
    const wasPaused = this.paused;
    this.paused = false;
    let remaining = seconds;
    let guard = 0;
    while (remaining > 0 && guard < 200000) {
      const step = Math.min(remaining, 1 / 60);
      this.update(step);
      remaining -= step;
      guard += 1;
      if (this.mode === 'gameover' || this.mode === 'victory') break;
    }
    this.paused = wasPaused;
  }

  drainSpawnQueue() {
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.spawnClock) {
      const entry = this.spawnQueue.shift();
      this.spawnEnemy(entry.type);
    }
  }

  spawnEnemy(type, distance = 0, opts = {}) {
    const def = ENEMY_TYPES[type];
    if (!def) return null;
    const wave = this.waveInfo || buildWave(Math.max(1, this.wave), this.seed);
    let hp = def.hp * (wave.hpMul || 1);
    if (type === 'shard' && opts.hp) hp = opts.hp;
    if (type === 'boss') hp = wave.bossHp;
    const maxHp = Math.max(1, Math.round(hp));
    const shield = Math.round((def.shield || 0) * (wave.hpMul || 1));
    const sample = this.path.sample(distance);
    const enemy = {
      id: this.idCounter++,
      type,
      x: sample.x,
      y: sample.y,
      angle: sample.angle,
      dist: distance,
      distOffset: distance,
      hp: maxHp,
      maxHp,
      shield,
      maxShield: shield,
      speed: def.speed * (opts.speedMul || 1),
      radius: def.radius,
      color: def.color,
      gold: Math.round(def.gold * (wave.goldMul || 1)),
      score: def.score,
      lives: def.lives || 1,
      slowResist: def.slowResist || 0,
      boss: !!def.boss,
      bossName: def.boss ? wave.bossName : '',
      split: !!def.split,
      dead: false,
      slowTime: 0,
      slowAmount: 0,
      ampTime: 0,
      burnTime: 0,
      burnDps: 0,
      burnAcc: 0,
      spin: Math.random() * TAU,
      bob: Math.random() * TAU,
      spawnScale: 0,
      lastHit: -10,
    };
    this.enemies.push(enemy);
    if (enemy.boss) {
      this.boss = enemy;
      this.shake = 10;
      this.emit('bossSpawn', { name: enemy.bossName, hp: maxHp });
    }
    this.ring(sample.x, sample.y, def.color, 8, 34, 0.35);
    return enemy;
  }

  updateEnemies(dt) {
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i];
      if (e.dead) continue;
      e.spawnScale = Math.min(1, e.spawnScale + dt * 6);
      e.burnAcc = e.burnAcc || 0;

      if (e.slowTime > 0) e.slowTime = Math.max(0, e.slowTime - dt);
      if (e.ampTime > 0) e.ampTime = Math.max(0, e.ampTime - dt);

      if (e.burnTime > 0) {
        e.burnTime = Math.max(0, e.burnTime - dt);
        e.burnAcc += e.burnDps * dt;
        if (e.burnAcc >= 4) {
          const amount = e.burnAcc;
          e.burnAcc = 0;
          this.damageEnemy(e, amount, { dot: true, silent: amount < 8 });
          if (e.dead) continue;
        }
        if (Math.random() < dt * 9) {
          this.addParticle(e.x + (Math.random() - 0.5) * e.radius, e.y - e.radius * 0.4, {
            vx: (Math.random() - 0.5) * 18,
            vy: -30 - Math.random() * 25,
            size: 2 + Math.random() * 2.5,
            color: Math.random() > 0.5 ? '#ff8a4f' : '#ffd166',
            life: 0.4,
            maxLife: 0.4,
            drag: 0.9,
            additive: true,
          });
        }
      }

      const speedMul = e.slowTime > 0 ? 1 - e.slowAmount : 1;
      e.dist += e.speed * speedMul * dt;
      const sample = this.path.sample(e.dist);
      e.x = sample.x;
      e.y = sample.y;
      e.angle = sample.angle;
      e.spin += dt * (e.boss ? 0.35 : 1.2);

      if (e.dist >= this.path.length) {
        this.enemies.splice(i, 1);
        this.leak(e);
        if (this.mode !== 'wave') return;
      }
    }
  }

  leak(enemy) {
    this.lives = Math.max(0, this.lives - (enemy.lives || 1));
    this.flash = 0.9;
    this.shake = 12;
    this.audio?.leak();
    const end = this.path.sample(this.path.length - 8);
    this.burst(end.x, end.y, '#ff3d5e', 22, 150, 3, 0.8);
    this.ring(end.x, end.y, '#ff3d5e', 10, 90, 0.6);
    this.emit('leak', { lives: this.lives, enemy: enemy.type });
    if (enemy.boss) this.boss = null;
    if (this.lives <= 0) this.finish(false);
  }

  damageEnemy(enemy, amount, opts = {}) {
    if (!enemy || enemy.dead || this.mode === 'gameover' || this.mode === 'victory') return 0;
    let damage = Math.max(0, amount);
    if (enemy.ampTime > 0 && !opts.ignoreAmp) damage *= 1.3;
    let dealt = 0;

    if (enemy.shield > 0 && !opts.ignoreShield) {
      const absorbed = Math.min(enemy.shield, damage);
      enemy.shield -= absorbed;
      damage -= absorbed;
      dealt += absorbed;
      if (!opts.silent && absorbed > 0.5) {
        this.addText(enemy.x, enemy.y - enemy.radius, Math.round(absorbed), '#9dc8ff', 11);
      }
    }

    if (damage > 0) {
      enemy.hp -= damage;
      dealt += damage;
      if (!opts.silent && (this.time - enemy.lastHit > 0.06 || damage >= 18)) {
        enemy.lastHit = this.time;
        this.addText(
          enemy.x + (Math.random() - 0.5) * 12,
          enemy.y - enemy.radius - 2,
          Math.round(damage),
          opts.dot ? '#ffb454' : '#eafcff',
          damage >= 30 ? 16 : 12,
        );
      }
    }

    if (enemy.hp <= 0) this.killEnemy(enemy);
    return dealt;
  }

  killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    this.gold += enemy.gold;
    this.score += Math.round(enemy.score * (1 + this.wave * 0.06));
    this.kills += 1;
    this.audio?.death();
    this.burst(enemy.x, enemy.y, enemy.color, enemy.boss ? 70 : 14, enemy.boss ? 280 : 130, enemy.boss ? 5 : 2.6, 0.85);
    this.ring(enemy.x, enemy.y, enemy.color, 6, enemy.boss ? 160 : 42, enemy.boss ? 1.1 : 0.45);
    if (enemy.gold > 0) this.addText(enemy.x, enemy.y - enemy.radius - 12, `+${enemy.gold}`, '#7dffc4', 11);
    if (enemy.boss) {
      this.boss = null;
      this.shake = 18;
      this.flash = 0.35;
      this.audio?.bossDeath();
      this.emit('bossDeath', { name: enemy.bossName });
    }
    if (enemy.split) {
      const shardHp = Math.max(12, enemy.maxHp * 0.3);
      this.spawnEnemy('shard', Math.max(0, enemy.dist - 6), { hp: shardHp, speedMul: 1 });
      this.spawnEnemy('shard', Math.max(0, enemy.dist + 6), { hp: shardHp, speedMul: 1 });
    }
  }

  findTarget(range) {
    const candidates = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d2 = dist2(e.x, e.y, TOWER_POS.x, TOWER_POS.y);
      if (d2 <= (range + e.radius * 0.35) ** 2) candidates.push({ e, d2 });
    }
    if (!candidates.length) return null;
    let pick = candidates[0];
    switch (this.targetMode) {
      case 'first':
        for (const c of candidates) if (c.e.dist > pick.e.dist) pick = c;
        break;
      case 'last':
        for (const c of candidates) if (c.e.dist < pick.e.dist) pick = c;
        break;
      case 'strong':
        for (const c of candidates) {
          if (c.e.hp + c.e.shield > pick.e.hp + pick.e.shield) pick = c;
        }
        break;
      case 'close':
        for (const c of candidates) if (c.d2 < pick.d2) pick = c;
        break;
      default:
        break;
    }
    return pick.e;
  }

  updateTower(dt) {
    const stats = this.getStats();
    const overdrive = this.overdrive > 0;
    const range = stats.range * (overdrive ? OVERDRIVE_RANGE : 1);
    const target = this.findTarget(range);

    if (target) {
      const desired = Math.atan2(target.y - TOWER_POS.y, target.x - TOWER_POS.x);
      this.aimAngle = lerpAngle(this.aimAngle, desired, 1 - Math.exp(-16 * dt));
    } else {
      this.aimAngle += dt * 0.3;
    }

    this.firingBlaze = false;

    if (this.form === 'rail') {
      if (this.railCharge) {
        this.railCharge.t += dt;
        if (target) {
          this.railCharge.aim.x = target.x;
          this.railCharge.aim.y = target.y;
          this.railCharge.target = target;
        }
        if (this.railCharge.t >= this.railCharge.duration) {
          this.fireRail(stats, this.railCharge.aim);
          this.railCharge = null;
          this.towerCooldown = stats.interval / (overdrive ? OVERDRIVE_RATE : 1);
        }
      } else if (target && this.towerCooldown <= 0) {
        this.railCharge = {
          t: 0,
          duration: FORMS.rail.charge,
          aim: { x: target.x, y: target.y },
          target,
        };
      }
      return;
    }

    if (this.form === 'blaze') {
      if (target && this.towerCooldown <= 0) {
        this.firingBlaze = true;
        this.blazeTick -= dt;
        this.emitFlame(dt, range);
        if (this.blazeTick <= 0) {
          this.blazeTick = stats.interval / (overdrive ? OVERDRIVE_RATE : 1);
          this.blazeCone(stats, range);
          this.audio?.shoot('blaze');
        }
      } else {
        this.blazeTick = 0;
      }
      return;
    }

    if (target && this.towerCooldown <= 0) {
      const overdriveRate = overdrive ? OVERDRIVE_RATE : 1;
      this.towerCooldown = stats.interval / overdriveRate;
      if (this.form === 'pulse') this.firePulse(stats, target);
      else if (this.form === 'cryo') this.fireCryo(stats, target);
      else if (this.form === 'mortar') this.fireMortar(stats, target);
      else if (this.form === 'tesla') this.fireTesla(stats, target);
    }
  }

  muzzlePoint(angleOffset = 0) {
    const a = this.aimAngle + angleOffset;
    return {
      x: TOWER_POS.x + Math.cos(a) * 38,
      y: TOWER_POS.y + Math.sin(a) * 38,
      a,
    };
  }

  firePulse(stats, target) {
    const m = this.muzzlePoint(-0.06);
    this.projectiles.push({
      kind: 'bolt',
      x: m.x,
      y: m.y,
      tx: target.x,
      ty: target.y,
      target,
      speed: FORMS.pulse.projectileSpeed,
      damage: stats.damage,
      color: FORMS.pulse.color,
      life: 0,
      dead: false,
    });
    this.muzzle = 0.09;
    this.audio?.shoot('pulse');
    this.burst(m.x, m.y, FORMS.pulse.color, 3, 50, 1.6, 0.18);
  }

  fireCryo(stats, target) {
    const m = this.muzzlePoint(0.08);
    this.projectiles.push({
      kind: 'cryo',
      x: m.x,
      y: m.y,
      tx: target.x,
      ty: target.y,
      target,
      speed: FORMS.cryo.projectileSpeed,
      damage: stats.damage,
      splash: FORMS.cryo.splash,
      slow: stats.slow,
      slowDuration: FORMS.cryo.slowDuration,
      amp: FORMS.cryo.amp,
      ampDuration: FORMS.cryo.ampDuration,
      color: FORMS.cryo.color,
      life: 0,
      dead: false,
    });
    this.muzzle = 0.12;
    this.audio?.shoot('cryo');
  }

  fireMortar(stats, target) {
    const travel = FORMS.mortar.travel;
    const speed = target.speed * (target.slowTime > 0 ? 1 - target.slowAmount : 1);
    const predicted = this.path.sample(clamp(target.dist + speed * travel, 0, this.path.length - 1));
    const m = this.muzzlePoint(-0.3);
    this.projectiles.push({
      kind: 'shell',
      x: m.x,
      y: m.y,
      sx: m.x,
      sy: m.y,
      tx: predicted.x,
      ty: predicted.y,
      t: 0,
      duration: travel,
      z: 0,
      damage: stats.damage,
      splash: FORMS.mortar.splash,
      color: FORMS.mortar.color,
      dead: false,
    });
    this.muzzle = 0.16;
    this.audio?.shoot('mortar');
    this.burst(m.x, m.y, '#ffd166', 8, 90, 2.4, 0.4);
  }

  fireTesla(stats, target) {
    const hits = [target];
    let current = target;
    const maxChains = stats.chains;
    for (let i = 1; i < maxChains; i += 1) {
      let best = null;
      let bestD = Infinity;
      for (const e of this.enemies) {
        if (e.dead || hits.includes(e)) continue;
        const d2 = dist2(e.x, e.y, current.x, current.y);
        if (d2 <= FORMS.tesla.chainRange ** 2 && d2 < bestD) {
          best = e;
          bestD = d2;
        }
      }
      if (!best) break;
      hits.push(best);
      current = best;
    }

    let from = { x: TOWER_POS.x, y: TOWER_POS.y - 12 };
    hits.forEach((e, i) => {
      const dmg = stats.damage * FORMS.tesla.falloff ** i;
      this.addBeam(from.x, from.y, e.x, e.y, {
        type: 'tesla',
        color: FORMS.tesla.color,
        life: 0.18,
        width: 2.4,
      });
      this.damageEnemy(e, dmg, { silent: i > 0 });
      this.burst(e.x, e.y, FORMS.tesla.color, 4, 80, 2, 0.3);
      from = { x: e.x, y: e.y };
    });
    this.muzzle = 0.14;
    this.audio?.shoot('tesla');
    this.shake = Math.max(this.shake, 1.5);
  }

  fireRail(stats, aim) {
    const dx = aim.x - TOWER_POS.x;
    const dy = aim.y - TOWER_POS.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const range = stats.range * (this.overdrive > 0 ? OVERDRIVE_RANGE : 1);
    const end = { x: TOWER_POS.x + nx * range, y: TOWER_POS.y + ny * range };
    const width = FORMS.rail.pierce;

    for (const e of this.enemies) {
      if (e.dead) continue;
      const px = e.x - TOWER_POS.x;
      const py = e.y - TOWER_POS.y;
      const projection = px * nx + py * ny;
      if (projection < -8 || projection > range + e.radius) continue;
      const perp = Math.abs(px * ny - py * nx);
      if (perp <= width + e.radius) {
        this.damageEnemy(e, stats.damage, { silent: false });
      }
    }

    this.addBeam(TOWER_POS.x, TOWER_POS.y, end.x, end.y, {
      type: 'rail',
      color: FORMS.rail.color,
      life: 0.28,
      width: 9,
    });
    this.muzzle = 0.2;
    this.railRecoil = 1;
    this.shake = Math.max(this.shake, 5);
    this.audio?.shoot('rail');
    for (let i = 0; i < 16; i += 1) {
      const t = 0.1 + Math.random() * 0.9;
      this.addParticle(TOWER_POS.x + nx * range * t, TOWER_POS.y + ny * range * t, {
        vx: (Math.random() - 0.5) * 60,
        vy: (Math.random() - 0.5) * 60,
        size: 1.5 + Math.random() * 2,
        color: FORMS.rail.color,
        life: 0.4,
        maxLife: 0.4,
        additive: true,
      });
    }
  }

  blazeCone(stats, range) {
    const coneHalf = (FORMS.blaze.cone * Math.PI) / 360;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - TOWER_POS.x, e.y - TOWER_POS.y);
      if (d > range + e.radius) continue;
      const angle = Math.atan2(e.y - TOWER_POS.y, e.x - TOWER_POS.x);
      let diff = Math.abs(((angle - this.aimAngle + Math.PI) % TAU + TAU) % TAU - Math.PI);
      if (diff <= coneHalf + e.radius / Math.max(1, d)) {
        this.damageEnemy(e, stats.damage, { silent: Math.random() > 0.35 });
        e.burnTime = FORMS.blaze.burnDuration;
        e.burnDps = Math.max(e.burnDps, stats.burnDps);
      }
    }
  }

  emitFlame(dt, range) {
    const mx = TOWER_POS.x + Math.cos(this.aimAngle) * 34;
    const my = TOWER_POS.y + Math.sin(this.aimAngle) * 34;
    const count = Math.random() < dt * 75 ? 1 : 0;
    for (let i = 0; i < count; i += 1) {
      const spread = (Math.random() - 0.5) * 0.55;
      const speed = 160 + Math.random() * 220;
      this.addParticle(mx, my, {
        vx: Math.cos(this.aimAngle + spread) * speed,
        vy: Math.sin(this.aimAngle + spread) * speed,
        size: 4 + Math.random() * 7,
        color: Math.random() > 0.45 ? '#ff744f' : '#ffd166',
        life: 0.25 + Math.random() * 0.2,
        maxLife: 0.45,
        drag: 0.92,
        additive: true,
      });
    }
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i];
      if (p.kind === 'bolt' || p.kind === 'cryo') {
        p.life += dt;
        const target = p.target;
        if (target && !target.dead) {
          p.tx = target.x;
          p.ty = target.y;
        }
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        const travel = p.speed * dt;
        if (d <= travel + 3) {
          p.x = p.tx;
          p.y = p.ty;
          if (p.kind === 'bolt') this.hitBolt(p);
          else this.hitCryo(p);
          this.projectiles.splice(i, 1);
          continue;
        }
        p.x += (dx / d) * travel;
        p.y += (dy / d) * travel;
        if (p.life > 2.6) this.projectiles.splice(i, 1);
      } else if (p.kind === 'shell') {
        p.t += dt;
        const t = clamp(p.t / p.duration, 0, 1);
        p.x = lerp(p.sx, p.tx, t);
        p.y = lerp(p.sy, p.ty, t);
        p.z = Math.sin(t * Math.PI) * 88;
        if (t >= 1) {
          this.explode(p);
          this.projectiles.splice(i, 1);
        }
      }
    }
  }

  hitBolt(p) {
    if (p.target && !p.target.dead) {
      this.damageEnemy(p.target, p.damage);
      this.audio?.impact();
    }
    this.burst(p.x, p.y, p.color, 4, 70, 1.8, 0.25);
  }

  hitCryo(p) {
    const hitList = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d <= p.splash + e.radius) {
        hitList.push({ e, d });
        this.damageEnemy(e, p.damage, { silent: true });
        if (e.dead) continue;
        const resist = 1 - (e.slowResist || 0);
        e.slowAmount = Math.max(e.slowAmount, p.slow * resist);
        e.slowTime = Math.max(e.slowTime, p.slowDuration);
        e.ampTime = Math.max(e.ampTime, p.ampDuration);
      }
    }
    if (p.target && !p.target.dead) {
      this.addText(p.target.x, p.target.y - p.target.radius - 8, 'CHILLED', '#9dc8ff', 10);
    }
    this.ring(p.x, p.y, p.color, 8, p.splash * 1.2, 0.45);
    this.burst(p.x, p.y, p.color, 14, 110, 2.5, 0.5);
    this.audio?.impact();
  }

  explode(p) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.tx, e.y - p.ty);
      if (d <= p.splash + e.radius) {
        const falloff = 1 - 0.4 * clamp(d / p.splash, 0, 1);
        this.damageEnemy(e, p.damage * falloff);
      }
    }
    this.ring(p.tx, p.ty, p.color, 10, p.splash * 1.35, 0.6);
    this.burst(p.tx, p.ty, p.color, 30, 190, 3.4, 0.75);
    this.burst(p.tx, p.ty, '#fff0c2', 12, 120, 2, 0.45);
    this.shake = Math.max(this.shake, 4);
    this.audio?.shoot('mortar');
    this.audio?.impact();
  }

  addBeam(x1, y1, x2, y2, opts = {}) {
    const type = opts.type || 'tesla';
    const beam = {
      type,
      x1,
      y1,
      x2,
      y2,
      color: opts.color || '#ffffff',
      width: opts.width || 2,
      life: opts.life || 0.2,
      maxLife: opts.life || 0.2,
      points: null,
    };
    if (type === 'tesla') {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const segs = Math.max(4, Math.round(len / 22));
      const points = [{ x: x1, y: y1 }];
      for (let i = 1; i < segs; i += 1) {
        const t = i / segs;
        const jitter = (Math.random() - 0.5) * len * 0.075;
        points.push({
          x: lerp(x1, x2, t) + nx * jitter,
          y: lerp(y1, y2, t) + ny * jitter,
        });
      }
      points.push({ x: x2, y: y2 });
      beam.points = points;
    }
    this.beams.push(beam);
  }

  updateBeams(dt) {
    for (let i = this.beams.length - 1; i >= 0; i -= 1) {
      this.beams[i].life -= dt;
      if (this.beams[i].life <= 0) this.beams.splice(i, 1);
    }
  }

  addParticle(x, y, opts = {}) {
    if (this.particles.length > 480) this.particles.shift();
    const life = opts.life ?? 0.6;
    this.particles.push({
      x,
      y,
      vx: opts.vx || 0,
      vy: opts.vy || 0,
      size: opts.size || 2,
      color: opts.color || '#ffffff',
      life,
      maxLife: opts.maxLife || life,
      drag: opts.drag ?? 0.94,
      gravity: opts.gravity || 0,
      additive: !!opts.additive,
      shape: opts.shape || 'circle',
      rot: Math.random() * TAU,
      spin: (Math.random() - 0.5) * 8,
    });
  }

  burst(x, y, color, count = 10, speed = 100, size = 2.5, life = 0.7) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * TAU;
      const v = speed * (0.25 + Math.random() * 0.85);
      this.addParticle(x, y, {
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        size: size * (0.5 + Math.random()),
        color,
        life: life * (0.5 + Math.random() * 0.8),
        maxLife: life,
        drag: 0.9,
        additive: true,
        shape: Math.random() > 0.55 ? 'spark' : 'circle',
      });
    }
  }

  ring(x, y, color, r, maxR, life = 0.5) {
    this.rings.push({ x, y, r, maxR, color, life, maxLife: life });
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.vy += p.gravity * dt;
      p.rot += p.spin * dt;
    }
  }

  updateRings(dt) {
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.maxLife;
      r.currentR = lerp(r.r, r.maxR, 1 - (1 - t) ** 2);
    }
  }

  addText(x, y, text, color = '#ffffff', size = 12) {
    if (this.texts.length > 70) this.texts.shift();
    this.texts.push({
      id: this.nextTextId++,
      x,
      y,
      text: String(text),
      color,
      size,
      life: 0.75,
      maxLife: 0.75,
      vy: -28 - Math.random() * 14,
      vx: (Math.random() - 0.5) * 10,
    });
  }

  updateTexts(dt) {
    for (let i = this.texts.length - 1; i >= 0; i -= 1) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.vy *= 0.96;
    }
  }

  checkWaveEnd() {
    if (this.mode !== 'wave') return;
    if (this.spawnQueue.length > 0) return;
    if (this.enemies.some((e) => !e.dead)) return;
    const info = this.waveInfo;
    this.gold += info.bonus;
    this.score += 100 + info.wave * 25 + this.lives * 5;
    const bonus = info.bonus;
    this.audio?.waveClear();
    this.emit('waveClear', { wave: info.wave, bonus, gold: this.gold });
    if (info.wave >= MAX_WAVES) {
      this.finish(true);
      return;
    }
    this.mode = 'prep';
    this.preview = buildWave(Math.min(MAX_WAVES, info.wave + 1), this.seed);
    this.railCharge = null;
    this.bumpUI();
  }

  bumpUI() {
    this.emit('ui');
  }

  finish(victory) {
    if (this.mode === 'victory' || this.mode === 'gameover') return;
    this.mode = victory ? 'victory' : 'gameover';
    this.paused = false;
    this.railCharge = null;
    this.firingBlaze = false;
    if (victory) {
      this.score += this.lives * 250;
      this.audio?.victory();
      this.burst(TOWER_POS.x, TOWER_POS.y, '#7dffc4', 50, 260, 4, 1.2);
      this.ring(TOWER_POS.x, TOWER_POS.y, '#7dffc4', 20, 180, 1.2);
    } else {
      this.audio?.defeat();
      this.shake = 18;
      this.flash = 1;
      this.burst(TOWER_POS.x, TOWER_POS.y, '#ff3d5e', 50, 240, 4, 1.1);
    }
    const best = {
      wave: Math.max(this.best.wave || 0, this.wave),
      score: Math.max(this.best.score || 0, this.score),
      clears: Math.max(this.best.clears || 0, victory ? MAX_WAVES : Math.max(0, this.wave - 1)),
    };
    this.best = best;
    saveBest(best);
    this.emit(victory ? 'victory' : 'gameover', {
      wave: this.wave,
      kills: this.kills,
      score: this.score,
      lives: this.lives,
      best,
    });
  }

  // ---------------------------------------------------------------- rendering

  buildBackground() {
    const c = document.createElement('canvas');
    c.width = WORLD.width;
    c.height = WORLD.height;
    const b = c.getContext('2d');

    const grad = b.createLinearGradient(0, 0, WORLD.width, WORLD.height);
    grad.addColorStop(0, '#07141e');
    grad.addColorStop(0.55, '#041019');
    grad.addColorStop(1, '#050b12');
    b.fillStyle = grad;
    b.fillRect(0, 0, WORLD.width, WORLD.height);

    const glow = b.createRadialGradient(TOWER_POS.x, TOWER_POS.y, 20, TOWER_POS.x, TOWER_POS.y, 430);
    glow.addColorStop(0, 'rgba(41, 178, 206, 0.13)');
    glow.addColorStop(0.55, 'rgba(16, 91, 113, 0.05)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    b.fillStyle = glow;
    b.fillRect(0, 0, WORLD.width, WORLD.height);

    b.lineWidth = 1;
    for (let x = 0; x <= WORLD.width; x += 40) {
      b.strokeStyle = x % 200 === 0 ? 'rgba(90, 210, 235, 0.07)' : 'rgba(90, 210, 235, 0.028)';
      b.beginPath();
      b.moveTo(x + 0.5, 0);
      b.lineTo(x + 0.5, WORLD.height);
      b.stroke();
    }
    for (let y = 0; y <= WORLD.height; y += 40) {
      b.strokeStyle = y % 200 === 0 ? 'rgba(90, 210, 235, 0.07)' : 'rgba(90, 210, 235, 0.028)';
      b.beginPath();
      b.moveTo(0, y + 0.5);
      b.lineTo(WORLD.width, y + 0.5);
      b.stroke();
    }

    // Large concentric targeting rings around the core.
    b.save();
    b.translate(TOWER_POS.x, TOWER_POS.y);
    for (const r of [118, 168, 228, 300]) {
      b.strokeStyle = 'rgba(96, 224, 255, 0.055)';
      b.lineWidth = 1;
      b.setLineDash(r === 228 ? [3, 11] : []);
      b.beginPath();
      b.arc(0, 0, r, 0, TAU);
      b.stroke();
    }
    b.setLineDash([]);
    b.strokeStyle = 'rgba(96, 224, 255, 0.12)';
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU;
      b.beginPath();
      b.moveTo(Math.cos(a) * 298, Math.sin(a) * 298);
      b.lineTo(Math.cos(a) * 310, Math.sin(a) * 310);
      b.stroke();
    }
    b.restore();

    // Decorative circuit traces.
    b.save();
    b.lineWidth = 1;
    b.strokeStyle = 'rgba(78, 190, 215, 0.09)';
    const traces = [
      [[18, 620], [18, 566], [86, 566], [86, 596], [140, 596]],
      [[760, 70], [760, 128], [700, 128], [700, 96], [662, 96]],
      [[724, 588], [724, 548], [772, 548], [772, 512]],
      [[54, 54], [54, 92], [112, 92]],
      [[670, 220], [714, 220], [714, 180]],
    ];
    for (const trace of traces) {
      b.beginPath();
      trace.forEach((p, i) => (i === 0 ? b.moveTo(p[0], p[1]) : b.lineTo(p[0], p[1])));
      b.stroke();
      for (const p of trace) {
        b.fillStyle = 'rgba(78, 190, 215, 0.14)';
        b.fillRect(p[0] - 2, p[1] - 2, 4, 4);
      }
    }
    b.restore();

    // Track layers.
    b.save();
    b.lineCap = 'round';
    b.lineJoin = 'round';
    b.strokeStyle = 'rgba(44, 194, 230, 0.08)';
    b.lineWidth = 52;
    b.stroke(this.path2D);
    b.strokeStyle = 'rgba(105, 229, 255, 0.2)';
    b.lineWidth = 37;
    b.stroke(this.path2D);
    b.strokeStyle = '#0b202b';
    b.lineWidth = 31;
    b.stroke(this.path2D);
    b.strokeStyle = '#07131c';
    b.lineWidth = 25;
    b.stroke(this.path2D);
    b.strokeStyle = 'rgba(118, 235, 255, 0.32)';
    b.lineWidth = 1.5;
    b.setLineDash([2, 14]);
    b.stroke(this.path2D);
    b.restore();

    // Static direction chevrons.
    for (let d = 90; d < this.path.length - 60; d += 210) {
      const s = this.path.sample(d);
      b.save();
      b.translate(s.x, s.y);
      b.rotate(s.angle);
      b.strokeStyle = 'rgba(108, 232, 255, 0.3)';
      b.lineWidth = 1.5;
      b.beginPath();
      b.moveTo(-5, -5);
      b.lineTo(2, 0);
      b.lineTo(-5, 5);
      b.stroke();
      b.restore();
    }

    // Corner brackets and labels.
    b.strokeStyle = 'rgba(103, 230, 255, 0.22)';
    b.lineWidth = 1.5;
    const corners = [
      [18, 18, 1, 1],
      [WORLD.width - 18, 18, -1, 1],
      [18, WORLD.height - 18, 1, -1],
      [WORLD.width - 18, WORLD.height - 18, -1, -1],
    ];
    for (const [x, y, sx, sy] of corners) {
      b.beginPath();
      b.moveTo(x + sx * 22, y);
      b.lineTo(x, y);
      b.lineTo(x, y + sy * 22);
      b.stroke();
    }

    b.font = '600 9px ui-monospace, SFMono-Regular, Consolas, monospace';
    b.fillStyle = 'rgba(119, 221, 240, 0.34)';
    b.fillText('NEXUS GRID / SECTOR 07', 32, 40);
    b.fillStyle = 'rgba(119, 221, 240, 0.2)';
    b.fillText('SINGULAR CORE', TOWER_POS.x - 34, TOWER_POS.y + 92);
    b.textAlign = 'right';
    b.fillText('THREAT LANE  //  ENTRY 02', WORLD.width - 32, WORLD.height - 30);
    b.textAlign = 'left';

    return c;
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.1) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    ctx.drawImage(this.bg, 0, 0, WORLD.width, WORLD.height);

    // Animated flow dashes.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([2, 25]);
    ctx.lineDashOffset = -(this.time * 62) % 27;
    ctx.strokeStyle = 'rgba(123, 239, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke(this.path2D);
    ctx.restore();

    this.drawPortals(ctx);
    this.drawRange(ctx);
    if (this.form === 'blaze' && this.firingBlaze) this.drawFlameCone(ctx);
    this.drawEnemies(ctx);
    this.drawTower(ctx);
    this.drawProjectiles(ctx);
    this.drawBeams(ctx);
    this.drawParticles(ctx);
    this.drawTexts(ctx);

    if (this.flash > 0) {
      const g = ctx.createRadialGradient(
        WORLD.width / 2,
        WORLD.height / 2,
        120,
        WORLD.width / 2,
        WORLD.height / 2,
        480,
      );
      g.addColorStop(0, 'rgba(255, 30, 70, 0)');
      g.addColorStop(1, `rgba(255, 30, 70, ${this.flash * 0.38})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    }
    ctx.restore();
  }

  drawPortals(ctx) {
    const entry = this.path.sample(58);
    const exit = this.path.sample(this.path.length - 62);
    this.drawPortal(ctx, entry, '#64f7ff', -1);
    this.drawPortal(ctx, exit, '#ff4d70', 1);
  }

  drawPortal(ctx, p, color, dir) {
    const t = this.time;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(t * 0.5 * dir);
    ctx.strokeStyle = hexToRgba(color, 0.55);
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 9]);
    ctx.beginPath();
    ctx.arc(0, 0, 19 + Math.sin(t * 2.2) * 2, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = hexToRgba(color, 0.18);
    ctx.beginPath();
    ctx.arc(0, 0, 29, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = hexToRgba(color, 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(color, 0.8);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 13, -0.6, 0.6);
    ctx.stroke();
    ctx.restore();
  }

  drawRange(ctx) {
    if (this.mode === 'menu') return;
    const stats = this.getStats();
    const range = stats.range * (this.overdrive > 0 ? OVERDRIVE_RANGE : 1);
    const color = this.overdrive > 0 ? '#ffd166' : FORMS[this.form].color;
    ctx.save();
    ctx.translate(TOWER_POS.x, TOWER_POS.y);
    ctx.strokeStyle = hexToRgba(color, 0.13);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 13]);
    ctx.lineDashOffset = -this.time * 12;
    ctx.beginPath();
    ctx.arc(0, 0, range, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = hexToRgba(color, 0.05);
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(0, 0, range - 5, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawFlameCone(ctx) {
    const stats = this.getStats();
    const range = stats.range * (this.overdrive > 0 ? OVERDRIVE_RANGE : 1);
    const half = (FORMS.blaze.cone * Math.PI) / 360;
    const flicker = 0.75 + Math.sin(this.time * 42) * 0.1 + Math.random() * 0.12;
    ctx.save();
    ctx.translate(TOWER_POS.x, TOWER_POS.y);
    ctx.rotate(this.aimAngle);
    const grad = ctx.createLinearGradient(30, 0, range, 0);
    grad.addColorStop(0, `rgba(255, 220, 140, ${0.34 * flicker})`);
    grad.addColorStop(0.5, `rgba(255, 120, 70, ${0.24 * flicker})`);
    grad.addColorStop(1, 'rgba(255, 70, 50, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.arc(0, 0, range, -half, half);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawEnemies(ctx) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      this.drawEnemy(ctx, e);
    }
  }

  drawEnemy(ctx, e) {
    const scale = 0.45 + 0.55 * e.spawnScale;
    const r = e.radius * scale;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(1, 0.55);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(0, r * 0.5, r * 0.9, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.slowTime > 0) {
      ctx.strokeStyle = 'rgba(157, 200, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, this.time * 1.5, this.time * 1.5 + TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (e.boss) {
      ctx.save();
      ctx.rotate(this.time * 0.35);
      ctx.strokeStyle = hexToRgba(e.color, 0.28);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, r + 14, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    ctx.rotate(e.angle + (e.boss ? this.time * 0.2 : 0));
    ctx.shadowColor = e.color;
    ctx.shadowBlur = e.boss ? 26 : 10;
    ctx.fillStyle = e.color;
    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 1.3;

    if (e.type === 'drone') {
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(0, r * 0.78);
      ctx.lineTo(-r * 0.72, 0);
      ctx.lineTo(0, -r * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(10, 15, 25, 0.75)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, TAU);
      ctx.fill();
    } else if (e.type === 'runner') {
      ctx.beginPath();
      ctx.moveTo(r * 1.25, 0);
      ctx.lineTo(-r * 0.7, r * 0.8);
      ctx.lineTo(-r * 0.35, 0);
      ctx.lineTo(-r * 0.7, -r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (e.type === 'brute') {
      poly(ctx, 0, 0, r, 6, 0);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(20, 10, 10, 0.55)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, 0);
      ctx.lineTo(r * 0.45, 0);
      ctx.moveTo(0, -r * 0.45);
      ctx.lineTo(0, r * 0.45);
      ctx.stroke();
    } else if (e.type === 'shield') {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      if (e.shield > 0) {
        ctx.strokeStyle = 'rgba(165, 210, 255, 0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, r + 4, -1.15, 1.15);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(10, 20, 35, 0.65)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.35, 0, TAU);
      ctx.fill();
    } else if (e.type === 'splitter') {
      ctx.rotate(e.spin * 0.7);
      ctx.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
      ctx.strokeRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
      ctx.fillStyle = 'rgba(15, 6, 30, 0.8)';
      ctx.fillRect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.6);
    } else if (e.type === 'shard') {
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.6, r * 0.7);
      ctx.lineTo(-r * 0.25, 0);
      ctx.lineTo(-r * 0.6, -r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (e.type === 'boss') {
      ctx.save();
      ctx.rotate(-this.time * 0.4);
      poly(ctx, 0, 0, r, 8, Math.PI / 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(22, 4, 12, 0.72)';
      poly(ctx, 0, 0, r * 0.68, 6, Math.PI / 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#ffe1e8';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.16 + Math.sin(this.time * 5) * 1.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Status/health UI.
    if (!e.boss) {
      const w = Math.max(24, e.radius * 2.25);
      const h = 3;
      const y = -e.radius - 11;
      const ratio = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(3, 8, 13, 0.85)';
      ctx.fillRect(e.x - w / 2, e.y + y, w, h);
      const barColor = ratio > 0.55 ? '#7dffc4' : ratio > 0.25 ? '#ffd166' : '#ff5577';
      ctx.fillStyle = barColor;
      ctx.fillRect(e.x - w / 2, e.y + y, w * ratio, h);
      if (e.shield > 0) {
        ctx.fillStyle = 'rgba(3, 8, 13, 0.85)';
        ctx.fillRect(e.x - w / 2, e.y + y - 4, w, 2.5);
        ctx.fillStyle = '#86bcff';
        ctx.fillRect(e.x - w / 2, e.y + y - 4, w * clamp(e.shield / e.maxShield, 0, 1), 2.5);
      }
      if (e.ampTime > 0) {
        ctx.fillStyle = 'rgba(157, 200, 255, 0.85)';
        ctx.font = '600 7px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CHILLED', e.x, e.y + y - 8);
        ctx.textAlign = 'left';
      }
    }
  }

  drawTower(ctx) {
    const form = FORMS[this.form];
    const accent = form.color;
    const stats = this.getStats();
    const t = this.time;
    const ringR = 54;

    ctx.save();
    ctx.translate(TOWER_POS.x, TOWER_POS.y);

    // Ground shadow.
    ctx.save();
    ctx.scale(1, 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(0, 46, 42, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Orbiting arcs.
    for (let i = 0; i < 3; i += 1) {
      const a0 = t * (0.35 + i * 0.12) + (i * TAU) / 3;
      ctx.strokeStyle = hexToRgba(accent, 0.26 + i * 0.08);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, ringR + 4 + i * 3, a0, a0 + 0.9);
      ctx.stroke();
    }
    ctx.strokeStyle = hexToRgba(accent, 0.24);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, ringR + 10, -t * 0.2, -t * 0.2 + TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // Base hexagon.
    poly(ctx, 0, 0, TOWER_RADIUS + 2, 6, Math.PI / 6);
    const baseGrad = ctx.createLinearGradient(0, -40, 0, 40);
    baseGrad.addColorStop(0, '#112733');
    baseGrad.addColorStop(1, '#07131b');
    ctx.fillStyle = baseGrad;
    ctx.fill();
    ctx.strokeStyle = hexToRgba(accent, 0.55);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    poly(ctx, 0, 0, TOWER_RADIUS - 9, 6, Math.PI / 6);
    ctx.fillStyle = 'rgba(4, 12, 18, 0.9)';
    ctx.fill();
    ctx.strokeStyle = hexToRgba(accent, 0.2);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Level pips.
    for (let i = 0; i < MAX_LEVEL; i += 1) {
      const a = -Math.PI * 0.78 + (i / (MAX_LEVEL - 1)) * Math.PI * 1.56;
      const px = Math.cos(a) * (ringR + 2);
      const py = Math.sin(a) * (ringR + 2);
      ctx.fillStyle = i < this.level ? hexToRgba(accent, 0.95) : 'rgba(255,255,255,0.13)';
      ctx.beginPath();
      ctx.arc(px, py, i < this.level ? 1.9 : 1.3, 0, TAU);
      ctx.fill();
    }

    // Overdrive halo.
    if (this.overdrive > 0) {
      const pulse = 0.6 + Math.sin(t * 6) * 0.2;
      ctx.strokeStyle = `rgba(255, 209, 102, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, ringR + 15 + Math.sin(t * 3) * 2, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 3; i += 1) {
        const a = t * 2.2 + (i * TAU) / 3;
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (ringR + 15), Math.sin(a) * (ringR + 15), 2, 0, TAU);
        ctx.fill();
      }
    }

    // Turret.
    ctx.save();
    ctx.rotate(this.aimAngle);
    this.drawTurret(ctx, this.form, accent, t);
    ctx.restore();

    // Core jewel.
    ctx.save();
    const coreGlow = 0.75 + Math.sin(t * 3.5) * 0.2;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 22;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.7 + coreGlow * 0.2})`;
    ctx.beginPath();
    ctx.arc(0, 0, 3.4, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (this.muzzle > 0) {
      const m = this.muzzlePoint();
      ctx.save();
      ctx.translate(m.x - TOWER_POS.x, m.y - TOWER_POS.y);
      ctx.fillStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 18;
      ctx.globalAlpha = clamp(this.muzzle * 8, 0, 1);
      ctx.beginPath();
      ctx.arc(0, 0, 5 + this.muzzle * 20, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    if (this.railCharge) {
      const progress = clamp(this.railCharge.t / this.railCharge.duration, 0, 1);
      ctx.save();
      ctx.rotate(this.aimAngle);
      ctx.strokeStyle = `rgba(255, 111, 156, ${0.25 + progress * 0.5})`;
      ctx.lineWidth = 1 + progress * 2;
      ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = -t * 40;
      ctx.beginPath();
      ctx.moveTo(44, 0);
      ctx.lineTo(stats.range, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.fillStyle = `rgba(255, 230, 240, ${progress * 0.75})`;
      ctx.beginPath();
      ctx.arc(0, 0, 11 + progress * 7, 0, TAU);
      ctx.fill();
    }

    if (this.reforgeFx > 0) {
      const p = 1 - this.reforgeFx / 0.8;
      ctx.strokeStyle = hexToRgba(accent, (1 - p) * 0.8);
      ctx.lineWidth = 3 * (1 - p) + 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, 20 + p * 100, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * TAU + t;
        ctx.fillStyle = hexToRgba(accent, 1 - p);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (20 + p * 90), Math.sin(a) * (20 + p * 90), 2.5, 0, TAU);
        ctx.fill();
      }
    }
    if (this.upgradeFx > 0) {
      const p = 1 - this.upgradeFx / 0.75;
      ctx.strokeStyle = `rgba(125, 255, 196, ${(1 - p) * 0.75})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 44 + p * 70, 0, TAU);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawTurret(ctx, formId, accent, t) {
    const recoil = this.railRecoil * 8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = hexToRgba(accent, 0.75);
    ctx.fillStyle = '#0a1a24';
    ctx.lineWidth = 1.4;

    if (formId === 'pulse') {
      for (const y of [-6.5, 6.5]) {
        roundedRect(ctx, 2, y - 3, 35 - recoil * 0.2, 6, 2.5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = hexToRgba(accent, 0.85);
        ctx.fillRect(32 - recoil * 0.2, y - 1.3, 5, 2.6);
        ctx.fillStyle = '#0a1a24';
      }
    } else if (formId === 'mortar') {
      roundedRect(ctx, 0, -12, 32, 24, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = hexToRgba(accent, 0.25);
      roundedRect(ctx, 6, -7, 22, 14, 4);
      ctx.fill();
      ctx.fillStyle = '#050f15';
      ctx.beginPath();
      ctx.arc(33, 0, 7.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(accent, 0.9);
      ctx.beginPath();
      ctx.arc(33, 0, 7.5, 0, TAU);
      ctx.stroke();
    } else if (formId === 'cryo') {
      ctx.save();
      ctx.translate(6, 0);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = hexToRgba(accent, 0.28);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.fillRect(-7, -7, 34, 14);
      ctx.strokeRect(-7, -7, 34, 14);
      ctx.restore();
      ctx.strokeStyle = hexToRgba(accent, 0.9);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(8, -13);
      ctx.lineTo(19, -4);
      ctx.moveTo(8, 13);
      ctx.lineTo(19, 4);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(36, 0, 3, 0, TAU);
      ctx.fill();
    } else if (formId === 'blaze') {
      ctx.fillStyle = '#0a1a24';
      ctx.strokeStyle = hexToRgba(accent, 0.8);
      ctx.beginPath();
      ctx.moveTo(4, -11);
      ctx.lineTo(33, -7);
      ctx.lineTo(33, 7);
      ctx.lineTo(4, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = hexToRgba(accent, 0.75);
      ctx.beginPath();
      ctx.arc(33, 0, 4 + Math.sin(t * 12) * 1.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 210, 120, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, -2);
      ctx.lineTo(27, 0);
      ctx.lineTo(20, 2);
      ctx.stroke();
    } else if (formId === 'tesla') {
      ctx.strokeStyle = hexToRgba(accent, 0.85);
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.ellipse(9 + i * 9, 0, 3.5, 9.5, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(36, 0);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(38, 0, 3.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(accent, 0.4);
      ctx.beginPath();
      ctx.arc(15, 0, 12 + Math.sin(t * 5) * 1.5, -0.7, 0.7);
      ctx.stroke();
    } else if (formId === 'rail') {
      ctx.fillStyle = '#0a1a24';
      ctx.strokeStyle = hexToRgba(accent, 0.9);
      ctx.lineWidth = 1.5;
      for (const y of [-7, 7]) {
        roundedRect(ctx, 2 - recoil * 0.4, y - 2, 52 - recoil, 4, 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = hexToRgba(accent, 0.35);
      ctx.fillRect(8 - recoil * 0.4, -2.5, 40 - recoil, 5);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(12 - recoil * 0.4, 0);
      ctx.lineTo(48 - recoil, 0);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(52 - recoil, 0);
      ctx.lineTo(44 - recoil, -4);
      ctx.lineTo(44 - recoil, 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = hexToRgba(accent, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, TAU);
    ctx.stroke();
  }

  drawProjectiles(ctx) {
    for (const p of this.projectiles) {
      if (p.kind === 'bolt') {
        ctx.save();
        ctx.strokeStyle = hexToRgba(p.color, 0.5);
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x - (p.tx - p.x) * 0.015, p.y - (p.ty - p.y) * 0.015);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.8, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (p.kind === 'cryo') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.ty - p.y, p.tx - p.x) + Math.PI / 4);
        ctx.fillStyle = '#d7ecff';
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 14;
        ctx.fillRect(-4, -4, 8, 8);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-4, -4, 8, 8);
        ctx.restore();
      } else if (p.kind === 'shell') {
        // Impact marker.
        ctx.save();
        ctx.translate(p.tx, p.ty);
        ctx.strokeStyle = hexToRgba(p.color, 0.35);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, p.splash, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = hexToRgba(p.color, 0.65);
        ctx.beginPath();
        ctx.arc(0, 0, p.splash, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p.t / p.duration, 0, 1));
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.translate(p.x, p.y - p.z);
        ctx.fillStyle = '#fff3d1';
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(0, 0, 4.2, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(p.color, 0.7);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawBeams(ctx) {
    for (const b of this.beams) {
      const alpha = clamp(b.life / b.maxLife, 0, 1);
      ctx.save();
      ctx.lineCap = 'round';
      if (b.type === 'rail') {
        ctx.strokeStyle = hexToRgba(b.color, alpha * 0.35);
        ctx.lineWidth = b.width * (0.5 + alpha);
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
        ctx.stroke();
      } else {
        const flicker = 0.65 + Math.random() * 0.35;
        ctx.strokeStyle = hexToRgba(b.color, alpha * flicker * 0.5);
        ctx.lineWidth = b.width * 3.5;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        b.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        b.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.additive) ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.color;
      if (p.shape === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * 0.55);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(p.rot) * p.size * 2.4, p.y + Math.sin(p.rot) * p.size * 2.4);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + alpha * 0.7), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const r of this.rings) {
      const alpha = clamp(r.life / r.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.currentR || r.r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const alpha = clamp(t.life / t.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${t.size}px ui-monospace, SFMono-Regular, Consolas, monospace`;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(t.text, t.x + 1, t.y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}

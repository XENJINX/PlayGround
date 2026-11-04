import {
  FORMS,
  FORM_ORDER,
  FORM_ICONS,
  TARGET_MODES,
  ENEMY_ORDER,
  ENEMY_TYPES,
  MAX_WAVES,
  describeComposition,
  getFormStats,
} from './config.js';
import { Game } from './game.js';
import { AudioEngine } from './audio.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const app = $('#app');
const canvas = $('#gameCanvas');
const stage = $('#stage');
const panel = $('#panel');
const coreGlyph = $('#coreGlyph');
const coreName = $('#coreName');
const coreRole = $('#coreRole');
const coreDesc = $('#coreDesc');
const levelValue = $('#levelValue');
const formGrid = $('#formGrid');
const targetRow = $('#targetRow');
const targetHint = $('#targetHint');
const upgradeBtn = $('#upgradeBtn');
const upgradeCostEl = $('#upgradeCost');
const upgradeNote = $('#upgradeNote');
const reforgeNote = $('#reforgeNote');
const waveBtn = $('#waveBtn');
const waveBtnLabel = $('#waveBtnLabel');
const waveBtnSub = $('#waveBtnSub');
const waveLabel = $('#waveLabel');
const waveEyebrow = $('#waveEyebrow');
const bonusValue = $('#bonusValue');
const wavePreview = $('#wavePreview');
const livesValue = $('#livesValue');
const goldValue = $('#goldValue');
const waveValue = $('#waveValue');
const scoreValue = $('#scoreValue');
const hudLives = $('#hudLives');
const speedBtn = $('#speedBtn');
const speedText = $('#speedText');
const soundBtn = $('#soundBtn');
const pauseBtn = $('#pauseBtn');
const helpBtn = $('#helpBtn');
const startOverlay = $('#startOverlay');
const pauseOverlay = $('#pauseOverlay');
const resultOverlay = $('#resultOverlay');
const startBtn = $('#startBtn');
const resumeBtn = $('#resumeBtn');
const restartBtn = $('#restartBtn');
const pauseRestartBtn = $('#pauseRestartBtn');
const helpModal = $('#helpModal');
const helpCloseBtn = $('#helpCloseBtn');
const bossBar = $('#bossBar');
const bossName = $('#bossName');
const bossHpText = $('#bossHpText');
const bossFill = $('#bossFill');
const overdrivePip = $('#overdrivePip');
const overdriveTime = $('#overdriveTime');
const waveBanner = $('#waveBanner');
const bannerKicker = $('#bannerKicker');
const bannerTitle = $('#bannerTitle');
const bannerSub = $('#bannerSub');
const toasts = $('#toasts');

const audio = new AudioEngine();
let muted = false;
try {
  muted = localStorage.getItem('nexus-muted') === '1';
} catch {
  muted = false;
}
audio.setMuted(muted);

const game = new Game(canvas, { audio, onEvent: handleGameEvent });

const formCards = new Map();
const targetButtons = new Map();
let previewSignature = '';
let lastResultMode = null;
let helpResumeTarget = false;
let bannerTimer = 0;
let lastLives = null;

function iconSvg(formId) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${FORM_ICONS[formId]}</svg>`;
}

function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = `toast${kind ? ` is-${kind}` : ''}`;
  el.textContent = text;
  toasts.append(el);
  while (toasts.children.length > 4) toasts.firstElementChild.remove();
  window.setTimeout(() => {
    el.classList.add('is-out');
    window.setTimeout(() => el.remove(), 360);
  }, 2600);
}

function buildInterface() {
  // Reforge cards.
  for (const id of FORM_ORDER) {
    const form = FORMS[id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'form-card';
    card.dataset.form = id;
    card.style.setProperty('--c', form.color);
    card.setAttribute('aria-label', `${form.name}, ${form.role}. ${form.description} Reforge cost ${form.cost} credits.`);
    card.title = `${form.name} — ${form.description}`;
    card.innerHTML = `
      <span class="form-icon">${iconSvg(id)}</span>
      <span class="form-name">${form.name}</span>
      <span class="form-role">${form.role}</span>
      <span class="form-cost" data-cost>${form.cost}</span>
    `;
    formGrid.append(card);
    formCards.set(id, card);
  }

  for (const mode of TARGET_MODES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.target = mode.id;
    btn.textContent = mode.label;
    btn.title = `Target ${mode.hint}`;
    btn.setAttribute('aria-pressed', 'false');
    targetRow.append(btn);
    targetButtons.set(mode.id, btn);
  }

  const introForms = $('#introForms');
  introForms.innerHTML = FORM_ORDER.map(
    (id) =>
      `<span class="intro-form" style="--c:${FORMS[id].color}" title="${FORMS[id].name}">${iconSvg(id)}<span>${FORMS[id].name}</span></span>`,
  ).join('');

  const helpForms = $('#helpForms');
  helpForms.innerHTML = FORM_ORDER.map(
    (id) => `
      <div class="help-form" style="--c:${FORMS[id].color}">
        <span class="help-form-icon">${iconSvg(id)}</span>
        <div><b>${FORMS[id].name} · ${FORMS[id].role}</b><span>${FORMS[id].tagline}. ${FORMS[id].description}</span></div>
      </div>`,
  ).join('');
}

function getPreviewChips(counts, bossNameText) {
  const chips = describeComposition(counts)
    .map(
      (item) =>
        `<span class="preview-chip" style="--pc:${item.color}"><i></i>${item.name}<b>${item.count}</b></span>`,
    )
    .join('');
  const bossChip = counts.boss
    ? `<span class="preview-chip is-boss"><i style="--pc:#ff5577"></i>BOSS ${bossNameText || ''}<b>${counts.boss}</b></span>`
    : '';
  return chips + bossChip;
}

function sync() {
  const ui = game.getUI();
  const form = FORMS[ui.form];
  const stats = ui.stats;
  const isMenu = ui.mode === 'menu';

  app.classList.toggle('is-menu', isMenu);

  // HUD.
  livesValue.textContent = ui.lives;
  goldValue.textContent = ui.gold;
  waveValue.textContent = String(ui.wave).padStart(2, '0');
  scoreValue.textContent = Math.round(ui.score).toLocaleString('en-US');

  if (lastLives !== null && ui.lives < lastLives) {
    hudLives.classList.remove('is-hit');
    void hudLives.offsetWidth;
    hudLives.classList.add('is-hit');
  }
  lastLives = ui.lives;

  speedText.textContent = `${ui.speed}×`;
  speedBtn.setAttribute('aria-label', `Game speed ${ui.speed}x. Click to toggle.`);
  soundBtn.classList.toggle('is-muted', muted);
  soundBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  pauseBtn.disabled = ui.mode !== 'prep' && ui.mode !== 'wave';
  pauseBtn.setAttribute('aria-label', ui.paused ? 'Resume game' : 'Pause game');

  // Core card.
  panel.style.setProperty('--accent', form.color);
  coreGlyph.innerHTML = iconSvg(ui.form);
  coreName.textContent = form.name;
  coreRole.textContent = form.role;
  coreDesc.textContent = form.description;
  levelValue.textContent = ui.level;
  $('#statDamage').textContent = formatStat(stats.damage);
  $('#statRate').textContent = `${stats.rate.toFixed(2)}/s`;
  $('#statRange').textContent = Math.round(stats.range);
  $('#statDps').textContent = Math.round(stats.dps);

  const canPlay = ui.mode === 'prep' || ui.mode === 'wave';
  const maxed = ui.level >= ui.maxLevel;
  const upgradeCost = ui.upgradeCost;
  const canAffordUpgrade = upgradeCost !== null && ui.gold >= upgradeCost;
  upgradeBtn.disabled = !canPlay || maxed;
  upgradeBtn.classList.toggle('is-poor', !maxed && !canAffordUpgrade);
  if (maxed) {
    upgradeCostEl.textContent = 'MAX';
    upgradeNote.textContent = 'CORE OUTPUT MAXIMIZED';
  } else {
    const next = getFormStats(ui.form, ui.level + 1);
    const dmgPct = Math.round((next.damage / stats.damage - 1) * 100);
    const ratePct = Math.round((next.rate / stats.rate - 1) * 100);
    upgradeCostEl.textContent = upgradeCost;
    upgradeNote.textContent = canAffordUpgrade
      ? `+${dmgPct}% DMG · +${ratePct}% RATE`
      : `NEED ${Math.max(0, upgradeCost - ui.gold)} MORE CREDITS`;
  }

  // Reforge cards.
  for (const id of FORM_ORDER) {
    const card = formCards.get(id);
    const isCurrent = ui.form === id;
    const cost = FORMS[id].cost;
    const poor = !isCurrent && ui.gold < cost;
    card.classList.toggle('is-current', isCurrent);
    card.classList.toggle('is-poor', poor || !canPlay);
    card.classList.toggle('is-cooling', ui.reforgeCool > 0 && !isCurrent);
    card.setAttribute('aria-pressed', String(isCurrent));
    const costEl = card.querySelector('[data-cost]');
    if (isCurrent) {
      costEl.textContent = 'ACTIVE';
      costEl.classList.add('is-active');
    } else {
      costEl.textContent = cost;
      costEl.classList.remove('is-active');
    }
  }

  if (ui.reforgeCool > 0) {
    reforgeNote.textContent = `RECALIBRATING ARRAY · ${ui.reforgeCool.toFixed(1)}s`;
    reforgeNote.classList.add('is-live');
  } else if (ui.overdrive > 0) {
    reforgeNote.textContent = `OVERDRIVE ACTIVE · ${ui.overdrive.toFixed(1)}s · +35% RATE`;
    reforgeNote.classList.add('is-live');
  } else {
    reforgeNote.textContent = 'Swap form · 4s overdrive · level persists';
    reforgeNote.classList.remove('is-live');
  }

  for (const mode of TARGET_MODES) {
    const btn = targetButtons.get(mode.id);
    const active = ui.targetMode === mode.id;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  }
  targetHint.textContent = TARGET_MODES.find((m) => m.id === ui.targetMode)?.hint || '';

  // Wave panel.
  const preview = ui.preview;
  const activeWave = ui.mode === 'wave' ? ui.waveInfo : null;
  let bonus = 0;
  if (preview) bonus = preview.bonus;
  if (activeWave) bonus = activeWave.bonus;
  bonusValue.textContent = bonus ? `+${bonus}` : '—';

  if (ui.mode === 'menu') {
    waveEyebrow.textContent = 'NEXT DEPLOYMENT';
    waveLabel.textContent = 'WAVE 01';
    waveBtnLabel.textContent = 'STANDBY';
    waveBtnSub.textContent = 'INITIALIZE RUN';
    waveBtn.disabled = true;
  } else if (ui.mode === 'wave') {
    waveEyebrow.textContent = 'ACTIVE ASSAULT';
    waveLabel.textContent = `WAVE ${String(ui.wave).padStart(2, '0')}`;
    waveBtnLabel.textContent = 'WAVE ACTIVE';
    waveBtnSub.textContent = `${ui.activeEnemies + ui.remainingSpawns} HOSTILES REMAIN`;
    waveBtn.disabled = true;
  } else if (ui.mode === 'victory') {
    waveEyebrow.textContent = 'OPERATION COMPLETE';
    waveLabel.textContent = 'SECTOR SECURED';
    waveBtnLabel.textContent = 'SECTOR SECURED';
    waveBtnSub.textContent = 'CORE INTACT';
    waveBtn.disabled = true;
  } else if (ui.mode === 'gameover') {
    waveEyebrow.textContent = 'CORE OFFLINE';
    waveLabel.textContent = 'RUN TERMINATED';
    waveBtnLabel.textContent = 'CORE OFFLINE';
    waveBtnSub.textContent = `REACHED WAVE ${ui.wave}`;
    waveBtn.disabled = true;
  } else {
    waveEyebrow.textContent = 'NEXT DEPLOYMENT';
    waveLabel.textContent = `WAVE ${String(ui.nextWave).padStart(2, '0')}`;
    waveBtnLabel.textContent = `DEPLOY WAVE ${String(ui.nextWave).padStart(2, '0')}`;
    waveBtnSub.textContent = preview
      ? `${preview.total} HOSTILES${preview.boss ? ' · BOSS' : ''}`
      : 'STANDBY';
    waveBtn.disabled = false;
  }

  // Wave preview.
  let signature = '';
  let previewHtml = '';
  if (activeWave) {
    signature = `active-${ui.wave}`;
    previewHtml = getPreviewChips(activeWave.counts, activeWave.bossName);
    previewHtml += `<span class="preview-empty">HOSTILES ${ui.activeEnemies} · INBOUND ${ui.remainingSpawns}</span>`;
  } else if (preview) {
    signature = `prep-${preview.wave}`;
    previewHtml = getPreviewChips(preview.counts, preview.bossName);
  } else {
    signature = 'none';
    previewHtml = '<span class="preview-empty">NO FURTHER THREATS</span>';
  }
  if (signature !== previewSignature) {
    previewSignature = signature;
    wavePreview.innerHTML = previewHtml;
  } else if (activeWave) {
    const tail = wavePreview.querySelector('.preview-empty');
    if (tail) tail.textContent = `HOSTILES ${ui.activeEnemies} · INBOUND ${ui.remainingSpawns}`;
  }

  // Boss bar.
  if (ui.boss && (ui.mode === 'wave' || ui.mode === 'prep') && !ui.boss.defeated) {
    bossBar.hidden = false;
    bossName.textContent = ui.boss.name;
    const pct = Math.max(0, Math.min(100, (ui.boss.hp / ui.boss.maxHp) * 100));
    bossFill.style.width = `${pct}%`;
    bossHpText.textContent = `${Math.ceil(ui.boss.hp)} / ${ui.boss.maxHp}`;
  } else {
    bossBar.hidden = true;
  }

  // Overdrive indicator.
  if (ui.overdrive > 0 && canPlay) {
    overdrivePip.hidden = false;
    overdriveTime.textContent = `${ui.overdrive.toFixed(1)}s`;
  } else {
    overdrivePip.hidden = true;
  }

  // Overlays.
  startOverlay.hidden = ui.mode !== 'menu';
  pauseOverlay.hidden = !(ui.paused && (ui.mode === 'prep' || ui.mode === 'wave') && helpModal.hidden);
  const resultMode = ui.mode === 'victory' || ui.mode === 'gameover' ? ui.mode : null;
  resultOverlay.hidden = !resultMode;
  if (resultMode) {
    resultOverlay.classList.toggle('is-victory', resultMode === 'victory');
    resultOverlay.classList.toggle('is-defeat', resultMode === 'gameover');
    if (lastResultMode !== resultMode) {
      lastResultMode = resultMode;
      const victory = resultMode === 'victory';
      $('#resultKicker').textContent = victory ? 'OPERATION COMPLETE' : 'DEFENSE FAILED';
      $('#resultTitle').textContent = victory ? 'SECTOR SECURED' : 'CORE BREACHED';
      $('#resultCopy').textContent = victory
        ? 'Twenty waves held. The singularity is still yours.'
        : 'The swarm reached the core. Recalibrate, reforge, and run it again.';
      $('#resultWave').textContent = `${ui.wave}/${MAX_WAVES}`;
      $('#resultKills').textContent = ui.kills.toLocaleString('en-US');
      $('#resultScore').textContent = Math.round(ui.score).toLocaleString('en-US');
      $('#resultBest').textContent = ui.best?.wave || ui.wave;
    }
  } else {
    lastResultMode = null;
  }
}

function formatStat(value) {
  if (value >= 100) return Math.round(value).toString();
  return (Math.round(value * 10) / 10).toString();
}

function showBanner(kicker, title, sub, danger = false) {
  bannerKicker.textContent = kicker;
  bannerTitle.textContent = title;
  bannerSub.textContent = sub;
  waveBanner.classList.toggle('danger', danger);
  waveBanner.classList.remove('show');
  void waveBanner.offsetWidth;
  waveBanner.classList.add('show');
  window.clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => waveBanner.classList.remove('show'), 2200);
}

function handleGameEvent(ev) {
  switch (ev.type) {
    case 'runStart':
      toasts.innerHTML = '';
      startOverlay.hidden = true;
      resultOverlay.hidden = true;
      showBanner('SYSTEM ARMED', 'WAVE 01', 'REFORGE READY · CORE ONLINE');
      break;
    case 'waveStart':
      showBanner(
        ev.boss ? 'BOSS INBOUND' : 'INCOMING',
        `WAVE ${String(ev.wave).padStart(2, '0')}`,
        ev.boss ? `${ev.bossName} + ${ev.total - 1} HOSTILES` : `${ev.total} HOSTILES`,
        ev.boss,
      );
      if (ev.boss) toast(`WARNING // ${ev.bossName} DETECTED`, 'danger');
      break;
    case 'bossSpawn':
      toast(`THREAT ON LANE // ${ev.name}`, 'danger');
      break;
    case 'waveClear':
      toast(`WAVE CLEAR · +${ev.bonus} CREDITS`, 'gold');
      break;
    case 'leak':
      hudLives.classList.remove('is-hit');
      void hudLives.offsetWidth;
      hudLives.classList.add('is-hit');
      break;
    case 'reforge':
      toast(`REFORGED // ${ev.name} · OVERDRIVE`, 'success');
      break;
    case 'victory':
      toast(`RUN COMPLETE · SCORE ${ev.score.toLocaleString('en-US')}`, 'success');
      break;
    case 'gameover':
      toast('CORE BREACHED // RUN TERMINATED', 'danger');
      break;
    default:
      break;
  }
  sync();
}

function reforge(id) {
  const result = game.reforge(id);
  if (!result.ok) toast(result.message, 'danger');
  sync();
}

function upgrade() {
  const result = game.upgrade();
  if (!result.ok) toast(result.message, 'danger');
  sync();
}

function openHelp() {
  const canPlay = game.mode === 'prep' || game.mode === 'wave';
  if (canPlay && !game.paused) {
    helpResumeTarget = true;
    game.setPaused(true);
  } else {
    helpResumeTarget = false;
  }
  helpModal.hidden = false;
  sync();
}

function closeHelp() {
  helpModal.hidden = true;
  if (helpResumeTarget && game.paused) {
    game.setPaused(false);
  }
  helpResumeTarget = false;
  sync();
}

function toggleSound() {
  muted = !muted;
  audio.unlock();
  audio.setMuted(muted);
  if (!muted) audio.ui();
  try {
    localStorage.setItem('nexus-muted', muted ? '1' : '0');
  } catch {
    /* ignore */
  }
  sync();
}

buildInterface();
sync();

// ------------------------------------------------------------------ events

startBtn.addEventListener('click', () => {
  audio.unlock();
  game.startRun();
});

resumeBtn.addEventListener('click', () => {
  game.setPaused(false);
  audio.ui();
  sync();
});

restartBtn.addEventListener('click', () => {
  audio.unlock();
  game.startRun();
});

pauseRestartBtn.addEventListener('click', () => {
  audio.unlock();
  game.paused = false;
  game.startRun();
});

formGrid.addEventListener('click', (e) => {
  const card = e.target.closest('[data-form]');
  if (!card) return;
  reforge(card.dataset.form);
});

targetRow.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-target]');
  if (!btn) return;
  game.setTargetMode(btn.dataset.target);
  sync();
});

upgradeBtn.addEventListener('click', upgrade);

waveBtn.addEventListener('click', () => {
  if (game.mode === 'prep') {
    audio.unlock();
    game.startWave();
  }
});

pauseBtn.addEventListener('click', () => {
  game.togglePause();
  sync();
});

speedBtn.addEventListener('click', () => {
  game.setSpeed(game.speed === 1 ? 2 : 1);
  audio.ui();
  sync();
});

soundBtn.addEventListener('click', toggleSound);

helpBtn.addEventListener('click', openHelp);
helpCloseBtn.addEventListener('click', closeHelp);
$('#pauseHelpBtn').addEventListener('click', openHelp);
$('#resultHelpBtn').addEventListener('click', openHelp);
$$('[data-close-help]').forEach((el) => el.addEventListener('click', closeHelp));

helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) closeHelp();
});

document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const key = e.key.toLowerCase();

  if (!helpModal.hidden) {
    if (key === 'h' || key === 'escape') {
      e.preventDefault();
      closeHelp();
    }
    return;
  }

  if (key === 'h') {
    e.preventDefault();
    openHelp();
    return;
  }
  if (key === 'escape') {
    if (game.paused) {
      game.setPaused(false);
      sync();
    }
    return;
  }
  if (key === 'm') {
    e.preventDefault();
    toggleSound();
    return;
  }

  if (key === 'enter') {
    e.preventDefault();
    if (game.mode === 'menu') {
      audio.unlock();
      game.startRun();
    } else if (game.mode === 'prep') {
      audio.unlock();
      game.startWave();
    }
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    if (game.mode === 'prep' || game.mode === 'wave') {
      game.togglePause();
      sync();
    }
    return;
  }

  if (key === 'u') {
    e.preventDefault();
    upgrade();
    return;
  }
  if (key === 't') {
    e.preventDefault();
    game.cycleTarget();
    sync();
    return;
  }

  const digit = Number(e.key);
  if (digit >= 1 && digit <= FORM_ORDER.length) {
    e.preventDefault();
    reforge(FORM_ORDER[digit - 1]);
  }
});

// UI refresh loop (10 fps is plenty for numbers, cheap on DOM).
let lastSync = 0;
function uiLoop(ts) {
  if (ts - lastSync > 100) {
    lastSync = ts;
    sync();
  }
  requestAnimationFrame(uiLoop);
}
requestAnimationFrame(uiLoop);

// Debug/verification API used by automated browser checks.
window.__NEXUS__ = {
  game,
  audio,
  sync,
  toast,
  start: () => {
    game.startRun();
    sync();
  },
  startWave: () => {
    const ok = game.startWave();
    sync();
    return ok;
  },
  upgrade: () => {
    const result = game.upgrade();
    sync();
    return result;
  },
  reforge: (id) => {
    const result = game.reforge(id);
    sync();
    return result;
  },
  advance: (seconds) => {
    game.advance(seconds);
    sync();
  },
  getUI: () => game.getUI(),
  openHelp,
  closeHelp,
};

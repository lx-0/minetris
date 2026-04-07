// Seasonal Events Framework — local JSON-based time-limited themed events.
// Events auto-activate and deactivate based on local date.
// Each event can define themed visuals, a challenge, exclusive rewards,
// special board rules, an event leaderboard, and event history.
//
// Requires: cosmetics.js (loadUnlockedCosmetics, saveUnlockedCosmetics)

// ── Constants ─────────────────────────────────────────────────────────────────

const SE_STORAGE_KEY          = 'mineCtris_seasonalEventProgress';
const SE_REWARDED_KEY         = 'mineCtris_seasonalEventRewarded';
const SE_LB_KEY_PREFIX        = 'mineCtris_eventLB_';
const SE_CONFIG_PATH          = 'data/seasonal-events.json';

// ── State ─────────────────────────────────────────────────────────────────────

let _seConfigs         = [];     // loaded event definitions
let _seActiveEvent     = null;   // currently active event (or null)
let _seProgress        = {};     // { [eventId]: { linesCleared: N, bestScore: N } }
let _seRewarded        = {};     // { [eventId]: true } — events already rewarded
let _seTickerInterval  = null;
let _seParticlePool    = [];     // pre-allocated particle meshes
const _SE_PARTICLE_POOL_SIZE = 60;

// ── Persistence ───────────────────────────────────────────────────────────────

function _seLoadProgress() {
  try {
    const raw = localStorage.getItem(SE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

function _seSaveProgress() {
  try { localStorage.setItem(SE_STORAGE_KEY, JSON.stringify(_seProgress)); } catch (_) {}
}

function _seLoadRewarded() {
  try {
    const raw = localStorage.getItem(SE_REWARDED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

function _seSaveRewarded() {
  try { localStorage.setItem(SE_REWARDED_KEY, JSON.stringify(_seRewarded)); } catch (_) {}
}

// ── Event Leaderboard persistence ─────────────────────────────────────────────

function _seGetEventLeaderboard(eventId) {
  try {
    const raw = localStorage.getItem(SE_LB_KEY_PREFIX + eventId);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

function _seSubmitToEventLeaderboard(ev, finalScore) {
  if (!ev || finalScore <= 0) return;
  const lb = _seGetEventLeaderboard(ev.id);
  const name = (typeof loadDisplayName === 'function') ? (loadDisplayName() || 'Anonymous') : 'Anonymous';
  lb.push({ name, score: finalScore, date: new Date().toISOString().slice(0, 10) });
  lb.sort((a, b) => b.score - a.score);
  lb.splice(10); // keep top 10
  try { localStorage.setItem(SE_LB_KEY_PREFIX + ev.id, JSON.stringify(lb)); } catch (_) {}
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function _seIsEventActive(ev) {
  const now   = new Date();
  const start = new Date(ev.startDate + 'T00:00:00');
  const end   = new Date(ev.endDate   + 'T23:59:59');
  return now >= start && now <= end;
}

function _seDaysLeft(ev) {
  const end = new Date(ev.endDate + 'T23:59:59');
  return Math.max(0, Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24)));
}

/** Returns a human-readable time-left string. Shows hours/minutes when < 24h. */
function _seTimeLeft(ev) {
  const end   = new Date(ev.endDate + 'T23:59:59');
  const diffMs = end - new Date();
  if (diffMs <= 0) return '0 days left';
  const diffH = Math.ceil(diffMs / (1000 * 60 * 60));
  if (diffH <= 24) {
    const h = Math.floor(diffMs / (1000 * 60 * 60));
    const m = Math.ceil((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (h > 0) return h + 'h ' + m + 'm left';
    return m + 'm left';
  }
  const diffD = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffD === 1 ? '1 day left' : diffD + ' days left';
}

// ── Config loading ────────────────────────────────────────────────────────────

async function _seLoadConfigs() {
  try {
    const res  = await fetch(SE_CONFIG_PATH + '?v=' + Date.now());
    if (!res.ok) return [];
    return await res.json();
  } catch (_) { return []; }
}

// ── Challenge value helpers ────────────────────────────────────────────────────

function _seGetChallengeValue(ev) {
  if (!ev || !ev.challenge) return 0;
  const p      = _seProgress[ev.id] || {};
  const metric = ev.challenge.metric || 'lines_cleared';
  if (metric === 'score') return p.bestScore || 0;
  return p.linesCleared || 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns the active seasonal event config, or null. */
function getActiveSeasonalEvent() {
  return _seActiveEvent;
}

/** Returns event progress for the active event. */
function getSeasonalEventProgress() {
  if (!_seActiveEvent) return null;
  const ev     = _seActiveEvent;
  const target = ev.challenge ? ev.challenge.target : 100;
  const metric = (ev.challenge && ev.challenge.metric) || 'lines_cleared';
  const val    = _seGetChallengeValue(ev);
  const p      = _seProgress[ev.id] || {};
  return {
    value:        val,
    target,
    metric,
    linesCleared: p.linesCleared || 0, // always present for backward compat
    bestScore:    p.bestScore    || 0,
    pct:          Math.min(100, Math.round((val / target) * 100)),
    completed:    val >= target,
  };
}

/**
 * Called by lineclear.js after each line-clear event.
 * For lines_cleared metric: increments linesCleared.
 * For score metric: reads current live `score` global and updates bestScore.
 * @param {number} count — number of lines cleared this clear
 */
function onSeasonalLineClear(count) {
  if (!_seActiveEvent || !_seActiveEvent.challenge) return;

  const ev     = _seActiveEvent;
  const metric = ev.challenge.metric || 'lines_cleared';

  if (!_seProgress[ev.id]) _seProgress[ev.id] = { linesCleared: 0, bestScore: 0 };

  if (metric === 'lines_cleared') {
    _seProgress[ev.id].linesCleared += count;
  } else if (metric === 'score') {
    // Score is a global updated before this call — read the live value.
    const currentScore = (typeof score !== 'undefined') ? score : 0;
    if (currentScore > (_seProgress[ev.id].bestScore || 0)) {
      _seProgress[ev.id].bestScore = currentScore;
    }
  }

  _seSaveProgress();

  const val    = _seGetChallengeValue(ev);
  const target = ev.challenge.target;
  if (val >= target && !_seRewarded[ev.id]) {
    _seGrantEventRewards(ev);
  }

  _seUpdateProgressHUD();
}

/**
 * Called by triggerGameOver() in gamestate.js with the final score.
 * Updates bestScore (final score is most accurate), submits to event leaderboard,
 * and refreshes all event UI.
 * @param {number} finalScore
 */
function onSeasonalGameEnd(finalScore) {
  if (!_seActiveEvent) return;
  const ev = _seActiveEvent;

  // Update bestScore with final game score (final is authoritative)
  if (ev.challenge && ev.challenge.metric === 'score') {
    if (!_seProgress[ev.id]) _seProgress[ev.id] = { linesCleared: 0, bestScore: 0 };
    if (finalScore > (_seProgress[ev.id].bestScore || 0)) {
      _seProgress[ev.id].bestScore = finalScore;
      _seSaveProgress();
      // Check if this score completed the challenge
      if (finalScore >= ev.challenge.target && !_seRewarded[ev.id]) {
        _seGrantEventRewards(ev);
      }
    }
  }

  // Always submit to event leaderboard (any positive score counts)
  _seSubmitToEventLeaderboard(ev, finalScore);

  // Refresh UI
  renderSeasonalEventBanner();
  _seRefreshTicker();
  _seUpdateProgressHUD();
}

/**
 * Called when a new game starts (pointer lock acquired, after mode setup).
 * Injects lava obstacle blocks for events that specify specialRules.lavaBoardBlocks.
 */
function onSeasonalGameStart() {
  if (!_seActiveEvent) return;
  const ev = _seActiveEvent;
  if (!ev.specialRules || !ev.specialRules.lavaBoardBlocks) return;

  const count = ev.specialRules.lavaBoardBlocks;
  if (typeof createBlockMesh !== 'function' ||
      typeof registerBlock   !== 'function' ||
      typeof worldGroup      === 'undefined') return;

  // Lava color: ember orange from NETHER_COLORS[4]
  const lavaColor = '#ff4400';
  // Place lava blocks randomly in the lower play area (Y = 0.5, bottom row).
  // X,Z range: ±12 units (well within the piece spawn range of ±20).
  const range = 12;
  for (let i = 0; i < count; i++) {
    const bx = Math.round((Math.random() - 0.5) * range * 2);
    const bz = Math.round((Math.random() - 0.5) * range * 2);
    const block = createBlockMesh(lavaColor);
    block.position.set(bx, 0.5, bz);
    block.name = 'landed_block';
    block.userData.isNetherLavaBlock = true;
    worldGroup.add(block);
    registerBlock(block);
  }
}

// ── Reward granting ───────────────────────────────────────────────────────────

function _seGrantEventRewards(ev) {
  if (!ev.challenge || !ev.challenge.rewards) return;
  _seRewarded[ev.id] = true;
  _seSaveRewarded();

  if (typeof loadUnlockedCosmetics === 'function' &&
      typeof saveUnlockedCosmetics === 'function') {
    const unlocked = loadUnlockedCosmetics();
    let changed = false;
    for (const r of ev.challenge.rewards) {
      if (r.cosmeticId && !unlocked.includes(r.cosmeticId)) {
        unlocked.push(r.cosmeticId);
        changed = true;
      }
    }
    if (changed) saveUnlockedCosmetics(unlocked);
  }

  _seShowRewardToast(ev);
}

function _seShowRewardToast(ev) {
  const toastEl = document.getElementById('event-end-toast');
  if (!toastEl) return;

  const labels = ev.challenge.rewards.map(r => r.label).join(' + ');
  toastEl.innerHTML =
    `<div class="se-reward-toast">` +
      `<span class="se-reward-toast-icon">${_seEsc(ev.icon || '🌸')}</span>` +
      `<div class="se-reward-toast-text">` +
        `<strong>Challenge Complete!</strong><br>` +
        `You earned: ${_seEsc(labels)}` +
      `</div>` +
    `</div>`;
  toastEl.style.display = 'block';
  setTimeout(() => { toastEl.style.display = 'none'; }, 6000);
}

// ── Particle effects ──────────────────────────────────────────────────────────

/**
 * Pre-allocate particle meshes into a pool.
 * Called from initSeasonalEvents after scene exists.
 */
function _seInitParticlePool() {
  if (typeof scene === 'undefined' || !scene || typeof THREE === 'undefined') return;

  const geo = new THREE.SphereGeometry(0.15, 4, 4);
  for (let i = 0; i < _SE_PARTICLE_POOL_SIZE; i++) {
    const mat  = new THREE.MeshBasicMaterial({ color: 0xf9a8d4, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    _seParticlePool.push({ mesh, active: false, vel: null, age: 0, maxAge: 0 });
  }
}

function _seAcquireParticle() {
  for (let i = 0; i < _seParticlePool.length; i++) {
    if (!_seParticlePool[i].active) { _seParticlePool[i].active = true; return _seParticlePool[i]; }
  }
  return null;
}

function _seReleaseParticle(p) {
  p.mesh.visible = false;
  p.active = false;
}

const _seActiveParticles = [];

/**
 * Spawn cherry-blossom flower particles at a given world-space position.
 * Called on line clears when spring event is active.
 */
function spawnSpringParticles(worldX, worldY, worldZ) {
  if (!_seActiveEvent) return;
  const colors = [0xf9a8d4, 0xfce7f3, 0xfbbf24, 0xfb7185];
  for (let i = 0; i < 10; i++) {
    const p = _seAcquireParticle();
    if (!p) break;
    p.mesh.position.set(
      worldX + (Math.random() - 0.5) * 4,
      worldY + Math.random() * 0.5,
      worldZ + (Math.random() - 0.5) * 4
    );
    p.mesh.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
    p.mesh.material.opacity = 0.9;
    p.mesh.visible = true;
    p.vel = {
      x: (Math.random() - 0.5) * 3,
      y: 2 + Math.random() * 3,
      z: (Math.random() - 0.5) * 3,
    };
    p.age    = 0;
    p.maxAge = 0.6 + Math.random() * 0.5;
    _seActiveParticles.push(p);
  }
}

/**
 * Spawn fire/ember particles for nether-themed events.
 * Called on line clears when the active event uses particleEffect: "fire".
 */
function spawnNetherParticles(worldX, worldY, worldZ) {
  if (!_seActiveEvent) return;
  const colors = [0xff4400, 0xff6600, 0xff0000, 0xffaa00, 0xff2200];
  for (let i = 0; i < 8; i++) {
    const p = _seAcquireParticle();
    if (!p) break;
    p.mesh.position.set(
      worldX + (Math.random() - 0.5) * 3,
      worldY + Math.random() * 0.3,
      worldZ + (Math.random() - 0.5) * 3
    );
    p.mesh.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
    p.mesh.material.opacity = 1.0;
    p.mesh.visible = true;
    // Fire rises fast then fades
    p.vel = {
      x: (Math.random() - 0.5) * 2,
      y: 3 + Math.random() * 4,
      z: (Math.random() - 0.5) * 2,
    };
    p.age    = 0;
    p.maxAge = 0.4 + Math.random() * 0.4;
    _seActiveParticles.push(p);
  }
}

/**
 * Dispatch the correct particle effect for the active event on a line clear.
 * Called from lineclear.js (or game loop) with world-space coords.
 */
function spawnSeasonalParticles(worldX, worldY, worldZ) {
  if (!_seActiveEvent) return;
  const fx = _seActiveEvent.theme && _seActiveEvent.theme.particleEffect;
  if (fx === 'fire')          spawnNetherParticles(worldX, worldY, worldZ);
  else if (fx === 'cherry_blossom') spawnSpringParticles(worldX, worldY, worldZ);
  else                        spawnSpringParticles(worldX, worldY, worldZ); // default
}

/**
 * Advance particle simulation. Call from the game loop every frame.
 * @param {number} dt — delta time in seconds
 */
function updateSeasonalParticles(dt) {
  for (let i = _seActiveParticles.length - 1; i >= 0; i--) {
    const p = _seActiveParticles[i];
    p.age += dt;
    const t = p.age / p.maxAge;
    if (t >= 1) {
      _seReleaseParticle(p);
      _seActiveParticles.splice(i, 1);
      continue;
    }
    p.mesh.position.x += p.vel.x * dt;
    p.mesh.position.y += p.vel.y * dt;
    p.mesh.position.z += p.vel.z * dt;
    p.vel.y -= 4.0 * dt;  // gravity
    p.vel.x *= (1 - 0.5 * dt);
    p.vel.z *= (1 - 0.5 * dt);
    p.mesh.material.opacity = 0.9 * (1 - t);
    p.mesh.scale.setScalar(1 - t * 0.5);
  }
}

// ── HUD: event progress tracker ───────────────────────────────────────────────

function _seUpdateProgressHUD() {
  const el = document.getElementById('se-event-progress');
  if (!el) return;

  if (!_seActiveEvent || !_seActiveEvent.challenge) {
    el.style.display = 'none';
    return;
  }

  const prog   = getSeasonalEventProgress();
  if (!prog) { el.style.display = 'none'; return; }

  const accent = (_seActiveEvent.theme && _seActiveEvent.theme.hudAccent) || '#f472b6';
  const icon   = _seActiveEvent.icon || '🌸';
  const metric = prog.metric;

  // Live value: for score-metric events, show current in-game score vs target
  // (score global may be 0 before game starts; fall back to bestScore)
  let displayVal = prog.value;
  if (metric === 'score' && typeof score !== 'undefined' && !isGameOver) {
    displayVal = Math.max(score, prog.bestScore || 0);
  }
  const displayPct = Math.min(100, Math.round((displayVal / prog.target) * 100));
  const label = metric === 'score'
    ? (displayVal.toLocaleString() + ' / ' + prog.target.toLocaleString() + ' pts')
    : (prog.linesCleared + '/' + prog.target + ' lines');

  if (prog.completed) {
    el.innerHTML =
      `<div class="se-prog-inner se-prog-done">` +
        `<span class="se-prog-icon">${icon}</span>` +
        `<span class="se-prog-label">${_seEsc(_seActiveEvent.name)} <strong>Complete!</strong></span>` +
        `<span class="se-prog-badge">🎖</span>` +
      `</div>`;
  } else {
    el.innerHTML =
      `<div class="se-prog-inner">` +
        `<span class="se-prog-icon">${icon}</span>` +
        `<span class="se-prog-label">${_seEsc(label)}</span>` +
        `<div class="se-prog-bar-wrap">` +
          `<div class="se-prog-bar-fill" style="width:${displayPct}%;background:${_seEsc(accent)}"></div>` +
        `</div>` +
      `</div>`;
  }
  el.style.display = 'block';
}

// ── HUD: ticker (bottom-left, stacked above community goals) ──────────────────

function _seRefreshTicker() {
  const el = document.getElementById('se-ticker');
  if (!el) return;

  if (!_seActiveEvent) {
    el.style.display = 'none';
    return;
  }

  const prog   = getSeasonalEventProgress();
  const ev     = _seActiveEvent;
  const time   = _seTimeLeft(ev);
  const accent = (ev.theme && ev.theme.hudAccent) || '#f472b6';
  const metric = prog && prog.metric;

  const progressStr = prog && !prog.completed
    ? (metric === 'score'
        ? prog.bestScore.toLocaleString() + ' / ' + prog.target.toLocaleString() + ' pts'
        : prog.linesCleared + '/' + prog.target + ' lines')
    : null;

  el.innerHTML =
    `<div class="se-ticker-inner">` +
      `<span class="se-ticker-label">${_seEsc(ev.icon || '🌸')} ${_seEsc(ev.name)}</span>` +
      (progressStr
        ? `<span class="se-ticker-progress">${_seEsc(progressStr)}</span>` +
          `<div class="se-ticker-bar-wrap"><div class="se-ticker-bar-fill" style="width:${prog.pct}%;background:${_seEsc(accent)}"></div></div>`
        : '') +
      `<span class="se-ticker-days">${_seEsc(time)}</span>` +
    `</div>`;
  el.style.display = 'block';
}

// ── Main menu banner ──────────────────────────────────────────────────────────

function renderSeasonalEventBanner() {
  const bannerEl = document.getElementById('se-event-banner');
  if (!bannerEl) return;

  if (!_seActiveEvent) {
    bannerEl.style.display = 'none';
    return;
  }

  const ev      = _seActiveEvent;
  const prog    = getSeasonalEventProgress();
  const timeStr = _seTimeLeft(ev);
  const accent  = (ev.theme && ev.theme.bannerAccent) || '#ec4899';
  const rewarded = _seRewarded[ev.id];
  const metric   = prog && prog.metric;

  const progressLabel = prog && !rewarded
    ? (metric === 'score'
        ? prog.bestScore.toLocaleString() + ' / ' + prog.target.toLocaleString() + ' pts'
        : prog.linesCleared + ' / ' + prog.target + ' lines')
    : null;

  bannerEl.innerHTML =
    `<div class="se-banner-inner" style="border-color:${_seEsc(accent)}">` +
      `<div class="se-banner-left">` +
        `<span class="se-banner-icon">${_seEsc(ev.icon || '🌸')}</span>` +
        `<div class="se-banner-text-wrap">` +
          `<span class="se-banner-label">SEASONAL EVENT</span>` +
          `<span class="se-banner-name" style="color:${_seEsc(accent)}">${_seEsc(ev.name)}</span>` +
          `<span class="se-banner-blurb">${_seEsc(ev.narrativeBlurb)}</span>` +
        `</div>` +
      `</div>` +
      `<div class="se-banner-right">` +
        `<div class="se-banner-days">${_seEsc(timeStr)}</div>` +
        (ev.challenge && prog
          ? `<div class="se-banner-challenge-row">` +
              `<span class="se-banner-challenge-label">CHALLENGE</span>` +
              (rewarded
                ? `<span class="se-banner-challenge-done" style="color:${_seEsc(accent)}">&#10003; Complete!</span>`
                : `<span class="se-banner-challenge-pct">${prog.pct}%</span>`) +
            `</div>` +
            `<div class="se-banner-goal-bar-wrap">` +
              `<div class="se-banner-goal-bar-fill" style="width:${prog.pct}%;background:${_seEsc(accent)}"></div>` +
            `</div>` +
            (progressLabel
              ? `<span class="se-banner-goal-progress">${_seEsc(progressLabel)}</span>`
              : '')
          : '') +
        `<div class="se-banner-btn-row">` +
          `<button class="se-banner-rewards-btn" style="border-color:${_seEsc(accent)};color:${_seEsc(accent)}" onclick="showSeasonalEventRewards()">&#127873; Rewards</button>` +
          `<button class="se-banner-rewards-btn" style="border-color:${_seEsc(accent)};color:${_seEsc(accent)}" onclick="showEventLeaderboard()">&#127942; Leaderboard</button>` +
          `<button class="se-banner-rewards-btn" style="border-color:${_seEsc(accent)};color:${_seEsc(accent)}" onclick="showEventHistory()">&#128218; History</button>` +
        `</div>` +
      `</div>` +
    `</div>`;
  bannerEl.style.display = 'block';
}

// ── Rewards panel ─────────────────────────────────────────────────────────────

function showSeasonalEventRewards() {
  const panelEl = document.getElementById('se-cosmetics-panel');
  if (!panelEl) return;

  const ev = _seActiveEvent;
  if (!ev) {
    panelEl.style.display = 'none';
    return;
  }

  const rewards  = (ev.challenge && ev.challenge.rewards) || [];
  const rewarded = _seRewarded[ev.id];
  const accent   = (ev.theme && ev.theme.bannerAccent) || '#ec4899';

  const rows = rewards.map(r =>
    `<div class="se-cos-row">` +
      `<span class="se-cos-icon">${_seEsc(ev.icon || '🌸')}</span>` +
      `<div class="se-cos-info">` +
        `<span class="se-cos-name">${_seEsc(r.label)}</span>` +
        `<span class="se-cos-rarity" style="color:${_seEsc(accent)}">SEASONAL</span>` +
      `</div>` +
      `<span class="se-cos-tag">${rewarded ? '&#10003; EARNED' : 'TIME-LIMITED'}</span>` +
    `</div>`
  ).join('');

  const metric = ev.challenge && ev.challenge.metric === 'score' ? 'score' : 'lines';
  const target = ev.challenge ? ev.challenge.target : 0;
  const targetStr = metric === 'score' ? target.toLocaleString() + ' pts' : target + ' lines';

  panelEl.innerHTML =
    `<div class="se-cos-header">` +
      `<span>${_seEsc(ev.icon || '🌸')} EVENT REWARDS</span>` +
      `<button class="se-cos-close" onclick="hideSeasonalEventCosmetics()">&#10005;</button>` +
    `</div>` +
    `<div class="se-cos-subtitle">` +
      `Reach ${_seEsc(targetStr)} in a single game to earn these rewards.<br>They will never return once the event ends.` +
    `</div>` +
    `<div class="se-cos-list">${rows}</div>`;
  panelEl.style.display = 'flex';
}

function hideSeasonalEventCosmetics() {
  const panelEl = document.getElementById('se-cosmetics-panel');
  if (panelEl) panelEl.style.display = 'none';
}

// Legacy alias used by old se-event-banner markup
function showSeasonalEventCosmetics() { showSeasonalEventRewards(); }

// ── Event Leaderboard panel ───────────────────────────────────────────────────

function showEventLeaderboard() {
  const panelEl = document.getElementById('se-event-lb-panel');
  if (!panelEl) return;

  const ev = _seActiveEvent;
  if (!ev) { panelEl.style.display = 'none'; return; }

  const lb     = _seGetEventLeaderboard(ev.id);
  const accent = (ev.theme && ev.theme.bannerAccent) || '#ec4899';

  const rows = lb.map((entry, i) =>
    `<div class="se-lb-row">` +
      `<span class="se-lb-rank" style="color:${_seEsc(accent)}">#${i + 1}</span>` +
      `<span class="se-lb-name">${_seEsc(entry.name)}</span>` +
      `<span class="se-lb-score">${(entry.score || 0).toLocaleString()}</span>` +
      `<span class="se-lb-date">${_seEsc(entry.date || '')}</span>` +
    `</div>`
  ).join('');

  const emptyMsg = '<div class="se-lb-empty">No scores yet — play to be first!</div>';

  panelEl.innerHTML =
    `<div class="se-lb-header">` +
      `<span>${_seEsc(ev.icon || '🏆')} ${_seEsc(ev.name)} Leaderboard</span>` +
      `<button class="se-cos-close" onclick="hideEventLeaderboard()">&#10005;</button>` +
    `</div>` +
    `<div class="se-lb-subtitle">Top scores during this event (local device)</div>` +
    `<div class="se-lb-list">${rows || emptyMsg}</div>`;
  panelEl.style.display = 'flex';
}

function hideEventLeaderboard() {
  const el = document.getElementById('se-event-lb-panel');
  if (el) el.style.display = 'none';
}

// ── Event History panel ───────────────────────────────────────────────────────

function showEventHistory() {
  const panelEl = document.getElementById('se-event-history-panel');
  if (!panelEl) return;

  const all = _seConfigs || [];

  const rows = all.map(ev => {
    const completed = !!_seRewarded[ev.id];
    const active    = _seIsEventActive(ev);
    const accent    = (ev.theme && ev.theme.bannerAccent) || '#ec4899';
    const rewards   = (ev.challenge && ev.challenge.rewards) || [];
    const rewardNames = rewards.map(r => r.label).join(', ');
    const p         = _seProgress[ev.id] || {};

    let progressStr = '';
    if (ev.challenge) {
      const metric = ev.challenge.metric || 'lines_cleared';
      const val    = metric === 'score' ? (p.bestScore || 0) : (p.linesCleared || 0);
      const target = ev.challenge.target;
      const label  = metric === 'score'
        ? val.toLocaleString() + ' / ' + target.toLocaleString() + ' pts'
        : val + ' / ' + target + ' lines';
      progressStr  = `<span class="se-history-progress">${_seEsc(label)}</span>`;
    }

    return `<div class="se-history-row${completed ? ' se-history-done' : ''}${active ? ' se-history-active' : ''}">` +
      `<span class="se-history-icon">${_seEsc(ev.icon || '⭐')}</span>` +
      `<div class="se-history-info">` +
        `<span class="se-history-name" style="color:${_seEsc(accent)}">${_seEsc(ev.name)}</span>` +
        `<span class="se-history-dates">${_seEsc(ev.startDate)} → ${_seEsc(ev.endDate)}</span>` +
        (active    ? `<span class="se-history-badge se-history-badge-live">LIVE</span>` : '') +
        (completed ? `<span class="se-history-badge se-history-badge-done">&#10003; COMPLETED</span>` : '') +
        progressStr +
        (rewardNames ? `<span class="se-history-reward">Reward: ${_seEsc(rewardNames)}</span>` : '') +
      `</div>` +
    `</div>`;
  });

  const emptyMsg = '<div class="se-lb-empty">No event records found.</div>';

  panelEl.innerHTML =
    `<div class="se-lb-header">` +
      `<span>&#128218; Event History</span>` +
      `<button class="se-cos-close" onclick="hideEventHistory()">&#10005;</button>` +
    `</div>` +
    `<div class="se-history-list">${rows.length ? rows.join('') : emptyMsg}</div>`;
  panelEl.style.display = 'flex';
}

function hideEventHistory() {
  const el = document.getElementById('se-event-history-panel');
  if (el) el.style.display = 'none';
}

// ── Block theme override ──────────────────────────────────────────────────────

/**
 * Returns a seasonal block color override for a falling/landing block, or null.
 * Called from pieces.js when placing blocks (if it checks for seasonal themes).
 */
function getSeasonalBlockColor() {
  if (!_seActiveEvent || !_seActiveEvent.theme || !_seActiveEvent.theme.blockColorOverride) return null;
  const colors = [
    _seActiveEvent.theme.blockColorOverride,
    _seActiveEvent.theme.blockColorOverride2,
    _seActiveEvent.theme.blockColorOverride3,
  ].filter(Boolean);
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Returns the void-block spawn multiplier for the active event.
 * A value > 1 adds extra void-block slots to the piece pool in pieces.js.
 */
function getSeasonalVoidBlockMult() {
  if (!_seActiveEvent || !_seActiveEvent.specialRules) return 1;
  return _seActiveEvent.specialRules.voidBlockMult || 1;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function _seEsc(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Initialize the seasonal events framework.
 * Loads config, determines active event, sets up HUD.
 * Called from main.js after DOM ready.
 */
async function initSeasonalEvents() {
  _seProgress = _seLoadProgress();
  _seRewarded = _seLoadRewarded();

  _seConfigs = await _seLoadConfigs();

  // Find the first active event
  _seActiveEvent = null;
  for (const ev of _seConfigs) {
    if (_seIsEventActive(ev)) { _seActiveEvent = ev; break; }
  }

  // Initialize particle pool (scene must exist at this point)
  _seInitParticlePool();

  // Apply seasonal CSS class to game container when event is active
  const root = document.getElementById('game-container') || document.body;
  if (_seActiveEvent) {
    root.classList.add('seasonal-event-active');
    root.setAttribute('data-seasonal-event', _seActiveEvent.id);
  } else {
    root.classList.remove('seasonal-event-active');
    root.removeAttribute('data-seasonal-event');
  }

  renderSeasonalEventBanner();
  _seRefreshTicker();
  _seUpdateProgressHUD();

  // Push event notifications (once per event per browser session via localStorage)
  if (_seActiveEvent) {
    _seNotifyEventStart(_seActiveEvent);
    _seNotifyEventEnding(_seActiveEvent);
  }

  // Refresh ticker every 5 minutes (also re-checks event expiry)
  if (_seTickerInterval) clearInterval(_seTickerInterval);
  if (_seActiveEvent) {
    _seTickerInterval = setInterval(() => {
      if (!_seIsEventActive(_seActiveEvent)) {
        _seActiveEvent = null;
        root.classList.remove('seasonal-event-active');
        root.removeAttribute('data-seasonal-event');
      }
      _seRefreshTicker();
      _seUpdateProgressHUD();
      renderSeasonalEventBanner();
      if (_seActiveEvent) _seNotifyEventEnding(_seActiveEvent);
    }, 5 * 60 * 1000);
  }
}

/** Push an event-started notification the first time this event is seen. */
function _seNotifyEventStart(ev) {
  if (typeof notifPush !== 'function') return;
  const key = 'mineCtris_seStartNotif_' + ev.id;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch (_) {}
  const daysLeft = _seDaysLeft(ev);
  notifPush('event_started', ev.icon || '🎉',
    (ev.name || 'Seasonal event') + ' is now active! ' + daysLeft + ' day' + (daysLeft !== 1 ? 's' : '') + ' left.');
}

/** Push an ending-soon notification when ≤ 1 day remains (once per event). */
function _seNotifyEventEnding(ev) {
  if (typeof notifPush !== 'function') return;
  if (_seDaysLeft(ev) > 1) return;
  const key = 'mineCtris_seEndingNotif_' + ev.id;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch (_) {}
  notifPush('event_ending', ev.icon || '⏰',
    (ev.name || 'Seasonal event') + ' ends in less than 24 hours — play now!');
}

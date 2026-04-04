// Seasonal Events Framework — local JSON-based time-limited themed events.
// Events auto-activate and deactivate based on local date.
// Each event can define themed visuals, a challenge, and exclusive rewards.
//
// Requires: cosmetics.js (loadUnlockedCosmetics, saveUnlockedCosmetics)

// ── Constants ─────────────────────────────────────────────────────────────────

const SE_STORAGE_KEY      = 'mineCtris_seasonalEventProgress';
const SE_REWARDED_KEY     = 'mineCtris_seasonalEventRewarded';
const SE_CONFIG_PATH      = 'data/seasonal-events.json';

// ── State ─────────────────────────────────────────────────────────────────────

let _seConfigs         = [];     // loaded event definitions
let _seActiveEvent     = null;   // currently active event (or null)
let _seProgress        = {};     // { [eventId]: { linesCleared: N } }
let _seRewarded        = {};     // { [eventId]: true } — events already rewarded
let _seTickerInterval  = null;
let _seParticlePool    = [];     // pre-allocated flower particle meshes
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

// ── Config loading ────────────────────────────────────────────────────────────

async function _seLoadConfigs() {
  try {
    const res  = await fetch(SE_CONFIG_PATH + '?v=' + Date.now());
    if (!res.ok) return [];
    return await res.json();
  } catch (_) { return []; }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns the active seasonal event config, or null. */
function getActiveSeasonalEvent() {
  return _seActiveEvent;
}

/** Returns event progress for the active event (lines cleared so far). */
function getSeasonalEventProgress() {
  if (!_seActiveEvent) return null;
  const p = _seProgress[_seActiveEvent.id] || { linesCleared: 0 };
  const target = _seActiveEvent.challenge ? _seActiveEvent.challenge.target : 100;
  return {
    linesCleared: p.linesCleared || 0,
    target,
    pct: Math.min(100, Math.round(((p.linesCleared || 0) / target) * 100)),
    completed: (p.linesCleared || 0) >= target,
  };
}

/**
 * Called by lineclear.js after each line-clear event.
 * Tracks challenge progress and grants rewards when target is met.
 * @param {number} count — number of lines cleared this clear
 */
function onSeasonalLineClear(count) {
  if (!_seActiveEvent || !_seActiveEvent.challenge) return;

  const ev = _seActiveEvent;
  if (!_seProgress[ev.id]) _seProgress[ev.id] = { linesCleared: 0 };
  _seProgress[ev.id].linesCleared += count;
  _seSaveProgress();

  // Check if challenge just completed
  const prog = _seProgress[ev.id].linesCleared;
  const target = ev.challenge.target;
  if (prog >= target && !_seRewarded[ev.id]) {
    _seGrantEventRewards(ev);
  }

  _seUpdateProgressHUD();
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
 * Pre-allocate flower particle meshes into a pool.
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
 * Call on line clears when spring event is active.
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
    p.age = 0;
    p.maxAge = 0.6 + Math.random() * 0.5;
    _seActiveParticles.push(p);
  }
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
    p.vel.y -= 4.0 * dt;  // gentle gravity + drift
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

  const prog = getSeasonalEventProgress();
  if (!prog) { el.style.display = 'none'; return; }

  const accent = (_seActiveEvent.theme && _seActiveEvent.theme.hudAccent) || '#f472b6';
  const icon   = _seActiveEvent.icon || '🌸';

  if (prog.completed) {
    el.innerHTML =
      `<div class="se-prog-inner se-prog-done">` +
        `<span class="se-prog-icon">${icon}</span>` +
        `<span class="se-prog-label">Spring Challenge <strong>Complete!</strong></span>` +
        `<span class="se-prog-badge">🎖</span>` +
      `</div>`;
  } else {
    el.innerHTML =
      `<div class="se-prog-inner">` +
        `<span class="se-prog-icon">${icon}</span>` +
        `<span class="se-prog-label">${prog.linesCleared}/${prog.target} lines</span>` +
        `<div class="se-prog-bar-wrap">` +
          `<div class="se-prog-bar-fill" style="width:${prog.pct}%;background:${_seEsc(accent)}"></div>` +
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
  const days   = _seDaysLeft(ev);
  const accent = (ev.theme && ev.theme.hudAccent) || '#f472b6';

  el.innerHTML =
    `<div class="se-ticker-inner">` +
      `<span class="se-ticker-label">${_seEsc(ev.icon || '🌸')} ${_seEsc(ev.name)}</span>` +
      (prog
        ? `<span class="se-ticker-progress">${prog.linesCleared}/${prog.target} lines</span>` +
          `<div class="se-ticker-bar-wrap"><div class="se-ticker-bar-fill" style="width:${prog.pct}%;background:${_seEsc(accent)}"></div></div>`
        : '') +
      `<span class="se-ticker-days">${days}d left</span>` +
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

  const ev     = _seActiveEvent;
  const prog   = getSeasonalEventProgress();
  const days   = _seDaysLeft(ev);
  const daysStr = days === 1 ? '1 day left' : `${days} days left`;
  const accent = (ev.theme && ev.theme.bannerAccent) || '#ec4899';
  const rewarded = _seRewarded[ev.id];

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
        `<div class="se-banner-days">${_seEsc(daysStr)}</div>` +
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
            `<span class="se-banner-goal-progress">${prog.linesCleared} / ${prog.target} lines</span>`
          : '') +
        `<button class="se-banner-rewards-btn" style="border-color:${_seEsc(accent)};color:${_seEsc(accent)}" onclick="showSeasonalEventRewards()">&#127873; Rewards</button>` +
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

  panelEl.innerHTML =
    `<div class="se-cos-header">` +
      `<span>${_seEsc(ev.icon || '🌸')} EVENT REWARDS</span>` +
      `<button class="se-cos-close" onclick="hideSeasonalEventCosmetics()">&#10005;</button>` +
    `</div>` +
    `<div class="se-cos-subtitle">` +
      `Complete the challenge to earn these rewards.<br>They will never return once the event ends.` +
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

// ── Block theme override ──────────────────────────────────────────────────────

/**
 * Returns the spring block color for a landing block, or null for no override.
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

  // Apply spring CSS class to game container when event is active
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

  // Refresh ticker every 5 minutes
  if (_seTickerInterval) clearInterval(_seTickerInterval);
  if (_seActiveEvent) {
    _seTickerInterval = setInterval(() => {
      // Re-check if event expired
      if (!_seIsEventActive(_seActiveEvent)) {
        _seActiveEvent = null;
        root.classList.remove('seasonal-event-active');
        root.removeAttribute('data-seasonal-event');
      }
      _seRefreshTicker();
      _seUpdateProgressHUD();
    }, 5 * 60 * 1000);
  }
}

// Ghost replay overlay — shows the personal best run as semi-transparent
// falling pieces during live gameplay.
//
// Supported modes: classic, sprint, blitz, marathon.
// Feature is opt-in; default OFF.  Toggle in Settings panel.
//
// Requires: config.js, state.js, THREE loaded before this file.

// ── Constants ─────────────────────────────────────────────────────────────────
const GHOST_REPLAY_SETTING_KEY  = 'mineCtris_ghostReplayEnabled';
const GHOST_BEST_KEY_PREFIX     = 'mineCtris_bestReplay_';
const GHOST_SUPPORTED_MODES     = new Set(['classic', 'sprint', 'blitz', 'marathon']);
const _GHOST_OPACITY            = 0.20;  // block face opacity
const _GHOST_COLOR              = 0xc8c8d8; // light blue-grey tint

// ── Settings ──────────────────────────────────────────────────────────────────
/** Global: true = show ghost replay overlay during supported modes. Default OFF. */
let ghostReplayEnabled = false;

function ghostReplayLoadSetting() {
  try {
    const raw = localStorage.getItem(GHOST_REPLAY_SETTING_KEY);
    ghostReplayEnabled = (raw === 'true');
  } catch (_) {}
}

function ghostReplayApplySetting(enabled) {
  ghostReplayEnabled = enabled;
  try { localStorage.setItem(GHOST_REPLAY_SETTING_KEY, String(enabled)); } catch (_) {}
  if (!enabled) ghostReplayStop();
}

// ── Module state ──────────────────────────────────────────────────────────────
let _ghostGroup       = null;   // THREE.Group holding all ghost meshes
let _ghostActive      = false;
let _ghostData        = null;   // best replay { pieces[], score, mode, duration }
let _ghostPieceIdx    = 0;      // next unspawned piece index
let _ghostElapsed     = 0;      // seconds elapsed in ghost playback
let _ghostLivePieces  = [];     // [{ group, age, maxAge }]
let _ghostBestScore   = 0;
let _ghostHudTimer    = 0;      // throttle HUD refresh

// ── Init (called once from main.js after scene exists) ─────────────────────────
function ghostReplayInit() {
  ghostReplayLoadSetting();
  if (typeof scene !== 'undefined' && scene) {
    _ghostGroup = new THREE.Group();
    _ghostGroup.name = 'ghostReplayGroup';
    scene.add(_ghostGroup);
  }
  _ghostSetHudVisible(false);
}

// ── Best-replay storage ───────────────────────────────────────────────────────

/**
 * Save replayData as best for its mode when it beats the existing high score.
 * Called from replayFinishRecording just before _replayData is cleared.
 */
function ghostReplaySaveBest(replayData) {
  if (!replayData || !GHOST_SUPPORTED_MODES.has(replayData.mode)) return;
  const key = GHOST_BEST_KEY_PREFIX + replayData.mode;
  try {
    const existing = ghostReplayGetBest(replayData.mode);
    if (!existing || replayData.score > existing.score) {
      try {
        localStorage.setItem(key, JSON.stringify(replayData));
      } catch (quotaErr) {
        // Storage full — evict oldest ghost key and retry once
        _ghostEvictOldest(key);
        try { localStorage.setItem(key, JSON.stringify(replayData)); } catch (_) {
          console.warn('[GhostReplay] Could not save best replay (quota).');
        }
      }
    }
  } catch (e) {
    console.warn('[GhostReplay] Save error:', e);
  }
}

function ghostReplayGetBest(mode) {
  try {
    const raw = localStorage.getItem(GHOST_BEST_KEY_PREFIX + mode);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function _ghostEvictOldest(exceptKey) {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(GHOST_BEST_KEY_PREFIX) && k !== exceptKey) keys.push(k);
    }
  } catch (_) {}
  if (keys.length) { try { localStorage.removeItem(keys[0]); } catch (_) {} }
}

// ── Playback lifecycle ────────────────────────────────────────────────────────

/**
 * Start ghost playback for the given mode.
 * Called from replayAutoStart (after mode is determined).
 */
function ghostReplayStart(mode) {
  ghostReplayStop();

  if (!ghostReplayEnabled) return;
  if (!GHOST_SUPPORTED_MODES.has(mode)) return;

  const data = ghostReplayGetBest(mode);
  if (!data || !Array.isArray(data.pieces) || data.pieces.length === 0) return;

  _ghostData      = data;
  _ghostPieceIdx  = 0;
  _ghostElapsed   = 0;
  _ghostActive    = true;
  _ghostBestScore = data.score || 0;
  _ghostHudTimer  = 0;

  _ghostSetHudVisible(true);
  _ghostUpdateHud();
}

/** Stop ghost and clean up all meshes. Called from replayOnReset and ghostReplayApplySetting. */
function ghostReplayStop() {
  _ghostActive   = false;
  _ghostData     = null;
  _ghostPieceIdx = 0;
  _ghostElapsed  = 0;

  _ghostLivePieces.forEach(function(gp) {
    if (_ghostGroup) _ghostGroup.remove(gp.group);
    _ghostDisposePiece(gp.group);
  });
  _ghostLivePieces = [];

  _ghostSetHudVisible(false);
}

// ── Per-frame tick ─────────────────────────────────────────────────────────────

/** Called from the game loop each frame with the live delta (seconds). */
function ghostReplayTick(delta) {
  if (!_ghostActive || !_ghostData) return;
  if (typeof isGameOver !== 'undefined' && isGameOver) return;
  if (typeof isPaused !== 'undefined' && isPaused) return;

  _ghostElapsed += delta;

  // Spawn pieces whose recorded timestamp has been reached
  while (_ghostPieceIdx < _ghostData.pieces.length) {
    const pd = _ghostData.pieces[_ghostPieceIdx];
    if (pd.t > _ghostElapsed) break;
    _ghostSpawnPiece(pd);
    _ghostPieceIdx++;
  }

  // Fall speed: approximate the base game speed (GRAVITY/4 at difficulty 1)
  const fallSpeed = (GRAVITY / 4);

  // Update ghost pieces — fall and fade
  for (let i = _ghostLivePieces.length - 1; i >= 0; i--) {
    const gp = _ghostLivePieces[i];
    gp.age += delta;
    gp.group.position.y -= fallSpeed * delta;

    // Fade toward zero in the final 25% of the piece's lifetime
    const lifeRatio = gp.age / gp.maxAge;
    const opacity   = (lifeRatio > 0.75)
      ? _GHOST_OPACITY * (1 - (lifeRatio - 0.75) / 0.25)
      : _GHOST_OPACITY;

    gp.group.traverse(function(obj) {
      if (obj.isMesh && obj.material) obj.material.opacity = Math.max(0, opacity);
    });

    // Remove when below board floor or lifetime exceeded
    if (gp.group.position.y < -BLOCK_SIZE * 2 || gp.age >= gp.maxAge) {
      if (_ghostGroup) _ghostGroup.remove(gp.group);
      _ghostDisposePiece(gp.group);
      _ghostLivePieces.splice(i, 1);
    }
  }

  // Refresh HUD at ~4 Hz
  _ghostHudTimer += delta;
  if (_ghostHudTimer >= 0.25) {
    _ghostHudTimer = 0;
    _ghostUpdateHud();
  }

  // Deactivate when all recorded pieces have been shown
  if (_ghostPieceIdx >= _ghostData.pieces.length && _ghostLivePieces.length === 0) {
    _ghostActive = false;
    _ghostSetHudVisible(false);
  }
}

// ── Piece mesh creation ───────────────────────────────────────────────────────

function _ghostSpawnPiece(pd) {
  if (!_ghostGroup) return;
  const shape = (typeof SHAPES !== 'undefined') ? SHAPES[pd.i] : null;
  if (!shape) return;

  const group = new THREE.Group();

  const rows = shape.length;
  const cols = shape[0].length;
  const pivotX = (cols / 2 - 0.5) * BLOCK_SIZE;
  const pivotY = (-rows / 2 + 0.5) * BLOCK_SIZE;

  shape.forEach(function(row, y) {
    row.forEach(function(val, x) {
      if (!val) return;
      const geo = new THREE.BoxGeometry(
        BLOCK_SIZE * 0.96, BLOCK_SIZE * 0.96, BLOCK_SIZE * 0.96);
      const mat = new THREE.MeshBasicMaterial({
        color:      _GHOST_COLOR,
        transparent: true,
        opacity:    _GHOST_OPACITY,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      // Position with pivot subtracted (mirrors createPiece3D)
      mesh.position.set(
        x * BLOCK_SIZE - pivotX,
       -y * BLOCK_SIZE - pivotY,
        0
      );
      group.add(mesh);
    });
  });

  // Spawn at the recorded x/z position, at the standard spawn height
  const spawnX = (typeof pd.x === 'number') ? pd.x : 0;
  const spawnZ = (typeof pd.z === 'number') ? pd.z : 0;
  group.position.set(spawnX + pivotX, WORLD_SIZE * 0.6, spawnZ);

  _ghostGroup.add(group);

  // Max lifetime: time to fall from spawn height to floor, plus a small buffer
  const fallDist = WORLD_SIZE * 0.6 + BLOCK_SIZE * 3;
  const maxAge   = fallDist / (GRAVITY / 4) + 0.5;

  _ghostLivePieces.push({ group: group, age: 0, maxAge: maxAge });
}

function _ghostDisposePiece(group) {
  group.traverse(function(obj) {
    if (obj.isMesh) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }
  });
}

// ── Score comparison HUD ──────────────────────────────────────────────────────

function _ghostSetHudVisible(visible) {
  const el = document.getElementById('ghost-replay-hud');
  if (el) el.style.display = visible ? 'block' : 'none';
}

function _ghostUpdateHud() {
  const scoreEl = document.getElementById('ghost-replay-score');
  if (!scoreEl || !_ghostActive) return;

  const liveScore = (typeof score !== 'undefined') ? score : 0;
  const bestScore = _ghostBestScore;
  const ahead     = liveScore >= bestScore;

  scoreEl.innerHTML =
    '<span class="ghost-score-live' + (ahead ? ' ghost-ahead' : ' ghost-behind') + '">' +
    'You: ' + liveScore.toLocaleString() +
    '</span>' +
    '<span class="ghost-score-sep"> | </span>' +
    '<span class="ghost-score-best">Best: ' + bestScore.toLocaleString() + '</span>';
}

/**
 * Public: refresh HUD immediately.
 * Call from updateScoreHUD() so the comparison stays in sync with each score update.
 */
function ghostReplayRefreshHud() {
  if (_ghostActive) _ghostUpdateHud();
}

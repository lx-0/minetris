// Replay recording and playback system.
// Records player inputs and piece spawns during gameplay for deterministic review.
// Stores up to 5 replays in localStorage; personal bests are auto-saved.
// Requires: state.js, config.js, pieces.js loaded first.

const REPLAY_STORAGE_KEY = 'mineCtris_replays';
const REPLAY_MAX_COUNT   = 5;
const REPLAY_VERSION     = 1;

// ── Recording state ────────────────────────────────────────────────────────────
let _replayRecording = false;
let _replayData      = null;  // { version, mode, date, score, duration, pieces[], inputs[] }

// ── Playback state ─────────────────────────────────────────────────────────────
let isReplayMode          = false;  // blocks live input when true
let _replayPlaying        = false;
let _replayPaused         = false;  // true while paused mid-playback
let _replayPlayData       = null;
let _replayPieceIdx       = 0;
let _replayInputIdx       = 0;
let replaySpeedMultiplier = 1;      // 1 / 2 / 4 — applied to delta in game loop

// ── Auto-start recording ───────────────────────────────────────────────────────

/** Called at first piece spawn; detects mode and starts recording automatically. */
function replayAutoStart() {
  if (_replayRecording || isReplayMode) return;
  // Determine current game mode from global flags
  const mode = (typeof isSprintMode !== 'undefined' && isSprintMode) ? 'sprint'
    : (typeof isBlitzMode !== 'undefined' && isBlitzMode) ? 'blitz'
    : (typeof isDailyChallenge !== 'undefined' && isDailyChallenge) ? 'daily'
    : (typeof isWeeklyChallenge !== 'undefined' && isWeeklyChallenge) ? 'weekly'
    : (typeof isSurvivalMode !== 'undefined' && isSurvivalMode) ? 'survival'
    : 'classic';
  _replayRecording = true;
  _replayData = {
    version: REPLAY_VERSION,
    mode:    mode,
    date:    new Date().toISOString(),
    score:   0,
    duration: 0,
    pieces:  [],
    inputs:  [],
  };
}

// ── Recording API ──────────────────────────────────────────────────────────────

/** Record a piece spawn. Called from spawnFallingPiece. */
function replayRecordPiece(index, spawnX, spawnZ, rotationInterval, t) {
  if (!_replayRecording || !_replayData) return;
  _replayData.pieces.push({
    t:  Math.round(t * 1000) / 1000,
    i:  index,
    x:  Math.round(spawnX * 100) / 100,
    z:  Math.round(spawnZ * 100) / 100,
    ri: Math.round(rotationInterval * 1000) / 1000,
  });
}

/** Record a player input event. Called from input handlers. */
function replayRecordInput(type, code, t) {
  if (!_replayRecording || !_replayData) return;
  _replayData.inputs.push({
    t:    Math.round(t * 1000) / 1000,
    type: type,
    code: code,
  });
}

/** Finalise recording at game over. Returns { isNewPB } or null. */
function replayFinishRecording(finalScore, linesCleared, blocksMined, duration) {
  if (!_replayRecording || !_replayData) return null;
  _replayRecording = false;

  _replayData.score       = finalScore;
  _replayData.linesCleared = linesCleared;
  _replayData.blocksMined  = blocksMined;
  _replayData.duration     = Math.round(duration);

  // Detect personal best for this mode
  const existing  = replayLoadAll();
  const sameMode  = existing.filter(function(r) { return r.mode === _replayData.mode; });
  const bestScore = sameMode.length > 0 ? Math.max.apply(null, sameMode.map(function(r) { return r.score; })) : 0;
  const isNewPB   = finalScore > bestScore;
  _replayData.isPB = isNewPB;

  // Insert, keep PBs, trim to max
  existing.unshift(_replayData);
  existing.sort(function(a, b) {
    if (a.isPB && !b.isPB) return -1;
    if (!a.isPB && b.isPB) return 1;
    return b.score - a.score;
  });
  const trimmed = existing.slice(0, REPLAY_MAX_COUNT);
  try {
    localStorage.setItem(REPLAY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[Replay] Save failed:', e);
  }

  const result = { isNewPB: isNewPB };
  _replayData = null;
  return result;
}

/** Stop any active recording without saving (e.g. on resetGame during playback). */
function replayOnReset() {
  _replayRecording = false;
  _replayData      = null;
  if (_replayPlaying) {
    isReplayMode          = false;
    _replayPlaying        = false;
    _replayPaused         = false;
    _replayPlayData       = null;
    _replayPieceIdx       = 0;
    _replayInputIdx       = 0;
    replaySpeedMultiplier = 1;
    _hideReplayControls();
  }
}

// ── localStorage helpers ───────────────────────────────────────────────────────

function replayLoadAll() {
  try {
    const raw = localStorage.getItem(REPLAY_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch (e) {
    return [];
  }
}

// ── Playback API ───────────────────────────────────────────────────────────────

function replayStartPlayback(data, speed) {
  if (!data) return;
  isReplayMode          = true;
  _replayPlaying        = true;
  _replayPlayData       = data;
  _replayPieceIdx       = 0;
  _replayInputIdx       = 0;
  replaySpeedMultiplier = speed || 1;
  _showReplayControls(speed || 1);
}

function replayStopPlayback() {
  isReplayMode          = false;
  _replayPlaying        = false;
  _replayPaused         = false;
  _replayPlayData       = null;
  _replayPieceIdx       = 0;
  _replayInputIdx       = 0;
  replaySpeedMultiplier = 1;
  _hideReplayControls();
  // Reset world then show start screen
  if (typeof resetGame === 'function') resetGame();
  var blockerEl = document.getElementById('blocker');
  if (blockerEl) blockerEl.style.display = 'flex';
  var instructionsEl = document.getElementById('instructions');
  if (instructionsEl) instructionsEl.style.display = '';
}

/** Called from spawnFallingPiece when isReplayMode is true.
 *  Returns { index, shape, spawnX, spawnZ, rotationInterval } or null when exhausted. */
function replayGetNextPiece() {
  if (!_replayPlayData || _replayPieceIdx >= _replayPlayData.pieces.length) return null;
  const p = _replayPlayData.pieces[_replayPieceIdx++];
  return {
    index:            p.i,
    shape:            SHAPES[p.i],
    spawnX:           p.x,
    spawnZ:           p.z,
    rotationInterval: p.ri,
  };
}

/** Called from game loop each frame with current gameElapsedSeconds. */
function replayTick(t) {
  if (!_replayPlaying || !_replayPlayData || _replayPaused) return;
  // Fire all pending inputs whose game-time has been reached
  while (_replayInputIdx < _replayPlayData.inputs.length) {
    const inp = _replayPlayData.inputs[_replayInputIdx];
    if (inp.t > t) break;
    _replayFireInput(inp);
    _replayInputIdx++;
  }
}

/** Toggle pause / resume during replay playback. */
function replayTogglePause() {
  if (!_replayPlaying) return;
  _replayPaused = !_replayPaused;
  const label = document.getElementById('replay-controls-label');
  if (label) label.textContent = _replayPaused ? '\u23F8 PAUSED' : '\u25B6 REPLAY';
}

function _replayFireInput(inp) {
  const synth = { code: inp.code, button: inp.code, preventDefault: function() {}, target: document.body };
  if (inp.type === 'keydown' && typeof onKeyDown === 'function') {
    onKeyDown(synth);
  } else if (inp.type === 'keyup' && typeof onKeyUp === 'function') {
    onKeyUp(synth);
  } else if (inp.type === 'mousedown' && typeof onMouseDown === 'function') {
    onMouseDown({ button: inp.code, preventDefault: function() {} });
  } else if (inp.type === 'wheel' && typeof onWheel === 'function') {
    onWheel({ deltaY: inp.code > 0 ? 1 : -1 });
  }
}

// ── Export / Import ────────────────────────────────────────────────────────────

function replayExport(data) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  } catch (e) {
    console.warn('[Replay] Export failed:', e);
    return null;
  }
}

function replayImport(b64) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch (e) {
    console.warn('[Replay] Import failed:', e);
    return null;
  }
}

// ── Speed control ──────────────────────────────────────────────────────────────

function replaySetSpeed(speed) {
  replaySpeedMultiplier = speed;
  const disp = document.getElementById('replay-speed-display');
  if (disp) disp.textContent = speed + 'x';
}

// ── UI: replay controls overlay (shown during playback) ────────────────────────

function _showReplayControls(speed) {
  const el = document.getElementById('replay-controls');
  if (!el) return;
  el.style.display = 'flex';
  replaySetSpeed(speed || 1);
  const label = document.getElementById('replay-controls-label');
  if (label) label.textContent = '\u25B6 REPLAY';
}

function _hideReplayControls() {
  const el = document.getElementById('replay-controls');
  if (el) el.style.display = 'none';
}

// ── UI: game-over replay section ───────────────────────────────────────────────

/** Populate the replay section on the game-over screen. Called from triggerGameOver. */
function replayInitGameOverUI() {
  const section = document.getElementById('go-replay-section');
  if (!section) return;

  const replays = replayLoadAll();
  if (replays.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  const list = document.getElementById('go-replay-list');
  if (!list) return;

  list.innerHTML = '';
  replays.forEach(function(r) {
    const dur = r.duration || 0;
    const mm  = Math.floor(dur / 60).toString().padStart(2, '0');
    const ss  = (dur % 60).toString().padStart(2, '0');
    const dateStr = r.date ? new Date(r.date).toLocaleDateString() : '';
    const pbBadge = r.isPB ? '<span class="replay-pb-badge">PB</span>' : '';

    const li = document.createElement('div');
    li.className = 'replay-list-item';
    li.innerHTML =
      pbBadge +
      '<span class="replay-item-mode">' + (r.mode || 'classic') + '</span>' +
      '<span class="replay-item-score">' + (r.score || 0) + '</span>' +
      '<span class="replay-item-time">' + mm + ':' + ss + '</span>' +
      '<span class="replay-item-date">' + dateStr + '</span>';

    const watchBtn = document.createElement('button');
    watchBtn.className = 'replay-watch-btn';
    watchBtn.textContent = 'Watch';
    watchBtn.onclick = function() { _launchReplayFromGameOver(r); };

    const shareBtn = document.createElement('button');
    shareBtn.className = 'replay-share-btn';
    shareBtn.textContent = 'Share';
    shareBtn.onclick = function() { _showReplayShareFlyout(r, shareBtn); };

    li.appendChild(watchBtn);
    li.appendChild(shareBtn);
    list.appendChild(li);
  });
}

function _launchReplayFromGameOver(replayData) {
  // Hide game over screen
  const goEl = document.getElementById('game-over-screen');
  if (goEl) goEl.style.display = 'none';

  // Store ref before resetGame (which calls replayOnReset, clearing _replayPlayData)
  const _pending = replayData;

  // Clear world and pieces; replayOnReset will run inside but _replayPlaying is false so it's a no-op
  if (typeof resetGame === 'function') resetGame();

  // Start playback after world is cleared
  replayStartPlayback(_pending, 1);

  // Lock pointer so the game loop runs (user gesture satisfies requirement)
  if (typeof controls !== 'undefined' && controls && typeof controls.lock === 'function') {
    controls.lock();
  }
}

function _showReplayShareFlyout(replayData, anchorBtn) {
  // Toggle: if flyout already open under this button, close it
  const existing = anchorBtn.parentElement.querySelector('.replay-share-flyout');
  if (existing) { existing.remove(); return; }

  const b64 = replayExport(replayData);
  if (!b64) return;

  const wrap = document.createElement('div');
  wrap.className = 'replay-share-flyout';

  const input = document.createElement('input');
  input.type     = 'text';
  input.readOnly = true;
  input.value    = b64;
  input.className = 'replay-share-input';

  wrap.appendChild(input);
  anchorBtn.insertAdjacentElement('afterend', wrap);
  input.select();

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(b64).then(function() {
      anchorBtn.textContent = 'Copied!';
      setTimeout(function() { anchorBtn.textContent = 'Share'; }, 1500);
    });
  }
}

/** Show import dialog for pasting a shared replay string. */
function replayShowImportDialog() {
  // Toggle existing modal
  const existing = document.getElementById('replay-import-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id        = 'replay-import-modal';
  modal.className = 'replay-import-modal';
  modal.innerHTML =
    '<div class="replay-import-inner">' +
      '<div class="replay-import-title">Import Replay</div>' +
      '<input id="replay-import-input" type="text" ' +
        'placeholder="Paste replay string here..." ' +
        'class="replay-import-input">' +
      '<div class="replay-import-row">' +
        '<button id="replay-import-ok">Watch</button>' +
        '<button id="replay-import-cancel">Cancel</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  document.getElementById('replay-import-cancel').onclick = function() { modal.remove(); };
  document.getElementById('replay-import-ok').onclick = function() {
    const val  = (document.getElementById('replay-import-input').value || '').trim();
    const data = replayImport(val);
    if (!data || !Array.isArray(data.pieces)) {
      document.getElementById('replay-import-input').style.borderColor = '#f44';
      return;
    }
    modal.remove();
    const goEl = document.getElementById('game-over-screen');
    if (goEl) goEl.style.display = 'none';
    if (typeof resetGame === 'function') resetGame();
    replayStartPlayback(data, 1);
    if (typeof controls !== 'undefined' && controls && typeof controls.lock === 'function') {
      controls.lock();
    }
  };
}

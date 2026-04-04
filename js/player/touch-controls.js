// Touch controls overlay — virtual D-pad + action buttons for mobile gameplay.
// Detects touch-capable devices and displays a transparent button overlay.
// All input is translated directly into game state (movement booleans, applyNudge, etc.)
// so existing game logic requires no changes.
//
// Requires: state.js (moveLeft/Right/Forward/Backward, canJump, playerVelocity,
//           playerOnGround, isPaused, gameTimerRunning),
//           pieces.js (applyNudge), config.js (JUMP_VELOCITY)
// Initialised by: input.js (touch detection gate)

const TOUCH_CONTROLS_STORAGE_KEY = 'mineCtris_touchControls';

// DAS timing (standard Tetris values — no DAS config in config.js)
const TC_DAS_DELAY_MS = 167;
const TC_ARR_MS       = 33;

// null = auto-detect from device; true/false = manual override via settings
let _tcEnabledOverride = null;

// Whether the game is currently in the "running" state (blocker hidden)
let _tcGameRunning = false;

// Per-button DAS timers: { btnId: { delayTimer, intervalTimer } }
const _tcDAS = {};

// Map touchIdentifier → button element id (for multi-touch tracking)
const _tcActiveTouches = {};

// ── Detection ────────────────────────────────────────────────────────────────

function _tcIsTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

/** Returns true if touch controls should currently be shown. */
function isTouchControlsEnabled() {
  if (_tcEnabledOverride !== null) return _tcEnabledOverride;
  return _tcIsTouchDevice();
}

// ── Persistence ──────────────────────────────────────────────────────────────

function _tcLoadSettings() {
  try {
    const raw = localStorage.getItem(TOUCH_CONTROLS_STORAGE_KEY);
    if (raw === 'true')  _tcEnabledOverride = true;
    else if (raw === 'false') _tcEnabledOverride = false;
    // anything else (null / absent) → auto-detect
  } catch (_) {}
}

/** Called by the settings toggle. val = true | false | null (auto). */
function setTouchControlsEnabled(val) {
  _tcEnabledOverride = val;
  try {
    if (val === null) localStorage.removeItem(TOUCH_CONTROLS_STORAGE_KEY);
    else localStorage.setItem(TOUCH_CONTROLS_STORAGE_KEY, String(val));
  } catch (_) {}
  _tcUpdateVisibility();
}

// ── Visibility ────────────────────────────────────────────────────────────────

function _tcUpdateVisibility() {
  const el = document.getElementById('touch-controls');
  if (!el) return;
  const shouldShow = isTouchControlsEnabled() && _tcGameRunning;
  el.classList.toggle('tc-visible', shouldShow);
}

// ── DAS helpers ───────────────────────────────────────────────────────────────

function _tcStartDAS(btnId, onTick) {
  _tcStopDAS(btnId);
  const state = {};
  _tcDAS[btnId] = state;
  onTick(); // fire immediately
  state.delayTimer = setTimeout(function () {
    if (_tcDAS[btnId] !== state) return; // cancelled
    state.intervalTimer = setInterval(onTick, TC_ARR_MS);
  }, TC_DAS_DELAY_MS);
}

function _tcStopDAS(btnId) {
  const s = _tcDAS[btnId];
  if (!s) return;
  clearTimeout(s.delayTimer);
  clearInterval(s.intervalTimer);
  delete _tcDAS[btnId];
}

// ── Haptics ───────────────────────────────────────────────────────────────────

function _tcVibrate() {
  try { if (navigator.vibrate) navigator.vibrate(10); } catch (_) {}
}

// ── Button actions ────────────────────────────────────────────────────────────

function _tcOnPress(btnId) {
  _tcVibrate();
  switch (btnId) {
    case 'tc-dpad-left':
      _tcStartDAS(btnId, function () { moveLeft = true; });
      break;

    case 'tc-dpad-right':
      _tcStartDAS(btnId, function () { moveRight = true; });
      break;

    case 'tc-dpad-down':
      _tcStartDAS(btnId, function () { moveBackward = true; });
      break;

    case 'tc-dpad-up':
      // Hard drop / jump — immediate, no DAS repeat
      if (canJump && playerOnGround && typeof JUMP_VELOCITY !== 'undefined') {
        playerVelocity.y += JUMP_VELOCITY;
        canJump = false;
        playerOnGround = false;
      }
      break;

    case 'tc-rotate-cw':
      if (typeof applyNudge === 'function') applyNudge(1, 0);
      break;

    case 'tc-rotate-ccw':
      if (typeof applyNudge === 'function') applyNudge(-1, 0);
      break;

    case 'tc-hold':
      // Power-up / use action (maps to KeyF — closest available "hold" action)
      if (typeof activateEquippedPowerup === 'function' &&
          typeof equippedPowerUpType !== 'undefined' && equippedPowerUpType) {
        activateEquippedPowerup();
      } else if (typeof activateLavaFlask === 'function') {
        activateLavaFlask();
      }
      break;

    case 'tc-pause-btn':
      _tcTogglePause();
      break;
  }
}

function _tcOnRelease(btnId) {
  switch (btnId) {
    case 'tc-dpad-left':
      _tcStopDAS(btnId);
      moveLeft = false;
      break;

    case 'tc-dpad-right':
      _tcStopDAS(btnId);
      moveRight = false;
      break;

    case 'tc-dpad-down':
      _tcStopDAS(btnId);
      moveBackward = false;
      break;

    case 'tc-dpad-up':
      canJump = true;
      break;
  }
}

// ── Pause ─────────────────────────────────────────────────────────────────────

function _tcTogglePause() {
  if (typeof controls !== 'undefined' && controls && controls.isLocked) {
    // Pointer-locked session: unlock triggers the existing pause flow in main.js
    controls.unlock();
  } else {
    // Touch-only session: toggle pause manually
    if (typeof isPaused === 'undefined') return;
    isPaused = !isPaused;
    const pauseScreenEl = document.getElementById('pause-screen');
    if (pauseScreenEl) pauseScreenEl.style.display = isPaused ? 'flex' : 'none';
    if (typeof gameTimerRunning !== 'undefined') gameTimerRunning = !isPaused;
    if (isPaused) {
      // Stop all movement
      moveLeft = moveRight = moveForward = moveBackward = false;
    }
  }
}

// ── Touch event binding ───────────────────────────────────────────────────────

function _tcBindButton(el) {
  const btnId = el.id;

  el.addEventListener('touchstart', function (e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      _tcActiveTouches[e.changedTouches[i].identifier] = btnId;
    }
    el.classList.add('tc-active');
    _tcOnPress(btnId);
  }, { passive: false });

  function handleRelease(e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      delete _tcActiveTouches[e.changedTouches[i].identifier];
    }
    // Only release if no remaining touches are still on this button
    let stillActive = false;
    for (const id in _tcActiveTouches) {
      if (_tcActiveTouches[id] === btnId) { stillActive = true; break; }
    }
    if (!stillActive) {
      el.classList.remove('tc-active');
      _tcOnRelease(btnId);
    }
  }

  el.addEventListener('touchend',    handleRelease, { passive: false });
  el.addEventListener('touchcancel', function (e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      delete _tcActiveTouches[e.changedTouches[i].identifier];
    }
    el.classList.remove('tc-active');
    _tcOnRelease(btnId);
  }, { passive: false });
}

// ── Game-state observer ───────────────────────────────────────────────────────

function _tcObserveGameState() {
  // Watch the blocker element: hidden = game running, visible = paused/menu
  const blockerEl = document.getElementById('blocker');
  if (!blockerEl) return;

  const obs = new MutationObserver(function () {
    const hidden = blockerEl.style.display === 'none';
    if (_tcGameRunning !== hidden) {
      _tcGameRunning = hidden;
      _tcUpdateVisibility();
      if (!hidden) {
        // Game stopped — release all held directions immediately
        moveLeft = moveRight = moveForward = moveBackward = false;
        for (const btnId in _tcDAS) _tcStopDAS(btnId);
        document.querySelectorAll('.tc-btn').forEach(function (b) {
          b.classList.remove('tc-active');
        });
      }
    }
  });

  obs.observe(blockerEl, { attributes: true, attributeFilter: ['style'] });

  // Also check current state on init
  _tcGameRunning = (blockerEl.style.display === 'none');
}

// ── Public init ───────────────────────────────────────────────────────────────

/**
 * Initialise the touch controls overlay.
 * Called from input.js after the DOM is ready.
 */
function initTouchControls() {
  _tcLoadSettings();

  // Bind all buttons
  document.querySelectorAll('.tc-btn').forEach(_tcBindButton);

  // Block scroll/zoom on the entire overlay
  const overlay = document.getElementById('touch-controls');
  if (overlay) {
    overlay.addEventListener('touchmove', function (e) {
      e.preventDefault();
    }, { passive: false });
  }

  // Observe game running state
  _tcObserveGameState();

  // Set initial visibility
  _tcUpdateVisibility();
}

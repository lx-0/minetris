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

// DAS timing — use mobile-tuned values from MOBILE_OVERRIDES when available.
const TC_DAS_DELAY_MS = (typeof MOBILE_OVERRIDES !== 'undefined') ? MOBILE_OVERRIDES.dasDelayMs : 137;
const TC_ARR_MS       = (typeof MOBILE_OVERRIDES !== 'undefined') ? MOBILE_OVERRIDES.arrMs      : 33;

// Global flag read by pieces.js, shadows.js, etc. to apply mobile feel overrides.
let mobileOverridesActive = false;

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
  const shouldShow = isTouchControlsEnabled() && _tcGameRunning && !_tcKeyboardActive;
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
      if (typeof rotatePlayerPiece === 'function') rotatePlayerPiece(true);
      break;

    case 'tc-rotate-ccw':
      if (typeof rotatePlayerPiece === 'function') rotatePlayerPiece(false);
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

// ── Gesture zone (swipe / tap / long-press on the game canvas) ────────────────
//
// Mapped gestures:
//   Single tap        → rotate CW
//   Two-finger tap    → rotate CCW
//   Swipe left/right  → move piece (steps proportional to distance)
//   Swipe down        → soft drop (live, cancels on lift)
//   Swipe up          → hard drop
//   Long press        → activate held/power-up piece

const TC_SWIPE_MIN_PX  = 30;   // min travel to count as a swipe
const TC_TAP_MAX_PX    = 12;   // max travel to count as a tap
const TC_TAP_MAX_MS    = 200;  // max duration (ms) for a tap
const TC_SWIPE_MAX_MS  = 400;  // max duration (ms) for a directional swipe

/** Long-press duration (ms) to trigger hold-piece / power-up. */
const TC_LONG_PRESS_MS = 500;

// touchId → { startX, startY, startT, longTimer }
const _tcGestureState = {};
// Peak concurrent touch count within the current gesture cycle
let _tcGestureMaxFingers = 0;
// True while a live soft-drop swipe is held
let _tcGestureSoftDrop = false;

function _tcGestureStartSoftDrop() {
  if (_tcGestureSoftDrop) return;
  _tcGestureSoftDrop = true;
  _tcStartDAS('gz-softdrop', function () { moveBackward = true; });
}

function _tcGestureEndSoftDrop() {
  if (!_tcGestureSoftDrop) return;
  _tcGestureSoftDrop = false;
  _tcStopDAS('gz-softdrop');
  moveBackward = false;
}

function _tcGestureTouchStart(e) {
  if (e.cancelable) e.preventDefault();
  var nowMs = Date.now();
  for (var i = 0; i < e.changedTouches.length; i++) {
    (function (id, cx, cy) {
      var longTimer = setTimeout(function () {
        if (!_tcGestureState[id]) return;
        delete _tcGestureState[id];
        _tcVibrate();
        if (typeof activateEquippedPowerup === 'function' &&
            typeof equippedPowerUpType !== 'undefined' && equippedPowerUpType) {
          activateEquippedPowerup();
        } else if (typeof activateLavaFlask === 'function') {
          activateLavaFlask();
        }
      }, TC_LONG_PRESS_MS);
      _tcGestureState[id] = { startX: cx, startY: cy, startT: nowMs, longTimer: longTimer };
    }(e.changedTouches[i].identifier, e.changedTouches[i].clientX, e.changedTouches[i].clientY));
  }
  _tcGestureMaxFingers = Math.max(_tcGestureMaxFingers, Object.keys(_tcGestureState).length);
}

function _tcGestureTouchMove(e) {
  if (e.cancelable) e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    var s = _tcGestureState[t.identifier];
    if (!s) continue;
    var dx = t.clientX - s.startX;
    var dy = t.clientY - s.startY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    // Cancel long-press timer if finger has moved significantly
    if (dist > TC_TAP_MAX_PX && s.longTimer) {
      clearTimeout(s.longTimer);
      s.longTimer = null;
    }
    // Begin live soft-drop when dragging downward past the swipe threshold
    if (dy > TC_SWIPE_MIN_PX && Math.abs(dy) > Math.abs(dx)) {
      _tcGestureStartSoftDrop();
    }
  }
}

function _tcGestureTouchEnd(e) {
  if (e.cancelable) e.preventDefault();
  var nowMs = Date.now();
  var peakFingers = _tcGestureMaxFingers;
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    var s = _tcGestureState[t.identifier];
    if (!s) continue;
    if (s.longTimer) clearTimeout(s.longTimer);
    delete _tcGestureState[t.identifier];

    var dx   = t.clientX - s.startX;
    var dy   = t.clientY - s.startY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var dt   = nowMs - s.startT;

    _tcGestureEndSoftDrop();

    if (dt <= TC_TAP_MAX_MS && dist < TC_TAP_MAX_PX) {
      // ── Tap ──────────────────────────────────────────────────────────────────
      _tcVibrate();
      if (peakFingers >= 2) {
        // Two-finger tap → rotate CCW
        if (typeof rotatePlayerPiece === 'function') rotatePlayerPiece(false);
      } else {
        // Single tap → rotate CW
        if (typeof rotatePlayerPiece === 'function') rotatePlayerPiece(true);
      }
    } else if (dt <= TC_SWIPE_MAX_MS && dist >= TC_SWIPE_MIN_PX) {
      // ── Swipe ─────────────────────────────────────────────────────────────────
      var absX = Math.abs(dx);
      var absY = Math.abs(dy);
      _tcVibrate();
      if (absY > absX) {
        // Vertical swipe
        if (dy < 0) {
          // Swipe up → hard drop
          if (canJump && playerOnGround && typeof JUMP_VELOCITY !== 'undefined') {
            playerVelocity.y += JUMP_VELOCITY;
            canJump = false;
            playerOnGround = false;
          }
        }
        // Swipe down is handled live via touchmove → soft drop
      } else {
        // Horizontal swipe → move piece left/right
        // Steps are proportional to swipe distance (every 40 px ≈ one additional step)
        var steps = Math.max(1, Math.floor(absX / 40));
        for (var step = 0; step < steps; step++) {
          (function (delay, dir) {
            setTimeout(function () {
              if (dir < 0) { moveLeft  = true; setTimeout(function () { moveLeft  = false; }, 30); }
              else         { moveRight = true; setTimeout(function () { moveRight = false; }, 30); }
            }, delay);
          }(step * TC_ARR_MS, dx < 0 ? -1 : 1));
        }
      }
    }
  }
  // Reset peak-finger counter once all fingers are lifted
  if (Object.keys(_tcGestureState).length === 0) {
    _tcGestureMaxFingers = 0;
  }
}

function _tcGestureTouchCancel(e) {
  for (var i = 0; i < e.changedTouches.length; i++) {
    var s = _tcGestureState[e.changedTouches[i].identifier];
    if (s && s.longTimer) clearTimeout(s.longTimer);
    delete _tcGestureState[e.changedTouches[i].identifier];
  }
  _tcGestureEndSoftDrop();
  if (Object.keys(_tcGestureState).length === 0) _tcGestureMaxFingers = 0;
}

/**
 * Attaches gesture listeners to the game canvas (renderer-container).
 * Also sets touch-action:none to suppress browser default gestures.
 */
function _tcInitGestureZone() {
  var el = document.getElementById('renderer-container');
  if (!el) return;
  el.style.touchAction = 'none';
  el.addEventListener('touchstart',  _tcGestureTouchStart,  { passive: false });
  el.addEventListener('touchmove',   _tcGestureTouchMove,   { passive: false });
  el.addEventListener('touchend',    _tcGestureTouchEnd,    { passive: false });
  el.addEventListener('touchcancel', _tcGestureTouchCancel, { passive: false });
}

// ── Keyboard-priority detection ───────────────────────────────────────────────
// Auto-hide touch controls when a physical keyboard is actively in use
// (common on tablets paired with a Bluetooth keyboard).

let _tcKeyboardActive = false;
let _tcKeyboardTimer  = null;
const TC_KEYBOARD_IDLE_MS = 5000; // ms of keyboard inactivity before re-showing controls

function _tcOnKeyDown(e) {
  // Ignore pure modifier keys
  if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
  if (!_tcKeyboardActive) {
    _tcKeyboardActive = true;
    _tcUpdateVisibility();
  }
  clearTimeout(_tcKeyboardTimer);
  _tcKeyboardTimer = setTimeout(function () {
    _tcKeyboardActive = false;
    _tcUpdateVisibility();
  }, TC_KEYBOARD_IDLE_MS);
}

// ── Haptic helpers (called by pieces.js / lineclear.js) ──────────────────────

/** Short pulse when a falling piece locks to the board. */
function tcVibrateOnLock() {
  try { if (navigator.vibrate && mobileOverridesActive) navigator.vibrate(18); } catch (_) {}
}

/** Stronger rumble scaled to the number of lines cleared simultaneously. */
function tcVibrateOnLineClear(numLines) {
  try {
    if (!navigator.vibrate || !mobileOverridesActive) return;
    var pattern = numLines >= 4
      ? [40, 20, 60]   // Tetris (4-line): double pulse
      : numLines === 3
        ? [30, 15, 30] // Triple
        : [20];        // 1-2 lines
    navigator.vibrate(pattern);
  } catch (_) {}
}

// ── Public init ───────────────────────────────────────────────────────────────

/**
 * Initialise the touch controls overlay.
 * Called from input.js after the DOM is ready.
 */
function initTouchControls() {
  _tcLoadSettings();

  // Activate mobile feel overrides whenever a touch device is present.
  if (_tcIsTouchDevice()) {
    mobileOverridesActive = true;
  }

  // Bind all buttons
  document.querySelectorAll('.tc-btn').forEach(_tcBindButton);

  // Block scroll/zoom on the entire overlay
  const overlay = document.getElementById('touch-controls');
  if (overlay) {
    overlay.addEventListener('touchmove', function (e) {
      e.preventDefault();
    }, { passive: false });
  }

  // Attach swipe/tap/long-press gesture zone to the game canvas
  _tcInitGestureZone();

  // Listen for physical keyboard input to auto-hide virtual controls
  if (_tcIsTouchDevice()) {
    window.addEventListener('keydown', _tcOnKeyDown, { passive: true });
  }

  // Observe game running state
  _tcObserveGameState();

  // Set initial visibility
  _tcUpdateVisibility();
}

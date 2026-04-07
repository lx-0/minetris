// Haptic feedback manager — vibration patterns for mobile touch controls and gamepad rumble.
//
// Public API:
//   initHaptics()                      — call once during init()
//   hapticsOnPieceLock()               — short pulse when a piece locks to the board
//   hapticsOnLineClear(numLines)        — rumble scaled to lines cleared (1–4)
//   hapticsOnTSpin()                    — distinctive pattern for T-Spin
//   hapticsOnCombo(comboCount)          — escalating buzz for consecutive clears
//   hapticsOnGameOver()                 — sustained rumble on game over
//   hapticsOnTouchButton()              — micro tap for virtual button presses
//   isHapticsEnabled()                  — returns master toggle state
//   getHapticsIntensity()               — returns 'light' | 'medium' | 'strong'
//   setHapticsEnabled(bool)             — persist master toggle
//   setHapticsIntensity(str)            — persist intensity level

const HAPTICS_ENABLED_KEY   = 'mineCtris_hapticsEnabled';
const HAPTICS_INTENSITY_KEY = 'mineCtris_hapticsIntensity';

// Master on/off toggle. Default ON.
let _hapticsEnabled = true;

// Intensity level: 'light' | 'medium' | 'strong'. Default 'medium'.
let _hapticsIntensity = 'medium';

// Cached low-battery state. Re-checked at most once per minute.
let _batteryLow = false;
let _batteryCheckTime = 0;

// ── Settings ──────────────────────────────────────────────────────────────────

function isHapticsEnabled() {
  return _hapticsEnabled;
}

function getHapticsIntensity() {
  return _hapticsIntensity;
}

function setHapticsEnabled(val) {
  _hapticsEnabled = !!val;
  try { localStorage.setItem(HAPTICS_ENABLED_KEY, String(_hapticsEnabled)); } catch (_) {}
}

function setHapticsIntensity(val) {
  if (val === 'light' || val === 'medium' || val === 'strong') {
    _hapticsIntensity = val;
    try { localStorage.setItem(HAPTICS_INTENSITY_KEY, _hapticsIntensity); } catch (_) {}
  }
}

function _loadHapticsSettings() {
  try {
    const en = localStorage.getItem(HAPTICS_ENABLED_KEY);
    if (en === 'true' || en === 'false') _hapticsEnabled = (en === 'true');
    const iv = localStorage.getItem(HAPTICS_INTENSITY_KEY);
    if (iv === 'light' || iv === 'medium' || iv === 'strong') _hapticsIntensity = iv;
  } catch (_) {}
}

// ── Battery guard ─────────────────────────────────────────────────────────────
// Disable haptics automatically when battery is below 20% to conserve power.

function _checkBattery(cb) {
  const now = Date.now();
  // Re-check at most once per 60 s.
  if (now - _batteryCheckTime < 60000) { cb(); return; }
  _batteryCheckTime = now;
  if (navigator.getBattery) {
    navigator.getBattery().then(function (battery) {
      _batteryLow = !battery.charging && battery.level < 0.20;
      cb();
    }).catch(function () { _batteryLow = false; cb(); });
  } else {
    _batteryLow = false;
    cb();
  }
}

// ── Intensity scale ───────────────────────────────────────────────────────────
// Maps each named intensity preset to a millisecond multiplier.

function _scale() {
  if (_hapticsIntensity === 'light')  return 0.5;
  if (_hapticsIntensity === 'strong') return 1.6;
  return 1.0; // medium
}

/** Scale a single duration or an array of durations. */
function _applyScale(pattern) {
  const s = _scale();
  if (s === 1.0) return pattern;
  if (typeof pattern === 'number') return Math.round(pattern * s);
  return pattern.map(function (v) { return Math.round(v * s); });
}

// ── Vibration helper ──────────────────────────────────────────────────────────

function _vibrate(pattern) {
  if (!_hapticsEnabled || _batteryLow) return;
  // Haptics only during active gameplay (blocker hidden = game running).
  var blockerEl = document.getElementById('blocker');
  if (blockerEl && blockerEl.style.display !== 'none') return;
  try {
    if (navigator.vibrate) navigator.vibrate(_applyScale(pattern));
  } catch (_) {}
}

// ── Gamepad rumble helper ─────────────────────────────────────────────────────

function _gamepadRumble(weakMagnitude, strongMagnitude, durationMs) {
  if (!_hapticsEnabled || _batteryLow) return;
  var blockerEl = document.getElementById('blocker');
  if (blockerEl && blockerEl.style.display !== 'none') return;
  if (typeof _gpIndex === 'undefined' || _gpIndex === null) return;
  if (!('getGamepads' in navigator)) return;
  var pads = navigator.getGamepads();
  var gp = pads[_gpIndex];
  if (!gp) return;
  var s = _scale();
  var actualWeak   = Math.min(weakMagnitude   * s, 1.0);
  var actualStrong = Math.min(strongMagnitude * s, 1.0);
  try {
    // Standard Gamepad API hapticActuators (dual-rumble)
    if (gp.vibrationActuator && typeof gp.vibrationActuator.playEffect === 'function') {
      gp.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: durationMs,
        weakMagnitude: actualWeak,
        strongMagnitude: actualStrong,
      });
    } else if (gp.hapticActuators && gp.hapticActuators.length > 0) {
      // Legacy hapticActuators API
      gp.hapticActuators[0].pulse(actualStrong, durationMs);
    }
  } catch (_) {}
}

// ── Event handlers ────────────────────────────────────────────────────────────

/** Short pulse when a piece locks to the board. */
function hapticsOnPieceLock() {
  _checkBattery(function () {
    _vibrate(15);
    _gamepadRumble(0.15, 0.08, 60);
  });
}

/**
 * Rumble scaled to the number of lines cleared simultaneously.
 *   1 line  → short (30 ms)
 *   2 lines → medium (45 ms)
 *   3 lines → medium double pulse
 *   4 lines → strong double pulse (Tetris)
 */
function hapticsOnLineClear(numLines) {
  _checkBattery(function () {
    var pattern;
    var weakMag, strongMag, dur;
    if (numLines >= 4) {
      // Tetris — strong double pulse
      pattern     = [50, 20, 70];
      weakMag     = 0.6;
      strongMag   = 0.9;
      dur         = 180;
    } else if (numLines === 3) {
      pattern     = [35, 15, 45];
      weakMag     = 0.4;
      strongMag   = 0.6;
      dur         = 120;
    } else if (numLines === 2) {
      pattern     = [40];
      weakMag     = 0.25;
      strongMag   = 0.4;
      dur         = 80;
    } else {
      pattern     = [28];
      weakMag     = 0.15;
      strongMag   = 0.25;
      dur         = 55;
    }
    _vibrate(pattern);
    _gamepadRumble(weakMag, strongMag, dur);
  });
}

/** Distinctive T-Spin pattern — quick triple tap. */
function hapticsOnTSpin() {
  _checkBattery(function () {
    _vibrate([20, 10, 20, 10, 40]);
    _gamepadRumble(0.4, 0.7, 120);
  });
}

/**
 * Escalating combo buzz.
 *   comboCount 2 → light
 *   comboCount 5 → medium
 *   comboCount 10+ → strong triple
 */
function hapticsOnCombo(comboCount) {
  _checkBattery(function () {
    var pattern, weakMag, strongMag, dur;
    if (comboCount >= 10) {
      pattern   = [25, 10, 25, 10, 45];
      weakMag   = 0.5;
      strongMag = 0.8;
      dur       = 160;
    } else if (comboCount >= 5) {
      pattern   = [20, 10, 35];
      weakMag   = 0.3;
      strongMag = 0.55;
      dur       = 100;
    } else {
      pattern   = [18];
      weakMag   = 0.15;
      strongMag = 0.3;
      dur       = 50;
    }
    _vibrate(pattern);
    _gamepadRumble(weakMag, strongMag, dur);
  });
}

/** Sustained rumble on game over. */
function hapticsOnGameOver() {
  _checkBattery(function () {
    _vibrate([80, 30, 60, 20, 40]);
    _gamepadRumble(0.7, 1.0, 400);
  });
}

/** Micro tap for virtual touch button presses. */
function hapticsOnTouchButton() {
  // Skip battery check for low-latency button feedback; short enough to be negligible.
  if (!_hapticsEnabled) return;
  var blockerEl = document.getElementById('blocker');
  if (blockerEl && blockerEl.style.display !== 'none') return;
  try { if (navigator.vibrate) navigator.vibrate(10); } catch (_) {}
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initHaptics() {
  _loadHapticsSettings();
  // Prime battery cache asynchronously — no-op if API absent.
  _checkBattery(function () {});
}

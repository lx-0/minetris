// Gamepad support — polls the Gamepad API each frame and translates
// Standard Gamepad button/axis states into the same movement flags and
// action calls used by the keyboard handler in player.js.
//
// Public API:
//   initGamepad()           — call once during init()
//   pollGamepad()           — call every animation frame BEFORE movement
//   getGamepadStatus()      — returns { connected, name } for settings UI

// ── Standard Gamepad button indices ──────────────────────────────────────────
const GP_BTN = {
  A:        0,   // Jump
  B:        1,   // Ice Bridge
  X:        2,   // Craft
  Y:        3,   // Power-up
  LB:       4,   // Rotate CCW
  RB:       5,   // Rotate CW
  LT:       6,
  RT:       7,
  SELECT:   8,
  START:    9,   // Open settings
  L3:       10,
  R3:       11,
  DPAD_UP:     12,
  DPAD_DOWN:   13,
  DPAD_LEFT:   14,
  DPAD_RIGHT:  15,
};

// Left-stick dead zone (0–1 range).
const GP_AXIS_DEAD = 0.25;

// Previous frame's button pressed states — for edge detection (one-shot actions).
let _gpPrevButtons = [];

// Index of the first gamepad we found and are using.
let _gpIndex = null;

// Human-readable label of the connected gamepad.
let _gpName = null;

// Gamepad-driven movement flags — ORed with keyboard flags in game-loop.js.
// Exposed as globals so game-loop.js can read them without coupling.
var gpMoveForward  = false;
var gpMoveBackward = false;
var gpMoveLeft     = false;
var gpMoveRight    = false;

// ── Connection events ─────────────────────────────────────────────────────────

function initGamepad() {
  if (!('getGamepads' in navigator)) return; // API not available

  window.addEventListener('gamepadconnected', function (e) {
    if (_gpIndex === null) {
      _gpIndex = e.gamepad.index;
      _gpName  = e.gamepad.id;
      _gpPrevButtons = new Array(e.gamepad.buttons.length).fill(false);
      _gpUpdateStatusUI();
    }
  });

  window.addEventListener('gamepaddisconnected', function (e) {
    if (e.gamepad.index === _gpIndex) {
      _gpIndex = null;
      _gpName  = null;
      _gpPrevButtons = [];
      gpMoveForward  = false;
      gpMoveBackward = false;
      gpMoveLeft     = false;
      gpMoveRight    = false;
      _gpUpdateStatusUI();
    }
  });

  // Detect gamepads that were already connected before the page loaded.
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < pads.length; i++) {
    if (pads[i]) {
      _gpIndex = pads[i].index;
      _gpName  = pads[i].id;
      _gpPrevButtons = new Array(pads[i].buttons.length).fill(false);
      break;
    }
  }
}

// ── Per-frame poll ────────────────────────────────────────────────────────────

function pollGamepad() {
  if (_gpIndex === null) return;
  if (!('getGamepads' in navigator)) return;

  // getGamepads() always returns a fresh snapshot.
  const pads = navigator.getGamepads();
  const gp = pads[_gpIndex];
  if (!gp) return;

  const btns = gp.buttons;
  const axes = gp.axes;

  // ── Movement flags (continuous) ──────────────────────────────────────────────
  // Written into gamepad-specific booleans so keyboard flags are never cleared
  // by gamepad input. game-loop.js ORs gpMove* with the keyboard move* vars.

  const axisX = (axes.length > 0) ? axes[0] : 0;
  const axisY = (axes.length > 1) ? axes[1] : 0;

  gpMoveForward  = (axisY < -GP_AXIS_DEAD) || _gpBtnPressed(btns, GP_BTN.DPAD_UP);
  gpMoveBackward = (axisY >  GP_AXIS_DEAD) || _gpBtnPressed(btns, GP_BTN.DPAD_DOWN);
  gpMoveLeft     = (axisX < -GP_AXIS_DEAD) || _gpBtnPressed(btns, GP_BTN.DPAD_LEFT);
  gpMoveRight    = (axisX >  GP_AXIS_DEAD) || _gpBtnPressed(btns, GP_BTN.DPAD_RIGHT);

  // ── One-shot actions (rising-edge only) ──────────────────────────────────────
  // These mirror the switch/case logic in onKeyDown but for gamepad buttons.

  const prevLen = _gpPrevButtons.length;

  // A — Jump
  if (_gpRisingEdge(btns, GP_BTN.A, prevLen)) {
    if (typeof canJump !== 'undefined' && canJump && typeof playerOnGround !== 'undefined' && playerOnGround) {
      playerVelocity.y += JUMP_VELOCITY;
      canJump = false;
      playerOnGround = false;
    }
  }

  // B — Ice Bridge
  if (_gpRisingEdge(btns, GP_BTN.B, prevLen)) {
    if (typeof activateIceBridge === 'function') activateIceBridge();
  }

  // X — Craft (disabled in Sprint/Blitz/NoIron like keyboard)
  if (_gpRisingEdge(btns, GP_BTN.X, prevLen)) {
    if (!isSprintMode && !isBlitzMode && !(typeof weeklyNoIron !== 'undefined' && weeklyNoIron)) {
      if (typeof toggleCraftingPanel === 'function') toggleCraftingPanel();
    }
  }

  // Y — Power-up
  if (_gpRisingEdge(btns, GP_BTN.Y, prevLen)) {
    if (typeof isPuzzleMode !== 'undefined' && isPuzzleMode) {
      if (typeof setThinkMode === 'function') setThinkMode(true);
    } else if (typeof equippedPowerUpType !== 'undefined' && equippedPowerUpType) {
      if (typeof activateEquippedPowerup === 'function') activateEquippedPowerup();
    } else {
      if (typeof activateLavaFlask === 'function') activateLavaFlask();
    }
  }

  // LB — Rotate CCW
  if (_gpRisingEdge(btns, GP_BTN.LB, prevLen)) {
    if (typeof applyNudge === 'function') applyNudge(-1, 0);
  }

  // RB — Rotate CW
  if (_gpRisingEdge(btns, GP_BTN.RB, prevLen)) {
    if (typeof applyNudge === 'function') applyNudge(1, 0);
  }

  // START — toggle settings overlay
  if (_gpRisingEdge(btns, GP_BTN.START, prevLen)) {
    var overlay = document.getElementById('settings-overlay');
    if (overlay) {
      if (overlay.style.display === 'none' || overlay.style.display === '') {
        if (typeof openSettings === 'function') openSettings();
      } else {
        if (typeof closeSettings === 'function') closeSettings();
      }
    }
  }

  // ── Persist previous-frame state ─────────────────────────────────────────────
  _gpPrevButtons = [];
  for (let i = 0; i < btns.length; i++) {
    _gpPrevButtons.push(_gpBtnPressed(btns, i));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _gpBtnPressed(buttons, idx) {
  if (idx >= buttons.length) return false;
  const b = buttons[idx];
  return (typeof b === 'object') ? b.pressed : (b > 0.5);
}

function _gpRisingEdge(buttons, idx, prevLen) {
  const nowPressed  = _gpBtnPressed(buttons, idx);
  const wasPressed  = (idx < prevLen) ? _gpPrevButtons[idx] : false;
  return nowPressed && !wasPressed;
}

// ── Settings UI ───────────────────────────────────────────────────────────────

/** Returns current gamepad connection info for the settings Controls tab. */
function getGamepadStatus() {
  if (_gpIndex === null) return { connected: false, name: null };
  return { connected: true, name: _gpName || 'Gamepad' };
}

function _gpUpdateStatusUI() {
  const el = document.getElementById('gamepad-status-text');
  if (!el) return;
  const st = getGamepadStatus();
  if (st.connected) {
    // Truncate long vendor strings for readability.
    const shortName = st.name.length > 48 ? st.name.slice(0, 45) + '\u2026' : st.name;
    el.textContent = '\u2705 Connected: ' + shortName;
    el.style.color = '#7f7';
  } else {
    el.textContent = '\u274C No gamepad detected — plug in a controller and press any button.';
    el.style.color = '#aaa';
  }
}

// tutorial.js — First-run interactive tutorial (v3.0).
// 5-step guided overlay shown at the start of the player's very first Classic game.
// Each step pauses gameplay, highlights the relevant control, and shows a "Got it!" button.
// A Skip button is always visible so experienced players can bail immediately.
// Requires: state.js loaded first (for global flags).

const TUTORIAL_DONE_KEY = 'mineCtris_tutorialDone';
const CRAFT_HINT_KEY    = 'mineCtris_craftHintShown';

// ── Step definitions ──────────────────────────────────────────────────────────
// trigger: not used for pause-based flow (all steps advance via "Got it!" button).
// highlight: id of the icon variant shown in #tutorial-highlight-icon.
// pauseGame: true on all real steps; false only on the final "You're ready!" wrap-up.
const TUTORIAL_STEPS = [
  {
    id: 'move',
    text: 'Move & Rotate',
    subtext: 'Use WASD or Arrow Keys to steer the falling piece. Press Q / E (or Z / X) to rotate it.',
    highlight: 'move',
    pauseGame: true,
  },
  {
    id: 'drop',
    text: 'Hard Drop',
    subtext: 'Press Space to instantly slam the piece to the bottom. On mobile, swipe down fast.',
    highlight: 'drop',
    pauseGame: true,
  },
  {
    id: 'hold',
    text: 'Hold Piece',
    subtext: 'Press Shift (or C) to save the current piece. Tap again later to swap it back in.',
    highlight: 'hold',
    pauseGame: true,
  },
  {
    id: 'craft',
    text: 'Ore Blocks & Crafting',
    subtext: 'Mine gold, diamond and lava blocks as they fall — collect materials, then press C to craft tools and power-ups.',
    highlight: 'craft',
    pauseGame: true,
  },
  {
    id: 'score',
    text: 'Line Clears & Scoring',
    subtext: 'Fill a complete row to clear it. Clear multiple rows at once for big bonuses. Dungeon entries award bonus XP!',
    highlight: 'score',
    pauseGame: true,
  },
];

let _tutorialActive  = false;
let _tutorialPaused  = false; // true while any pauseGame step is showing
let _tutorialStep    = 0;

// ── Public API ────────────────────────────────────────────────────────────────

/** Call when the game starts (pointer lock acquired for the first time). */
function initTutorial() {
  if (_isTutorialDone()) return;
  _tutorialActive = true;
  _tutorialStep   = 0;
  _showStep(0);
}

/**
 * Advance to the next step (called by the "Got it!" button).
 * On the last step this ends the tutorial instead.
 */
function dismissTutorialStep() {
  if (!_tutorialActive) return;
  _advanceStep();
}

/** Skip the tutorial immediately. */
function skipTutorial() {
  _endTutorial();
}

/**
 * Notify the tutorial that a player action occurred.
 * Kept for compatibility — no steps currently advance on events,
 * but callers in lineclear.js / input.js etc. still fire this.
 */
function tutorialNotify(/* event */) {
  // no-op in v3.0 — all advancement is via Got it! / Skip
}

/**
 * Tick the tutorial — no auto-advance timers in v3.0.
 * Kept so game-loop.js call continues to work.
 */
function updateTutorial(/* delta */) {}

/** Returns true when the tutorial wants gameplay completely paused. */
function isTutorialPaused() {
  return _tutorialPaused;
}

/** Returns true when tutorial wants pieces to fall at 50% speed (unused in v3, kept for compat). */
function isTutorialSlowActive() {
  return false;
}

/** Returns true when tutorial wants to suppress new piece spawns (unused in v3, kept for compat). */
function isTutorialSpawnSuppressed() {
  return false;
}

/** Returns true when the tutorial is actively running. */
function isTutorialActive() {
  return _tutorialActive;
}

// ── Public API (context-sensitive crafting hint) ───────────────────────────────

/**
 * Check if the context-sensitive crafting hint should fire.
 * Call after any wood block is added to inventory.
 * @param {object} inv  The current inventory map (cssColor → count).
 */
function craftHintCheck(inv) {
  if (_isCraftHintShown()) return;
  // '#8b4513' is the CSS color for Wood blocks
  if ((inv['#8b4513'] || 0) < 1) return;
  _markCraftHintShown();
  _showCraftHintToast();
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _isTutorialDone() {
  try {
    return localStorage.getItem(TUTORIAL_DONE_KEY) === '1';
  } catch (_e) {
    return true; // localStorage unavailable — skip tutorial
  }
}

function _markTutorialDone() {
  try {
    localStorage.setItem(TUTORIAL_DONE_KEY, '1');
  } catch (_e) {}
}

function _isCraftHintShown() {
  try {
    return localStorage.getItem(CRAFT_HINT_KEY) === '1';
  } catch (_e) {
    return true;
  }
}

function _markCraftHintShown() {
  try {
    localStorage.setItem(CRAFT_HINT_KEY, '1');
  } catch (_e) {}
}

function _showCraftHintToast() {
  const toast = document.getElementById('craft-hint-toast');
  if (!toast) return;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

function _showStep(idx) {
  if (idx >= TUTORIAL_STEPS.length) { _endTutorial(); return; }

  const overlayEl   = document.getElementById('tutorial-overlay');
  const textEl      = document.getElementById('tutorial-text');
  const subtextEl   = document.getElementById('tutorial-subtext');
  const dismissBtn  = document.getElementById('tutorial-dismiss-btn');
  const stepCountEl = document.getElementById('tutorial-step-count');
  const hlIconEl    = document.getElementById('tutorial-highlight-icon');
  // Legacy arrow indicators — hide them in v3
  const arrowDown   = document.getElementById('tutorial-arrow-down');
  const arrowCross  = document.getElementById('tutorial-arrow-crosshair');

  if (!overlayEl || !textEl) return;

  const step = TUTORIAL_STEPS[idx];

  textEl.textContent = step.text;

  if (subtextEl) {
    subtextEl.textContent = step.subtext || '';
    subtextEl.style.display = step.subtext ? 'block' : 'none';
  }

  // "Got it!" shown on every step
  if (dismissBtn) {
    dismissBtn.style.display = 'inline-block';
  }

  // Step counter e.g. "2 / 5"
  if (stepCountEl) {
    stepCountEl.textContent = (idx + 1) + ' / ' + TUTORIAL_STEPS.length;
  }

  // Highlight icon — swap CSS class on the icon container
  if (hlIconEl) {
    hlIconEl.className = 'tutorial-hl-' + (step.highlight || '');
    hlIconEl.style.display = step.highlight ? 'flex' : 'none';
    hlIconEl.innerHTML = _buildHighlightHTML(step.highlight);
  }

  // Hide legacy arrows
  if (arrowDown)  arrowDown.style.display  = 'none';
  if (arrowCross) arrowCross.style.display = 'none';

  // Pause gameplay while this step is showing
  _tutorialPaused = !!step.pauseGame;

  overlayEl.style.display = 'flex';
}

/** Returns the inner HTML for a highlight icon given a highlight key. */
function _buildHighlightHTML(key) {
  switch (key) {
    case 'move':
      return (
        '<div class="thl-grid">' +
          '<span></span><span class="thl-key">&#x2191;</span><span></span>' +
          '<span class="thl-key">&#x2190;</span><span class="thl-key">&#x2193;</span><span class="thl-key">&#x2192;</span>' +
          '<span class="thl-sep">+</span>' +
          '<span class="thl-key thl-wide">Q</span><span class="thl-sep">/</span><span class="thl-key thl-wide">E</span>' +
        '</div>'
      );
    case 'drop':
      return '<span class="thl-key thl-spacebar">SPACE</span>';
    case 'hold':
      return '<span class="thl-key thl-widekey">SHIFT</span>';
    case 'craft':
      return '<span class="thl-key thl-ckey">C</span>';
    case 'score':
      return '<span class="thl-score-icon">&#x1F4CA;</span>';
    default:
      return '';
  }
}

function _advanceStep() {
  _tutorialStep++;
  _tutorialPaused = false;
  _showStep(_tutorialStep);
}

function _endTutorial() {
  // Metrics: distinguish complete vs skip
  var reachedFinalStep = _tutorialStep >= TUTORIAL_STEPS.length - 1;
  if (reachedFinalStep) {
    if (typeof metricsTutorialComplete === 'function') metricsTutorialComplete();
  } else {
    if (typeof metricsTutorialSkip === 'function') metricsTutorialSkip();
  }
  _tutorialActive = false;
  _tutorialPaused = false;
  _markTutorialDone();
  // Transition from minimal to full menu for next visit
  var instrEl = document.getElementById('instructions');
  if (instrEl) instrEl.classList.remove('first-launch');
  // Award one-time tutorial completion XP
  if (typeof awardTutorialXP === 'function') awardTutorialXP();
  const overlayEl = document.getElementById('tutorial-overlay');
  if (overlayEl) overlayEl.style.display = 'none';
}

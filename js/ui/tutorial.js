// tutorial.js — First-run interactive tutorial (v4.0).
// 7-step guided overlay shown at the start of the player's very first Classic game.
// Interactive steps auto-advance when the player performs the required action.
// Explanation steps pause gameplay and require "Got it!" to proceed.
// Progress is saved so returning players can resume where they left off.
// A "Skip Tutorial" button is always visible.
// Requires: state.js loaded first (for global flags).

const TUTORIAL_DONE_KEY     = 'mineCtris_tutorialDone';
const TUTORIAL_PROGRESS_KEY = 'mineCtris_tutorialProgress';
const CRAFT_HINT_KEY        = 'mineCtris_craftHintShown';

// ── Tips system keys ────────────────────────────────────────────────────────
const TIP_KEYS = {
  firstNudge:   'mineCtris_tip_firstNudge',
  firstCombo:   'mineCtris_tip_firstCombo',
  firstTSpin:   'mineCtris_tip_firstTSpin',
  firstDanger:  'mineCtris_tip_firstDanger',
  firstTetris:  'mineCtris_tip_firstTetris',
};

// ── Step definitions ─────────────────────────────────────────────────────────
// waitFor: event name from tutorialNotify() that auto-advances this step.
//          null means the step requires "Got it!" (explain-only).
// canDismiss: true means "Got it!" is also shown as a manual skip for interactive steps.
// pauseGame: true halts falling pieces while this step is showing.
const TUTORIAL_STEPS = [
  {
    id: 'move',
    text: 'Move & Look Around',
    subtext: 'Use WASD to walk around the world. Move your mouse to look. Press W to start!',
    highlight: 'move',
    pauseGame: false,
    waitFor: 'move',
    actionLabel: 'Walk forward to continue\u2026',
  },
  {
    id: 'mine',
    text: 'Mine a Block',
    subtext: 'Look at any block and left-click to mine it. Mined blocks go straight to your inventory!',
    highlight: 'mine',
    pauseGame: false,
    waitFor: 'blockMine',
    actionLabel: 'Mine a block to continue\u2026',
  },
  {
    id: 'nudge',
    text: 'Steer the Falling Piece',
    subtext: 'Use Q and E to nudge the falling piece left or right. Z and X move it toward or away from you. The ghost shadow below shows where it will land!',
    highlight: 'nudge',
    pauseGame: false,
    waitFor: 'nudge',
    actionLabel: 'Nudge the falling piece to continue\u2026',
  },
  {
    id: 'lineclear',
    text: 'Clear Lines',
    subtext: 'Fill a complete row of the grid to clear it and score! Clearing 4 rows at once is a TETRIS \u2014 the ultimate move!',
    highlight: 'score',
    pauseGame: false,
    waitFor: 'lineClear',
    actionLabel: 'Clear a line to continue\u2026 (or click Got it!)',
    canDismiss: true,
  },
  {
    id: 'combos',
    text: 'Combos & T-Spins',
    subtext: 'Clear lines back-to-back for COMBO bonuses! Rotate a T-piece into a tight gap for a T-SPIN, which awards massive bonus XP. Back-to-back TETRIS clears multiply your score further!',
    highlight: 'combo',
    pauseGame: true,
    waitFor: null,
    canDismiss: true,
  },
  {
    id: 'craft',
    text: 'Craft & Upgrade',
    subtext: 'Rare ore blocks fall too \u2014 mine GOLD, DIAMOND, and LAVA blocks! Press C to open the Crafting Bench and upgrade your pickaxe or craft powerful power-ups.',
    highlight: 'craft',
    pauseGame: false,
    waitFor: 'craftingOpen',
    actionLabel: 'Press C to open crafting\u2026 (or click Got it!)',
    canDismiss: true,
  },
  {
    id: 'modes',
    text: 'Explore All Modes',
    subtext: null,
    highlight: 'modes',
    pauseGame: true,
    waitFor: null,
    canDismiss: true,
  },
];

let _tutorialActive  = false;
let _tutorialPaused  = false;
let _tutorialStep    = 0;
let _waitingForEvent = null; // event name we're waiting for, or null

// ── Public API ────────────────────────────────────────────────────────────────

/** Call when the game starts (pointer lock acquired for the first time). */
function initTutorial() {
  if (_isTutorialDone()) return;
  _tutorialActive  = true;
  // Resume from saved progress if available
  _tutorialStep = _loadProgress();
  _waitingForEvent = null;
  _showStep(_tutorialStep);
}

/** Replay the tutorial from the beginning (called from menu / settings). */
function replayTutorial() {
  _clearProgress();
  _tutorialActive  = true;
  _tutorialStep    = 0;
  _waitingForEvent = null;
  _showStep(0);
}

/** Advance to the next step (called by the "Got it!" button). */
function dismissTutorialStep() {
  if (!_tutorialActive) return;
  _advanceStep();
}

/** Skip the tutorial immediately. */
function skipTutorial() {
  _endTutorial(/* skipped */ true);
}

/**
 * Notify the tutorial that a player action occurred.
 * Auto-advances interactive steps when the awaited event fires.
 * @param {string} event  e.g. 'move', 'nudge', 'blockMine', 'lineClear', 'craftingOpen', 'pieceLand'
 */
function tutorialNotify(event) {
  if (!_tutorialActive) return;
  if (_waitingForEvent && event === _waitingForEvent) {
    // Mark received so we don't re-trigger
    _waitingForEvent = null;
    // Brief delay so the player sees the action feedback before the step changes
    setTimeout(_advanceStep, 600);
  }
}

/**
 * Tick the tutorial — no per-frame logic in v4.0.
 * Kept so game-loop.js call continues to work.
 */
function updateTutorial(/* delta */) {}

/** Returns true when the tutorial wants gameplay completely paused. */
function isTutorialPaused() {
  return _tutorialPaused;
}

/** Returns true when tutorial wants pieces to fall at 50% speed (unused in v4). */
function isTutorialSlowActive() {
  return false;
}

/** Returns true when tutorial wants to suppress new piece spawns (unused in v4). */
function isTutorialSpawnSuppressed() {
  return false;
}

/** Returns true when the tutorial is actively running. */
function isTutorialActive() {
  return _tutorialActive;
}

// ── Tips system ───────────────────────────────────────────────────────────────

/**
 * Fire a contextual in-game tip (shown once per lifetime).
 * Call from relevant game events after the tutorial is done.
 * @param {string} key   One of: 'firstNudge', 'firstCombo', 'firstTSpin', 'firstDanger', 'firstTetris'
 */
function tutorialTip(key) {
  if (_tutorialActive) return;  // don't overlap with tutorial
  if (!TIP_KEYS[key]) return;
  try {
    if (localStorage.getItem(TIP_KEYS[key]) === '1') return;
    localStorage.setItem(TIP_KEYS[key], '1');
  } catch (_e) { return; }
  const messages = {
    firstNudge:  '\u25B6 Tip: Use Q/E and Z/X to precisely position falling pieces!',
    firstCombo:  '\u26A1 Combo! Keep clearing lines to grow your multiplier!',
    firstTSpin:  '\u2728 T-Spin! Incredible technique \u2014 keep it up!',
    firstDanger: '\u26A0 Stack is getting high! Mine faster to clear room!',
    firstTetris: '\uD83D\uDC8E TETRIS! 4 lines at once \u2014 that\'s elite play!',
  };
  const text = messages[key];
  if (!text) return;
  _showTip(text);
}

/**
 * Check if the context-sensitive crafting hint should fire.
 * Call after any wood block is added to inventory.
 * @param {object} inv  The current inventory map (cssColor → count).
 */
function craftHintCheck(inv) {
  if (_isCraftHintShown()) return;
  if ((inv['#8b4513'] || 0) < 1) return;
  _markCraftHintShown();
  _showCraftHintToast();
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _isTutorialDone() {
  try {
    return localStorage.getItem(TUTORIAL_DONE_KEY) === '1';
  } catch (_e) {
    return true;
  }
}

function _markTutorialDone() {
  try {
    localStorage.setItem(TUTORIAL_DONE_KEY, '1');
  } catch (_e) {}
}

function _loadProgress() {
  try {
    const v = parseInt(localStorage.getItem(TUTORIAL_PROGRESS_KEY), 10);
    if (!isNaN(v) && v >= 0 && v < TUTORIAL_STEPS.length) return v;
  } catch (_e) {}
  return 0;
}

function _saveProgress(step) {
  try {
    localStorage.setItem(TUTORIAL_PROGRESS_KEY, String(step));
  } catch (_e) {}
}

function _clearProgress() {
  try {
    localStorage.removeItem(TUTORIAL_PROGRESS_KEY);
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
  setTimeout(function () { toast.style.display = 'none'; }, 4000);
}

function _showTip(text) {
  const tipEl = document.getElementById('tutorial-tip-banner');
  if (!tipEl) return;
  tipEl.textContent = text;
  tipEl.classList.remove('tut-tip-hide');
  tipEl.style.display = 'block';
  clearTimeout(tipEl._hideTimer);
  tipEl._hideTimer = setTimeout(function () {
    tipEl.classList.add('tut-tip-hide');
    setTimeout(function () { tipEl.style.display = 'none'; tipEl.classList.remove('tut-tip-hide'); }, 400);
  }, 4000);
}

function _showStep(idx) {
  if (idx >= TUTORIAL_STEPS.length) { _endTutorial(false); return; }

  _saveProgress(idx);

  const overlayEl   = document.getElementById('tutorial-overlay');
  const textEl      = document.getElementById('tutorial-text');
  const subtextEl   = document.getElementById('tutorial-subtext');
  const dismissBtn  = document.getElementById('tutorial-dismiss-btn');
  const stepCountEl = document.getElementById('tutorial-step-count');
  const hlIconEl    = document.getElementById('tutorial-highlight-icon');
  const actionEl    = document.getElementById('tutorial-action-label');
  // Legacy arrow indicators — hide in v4
  const arrowDown   = document.getElementById('tutorial-arrow-down');
  const arrowCross  = document.getElementById('tutorial-arrow-crosshair');

  if (!overlayEl || !textEl) return;

  const step = TUTORIAL_STEPS[idx];
  // Helper: look up translated string, fall back to the hard-coded English value.
  const _tr = (typeof t === 'function')
    ? function(key, fallback) { var v = t(key); return (v !== key) ? v : fallback; }
    : function(_k, fallback) { return fallback; };

  textEl.textContent = _tr('tut.' + step.id + '.title', step.text);

  if (subtextEl) {
    const subtext = _tr('tut.' + step.id + '.subtext', step.subtext || '');
    if (subtext) {
      subtextEl.textContent = subtext;
      subtextEl.style.display = 'block';
    } else {
      subtextEl.style.display = 'none';
    }
  }

  // "Got it!" button: always show on dismiss-capable steps or explain-only steps
  if (dismissBtn) {
    const showDismiss = step.canDismiss || !step.waitFor;
    dismissBtn.style.display = showDismiss ? 'inline-block' : 'none';
    dismissBtn.textContent   = _tr('tut.got_it', 'Got it!');
  }

  // Action waiting label
  if (actionEl) {
    if (step.waitFor && step.actionLabel) {
      actionEl.textContent = _tr('tut.' + step.id + '.action', step.actionLabel);
      actionEl.style.display = 'block';
    } else {
      actionEl.style.display = 'none';
    }
  }

  // Step counter
  if (stepCountEl) {
    stepCountEl.textContent = (idx + 1) + ' / ' + TUTORIAL_STEPS.length;
  }

  // Highlight icon area
  if (hlIconEl) {
    hlIconEl.className = 'tutorial-hl-' + (step.highlight || '');
    const html = _buildHighlightHTML(step.highlight, step);
    if (html) {
      hlIconEl.innerHTML = html;
      hlIconEl.style.display = 'flex';
    } else {
      hlIconEl.style.display = 'none';
    }
  }

  // Hide legacy arrows
  if (arrowDown)  arrowDown.style.display  = 'none';
  if (arrowCross) arrowCross.style.display = 'none';

  // Pause logic
  _tutorialPaused = !!step.pauseGame;

  // Set up event wait
  _waitingForEvent = step.waitFor || null;

  overlayEl.style.display = 'flex';
}

/** HTML for the highlight icon area, keyed by highlight type. */
function _buildHighlightHTML(key, step) {
  switch (key) {
    case 'move':
      return (
        '<div class="thl-grid">' +
          '<span></span><span class="thl-key">W</span><span></span>' +
          '<span class="thl-key">A</span><span class="thl-key">S</span><span class="thl-key">D</span>' +
        '</div>'
      );
    case 'mine':
      return '<span class="thl-key thl-widekey">Left Click</span>';
    case 'nudge':
      return (
        '<div class="thl-grid">' +
          '<span class="thl-key thl-wide">Q</span><span class="thl-sep">/</span><span class="thl-key thl-wide">E</span>' +
          '<span class="thl-sep" style="grid-column:span 3">+</span>' +
          '<span class="thl-key thl-wide">Z</span><span class="thl-sep">/</span><span class="thl-key thl-wide">X</span>' +
        '</div>'
      );
    case 'score':
      return '<span class="thl-score-icon">\uD83D\uDCCA</span>';
    case 'combo':
      return (
        '<div class="thl-combo-row">' +
          '<span class="thl-combo-chip">COMBO</span>' +
          '<span class="thl-combo-chip thl-combo-tspin">T-SPIN</span>' +
        '</div>'
      );
    case 'craft':
      return '<span class="thl-key thl-ckey">C</span>';
    case 'modes':
      return _buildModesHTML();
    default:
      return '';
  }
}

function _buildModesHTML() {
  var modes = [
    { icon: '\u221E', name: 'Classic', desc: 'Endless mining, rising speed' },
    { icon: '\u23F1', name: 'Sprint', desc: 'Mine 40 lines fastest' },
    { icon: '\u26A1', name: 'Blitz', desc: '2 min, mine fast' },
    { icon: '\uD83D\uDCC5', name: 'Daily', desc: 'Same ore seed daily' },
    { icon: '\uD83D\uDC80', name: 'Survival', desc: 'Mine, build, survive' },
    { icon: '\uD83D\uDC65', name: 'Co-op', desc: 'Mine with a partner' },
  ];
  var html = '<div class="thl-modes-grid">';
  modes.forEach(function (m) {
    html += '<div class="thl-mode-card">' +
      '<span class="thl-mode-icon">' + m.icon + '</span>' +
      '<span class="thl-mode-name">' + m.name + '</span>' +
      '<span class="thl-mode-desc">' + m.desc + '</span>' +
    '</div>';
  });
  html += '</div>';
  return html;
}

function _advanceStep() {
  if (!_tutorialActive) return;
  _tutorialPaused    = false;
  _waitingForEvent   = null;
  _tutorialStep++;
  if (_tutorialStep >= TUTORIAL_STEPS.length) {
    _showCompletionScreen();
  } else {
    _showStep(_tutorialStep);
  }
}

function _showCompletionScreen() {
  // Hide the regular step overlay
  const overlayEl = document.getElementById('tutorial-overlay');
  if (overlayEl) overlayEl.style.display = 'none';

  // Show the completion screen
  const completionEl = document.getElementById('tutorial-completion');
  if (completionEl) {
    completionEl.style.display = 'flex';
  }

  // Award XP
  if (typeof awardTutorialXP === 'function') awardTutorialXP();

  // Mark done + clear progress
  _tutorialActive  = false;
  _tutorialPaused  = false;
  _markTutorialDone();
  _clearProgress();

  // Remove first-launch class from menu
  var instrEl = document.getElementById('instructions');
  if (instrEl) instrEl.classList.remove('first-launch');

  // Metrics
  if (typeof metricsTutorialComplete === 'function') metricsTutorialComplete();
  // Achievement: tutorial completed
  if (typeof achOnTutorialComplete === 'function') achOnTutorialComplete();
}

function _endTutorial(skipped) {
  _tutorialActive  = false;
  _tutorialPaused  = false;
  _waitingForEvent = null;

  _markTutorialDone();
  _clearProgress();

  var instrEl = document.getElementById('instructions');
  if (instrEl) instrEl.classList.remove('first-launch');

  if (typeof awardTutorialXP === 'function') awardTutorialXP();

  if (skipped) {
    if (typeof metricsTutorialSkip === 'function') metricsTutorialSkip();
  } else {
    if (typeof metricsTutorialComplete === 'function') metricsTutorialComplete();
  }

  const overlayEl = document.getElementById('tutorial-overlay');
  if (overlayEl) overlayEl.style.display = 'none';
}

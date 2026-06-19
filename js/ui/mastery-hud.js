// Mastery Challenge Progress HUD controller.
// Shows the next incomplete mastery tier's progress during active gameplay.
// Requires: mastery.js (getMasteryLiveProgress, MASTERY_TIER_COLORS, etc.)
//
// Public API:
//   masteryHudUpdate()  — debounced; call on game events (score, lines, combo, timer)
//   masteryHudStop()    — call on game over to hide the widget
//   masteryHudReset()   — call on game reset to clear session state

// ── Module state ──────────────────────────────────────────────────────────────
var _masteryHudEl = null;
var _masteryHudVisible = false;
var _masteryHudHideTimer = null;
var _masteryHudLastPercent = -1;
var _masteryHudLastUpdateMs = 0;
var _masteryHudUpdatePending = false;
var _masteryHudExpanded = false;
var _masteryHudExpandTimer = null;
var _masteryHudCompleteShownMode = null;

// Mid-game unlock tracking; read by mastery.js to skip post-game overlay
var _masteryMidGameUnlocks = new Set();

// ── Helpers ───────────────────────────────────────────────────────────────────

function _masteryHudGetEl() {
  if (!_masteryHudEl) _masteryHudEl = document.getElementById('mastery-progress-hud');
  return _masteryHudEl;
}

function _masteryHudEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _masteryHudHexAlpha(hex, alpha) {
  var r = parseInt(hex.slice(1, 3), 16) || 0;
  var g = parseInt(hex.slice(3, 5), 16) || 0;
  var b = parseInt(hex.slice(5, 7), 16) || 0;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

// Determine current mastery-tracked mode from global state flags
function _masteryHudMode() {
  if (typeof isSprintMode !== 'undefined' && isSprintMode) return 'sprint';
  if (typeof isBlitzMode !== 'undefined' && isBlitzMode) return 'blitz';
  if (typeof isDailyChallenge !== 'undefined' && isDailyChallenge) return 'daily';
  if (typeof isSurvivalMode !== 'undefined' && isSurvivalMode) return 'survival';
  if (typeof isEndlessSurvivalMode !== 'undefined' && isEndlessSurvivalMode) return 'survival';
  if (typeof isBattleMode !== 'undefined' && isBattleMode) return 'battle';
  if (typeof activeBiomeId !== 'undefined' && activeBiomeId) return 'expedition';
  if (typeof isDungeonMode !== 'undefined' && isDungeonMode) return 'depths';
  return 'classic';
}

// Gather real-time stats from global state for the given mode
function _masteryHudStats(mode) {
  var s = {};
  switch (mode) {
    case 'classic':
      s.score           = typeof score !== 'undefined' ? score : 0;
      s.linesCleared    = typeof linesCleared !== 'undefined' ? linesCleared : 0;
      s.maxCombo        = typeof sessionHighestComboCount !== 'undefined' ? sessionHighestComboCount : 0;
      s.difficultyTier  = typeof lastDifficultyTier !== 'undefined' ? lastDifficultyTier + 1 : 0;
      s.timeSeconds     = typeof gameElapsedSeconds !== 'undefined' ? gameElapsedSeconds : 0;
      s.hasDiamondPickaxe = (typeof pickaxeTier !== 'undefined') &&
                            (pickaxeTier === 'diamond' || pickaxeTier === 'obsidian');
      break;
    case 'sprint':
      s.elapsedMs = typeof sprintElapsedMs !== 'undefined' ? sprintElapsedMs : 0;
      break;
    case 'blitz':
      s.score  = typeof score !== 'undefined' ? score : 0;
      s.combos = typeof sessionHighestComboCount !== 'undefined' ? sessionHighestComboCount : 0;
      break;
    case 'daily':
      break; // Cumulative only — no real-time per-game stats
    case 'survival':
      s.timeSeconds   = typeof gameElapsedSeconds !== 'undefined' ? gameElapsedSeconds : 0;
      s.blocksPlaced  = typeof blocksPlaced !== 'undefined' ? blocksPlaced : 0;
      s.hasDiamondPickaxe = (typeof pickaxeTier !== 'undefined') &&
                            (pickaxeTier === 'diamond' || pickaxeTier === 'obsidian');
      break;
    case 'battle':
      if (typeof loadBattleRating === 'function') {
        var rd = loadBattleRating();
        s.rating = (rd && rd.rating) ? rd.rating : 1000;
      }
      break;
    case 'expedition':
      if (typeof getBiomeTrackInfo === 'function') {
        var biomes = ['stone', 'forest', 'nether', 'ice'];
        var maxT = 0, tier10 = 0;
        for (var bi = 0; bi < biomes.length; bi++) {
          var binfo = getBiomeTrackInfo(biomes[bi]);
          var bt = binfo ? (binfo.currentTier ? binfo.currentTier.tier : 1) : 1;
          if (bt > maxT) maxT = bt;
          if (bt >= 10) tier10++;
        }
        s.maxBiomeTier  = maxT;
        s.biomesAtTier10 = tier10;
      }
      break;
    case 'depths':
      s.floor        = typeof depthsCurrentFloor !== 'undefined' ? depthsCurrentFloor : 0;
      s.infiniteFloor = typeof depthsBestInfiniteFloor !== 'undefined' ? depthsBestInfiniteFloor : 0;
      break;
  }
  return s;
}

// Format a primary progress value for display
function _masteryHudFmtProgress(progress) {
  var p = progress.primary;
  if (!p) return '';
  var type = progress.progressType;
  if (type === 'time_under' || p.unit === 'sec' || p.unit === 'ms') {
    var secs = p.unit === 'ms' ? Math.floor(p.current / 1000) : Math.floor(p.current);
    var tsecs = p.unit === 'ms' ? Math.floor(p.target / 1000) : Math.floor(p.target);
    var cm = Math.floor(secs / 60).toString().padStart(2, '0');
    var cs = (secs % 60).toString().padStart(2, '0');
    var tm = Math.floor(tsecs / 60).toString().padStart(2, '0');
    var ts = (tsecs % 60).toString().padStart(2, '0');
    return cm + ':' + cs + '/' + tm + ':' + ts;
  }
  var cur = p.current;
  var tgt = p.target;
  if (tgt >= 1000) {
    var fmt = function(n) {
      if (n >= 10000) return Math.floor(n / 1000) + 'K';
      if (n >= 1000) return (Math.floor(n / 100) / 10).toFixed(1) + 'K';
      return String(n);
    };
    return fmt(cur) + '/' + fmt(tgt);
  }
  return cur + '/' + tgt + (p.unit ? ' ' + p.unit : '');
}

// Bar color for time-under challenges based on pace
function _masteryHudTimeUnderColor(percent) {
  if (percent < 0.5) return '#4ade80';
  if (percent < 0.85) return '#fbbf24';
  return '#f87171';
}

// ── Widget visibility ─────────────────────────────────────────────────────────

function _masteryHudShow(el) {
  if (!el) return;
  el.style.display = '';
  el.classList.add('mastery-hud-visible');
  _masteryHudVisible = true;
}

function _masteryHudHide(el) {
  el = el || _masteryHudGetEl();
  if (!el) return;
  el.classList.remove('mastery-hud-visible', 'mastery-hud-pulse');
  _masteryHudVisible = false;
  clearTimeout(_masteryHudHideTimer);
  _masteryHudHideTimer = null;
}

function _masteryHudScheduleHide(ms) {
  clearTimeout(_masteryHudHideTimer);
  _masteryHudHideTimer = setTimeout(function() {
    _masteryHudHide();
  }, ms);
}

// ── Widget rendering ──────────────────────────────────────────────────────────

function _masteryHudRender(el, progress, mode) {
  var pct = Math.min(1.0, progress.percent);
  var barPct = (pct * 100).toFixed(1);
  var tierColor = progress.tierColor;
  var borderColor = _masteryHudHexAlpha(tierColor, 0.3);
  var modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
  var progressText = _masteryHudFmtProgress(progress);

  var barColor = progress.progressType === 'time_under'
    ? _masteryHudTimeUnderColor(pct)
    : tierColor;

  var ghostHtml = '';
  if (progress.progressType === 'cumulative' && progress.primary && progress.primary.pending) {
    var ghostPct = Math.min(100 - parseFloat(barPct), (1 / Math.max(progress.primary.target, 1)) * 100).toFixed(1);
    ghostHtml = '<div class="mastery-hud-bar-ghost" style="left:' + barPct + '%;width:' + ghostPct + '%;"></div>';
  }

  var secondaryHtml = '';
  if (progress.secondary) {
    var secClass = progress.secondary.met ? 'mastery-hud-sec-met' : 'mastery-hud-sec-unmet';
    secondaryHtml = '<div class="mastery-hud-secondary ' + secClass + '">' +
      (progress.secondary.met ? '✓ ' : '✗ ') +
      _masteryHudEscape(progress.secondary.label) +
      '</div>';
  }

  el.style.borderColor = borderColor;
  el.innerHTML =
    '<div class="mastery-hud-inner">' +
      '<div class="mastery-hud-header">' +
        '<span class="mastery-hud-icon">' + progress.tierIcon + '</span>' +
        '<span class="mastery-hud-tier">' + _masteryHudEscape(progress.tierLabel) + '</span>' +
        '<span class="mastery-hud-mode-label">' + _masteryHudEscape(modeLabel) + '</span>' +
      '</div>' +
      '<div class="mastery-hud-challenge">' + _masteryHudEscape(progress.challengeText) + '</div>' +
      '<div class="mastery-hud-bar-row">' +
        '<div class="mastery-hud-bar-wrap">' +
          '<div class="mastery-hud-bar-fill" style="width:' + barPct + '%;background:' + barColor + ';"></div>' +
          ghostHtml +
        '</div>' +
        '<span class="mastery-hud-progress-text">' + _masteryHudEscape(progressText) + '</span>' +
      '</div>' +
      secondaryHtml +
    '</div>';

  el.setAttribute('aria-label', progress.tierLabel + ': ' + progressText);
}

// ── Milestone flash ───────────────────────────────────────────────────────────

function _masteryHudMilestoneFlash(mode, progress) {
  var modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
  var tierColor = progress.tierColor;

  // Remove any prior flash
  var old = document.getElementById('mastery-milestone-flash');
  if (old && old.parentNode) old.parentNode.removeChild(old);

  var el = document.createElement('div');
  el.className = 'mastery-milestone-flash';
  el.id = 'mastery-milestone-flash';
  el.innerHTML =
    '<div class="mastery-milestone-line1">' +
      '⛏ MASTERY: ' + _masteryHudEscape(progress.tierLabel.toUpperCase()) + ' ' + progress.tierIcon +
    '</div>' +
    '<div class="mastery-milestone-line2">' +
      _masteryHudEscape(modeLabel) + ' — Tier Unlocked!' +
    '</div>';
  el.style.setProperty('--mastery-flash-color', tierColor);
  el.style.borderColor = tierColor;
  el.style.boxShadow = '0 0 16px ' + _masteryHudHexAlpha(tierColor, 0.6) +
    ', inset 0 0 8px ' + _masteryHudHexAlpha(tierColor, 0.15);
  document.body.appendChild(el);

  requestAnimationFrame(function() {
    el.classList.add('mastery-milestone-in');
  });

  // Particles (skip if reduced motion)
  var rm = typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled;
  if (!rm) {
    _masteryHudFireParticles(el, tierColor);
  }

  // Chime
  if (typeof _playMasteryChime === 'function') {
    _playMasteryChime(progress.tierName);
  }

  // Auto-remove after 2s visible + 0.5s fade
  setTimeout(function() {
    el.classList.remove('mastery-milestone-in');
    el.classList.add('mastery-milestone-out');
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 500);
  }, 2000);
}

function _masteryHudFireParticles(container, color) {
  for (var i = 0; i < 24; i++) {
    var p = document.createElement('div');
    p.className = 'mastery-particle';
    p.style.background = color;
    var angle = (i / 24) * 360;
    var dist = 50 + Math.random() * 60;
    var dx = Math.cos(angle * Math.PI / 180) * dist;
    var dy = Math.sin(angle * Math.PI / 180) * dist;
    p.style.setProperty('--dx', dx.toFixed(1) + 'px');
    p.style.setProperty('--dy', dy.toFixed(1) + 'px');
    p.style.animationDelay = (Math.random() * 0.1).toFixed(2) + 's';
    container.appendChild(p);
  }
}

// ── Expanded view ─────────────────────────────────────────────────────────────

function _masteryHudOnHoverEnter() {
  clearTimeout(_masteryHudExpandTimer);
  _masteryHudShowExpanded();
}

function _masteryHudOnHoverLeave() {
  clearTimeout(_masteryHudExpandTimer);
  _masteryHudExpandTimer = setTimeout(_masteryHudCollapseExpanded, 300);
}

function _masteryHudOnTap(e) {
  e.stopPropagation();
  if (_masteryHudExpanded) {
    clearTimeout(_masteryHudExpandTimer);
    _masteryHudCollapseExpanded();
  } else {
    _masteryHudShowExpanded();
    clearTimeout(_masteryHudExpandTimer);
    _masteryHudExpandTimer = setTimeout(_masteryHudCollapseExpanded, 5000);
  }
}

function _masteryHudShowExpanded() {
  var el = _masteryHudGetEl();
  if (!el || !_masteryHudVisible) return;

  var mode = _masteryHudMode();
  var challenges = typeof MASTERY_CHALLENGES !== 'undefined' ? MASTERY_CHALLENGES[mode] : null;
  if (!challenges) return;

  var state = typeof loadMastery === 'function' ? loadMastery() : {};
  var ms = state[mode] || { tier: 0 };
  var currentTier = ms.tier || 0;
  var modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
  var stats = _masteryHudStats(mode);
  var tierColors = typeof MASTERY_TIER_COLORS !== 'undefined' ? MASTERY_TIER_COLORS : {};

  var rows = '';
  for (var i = 0; i < challenges.length; i++) {
    var ch = challenges[i];
    var tNum = i + 1;
    var isComplete = tNum <= currentTier;
    var isCurrent  = tNum === currentTier + 1;
    var isLocked   = tNum > currentTier + 1;

    var icon = isComplete ? '✅' : (isCurrent ? '🔶' : '🔒');
    var tierColor = tierColors[ch.tierName] || '#888';
    var rowClass = isComplete ? 'mastery-exp-complete' : (isCurrent ? 'mastery-exp-current' : 'mastery-exp-locked');

    var barHtml = '';
    if (isCurrent && typeof getMasteryLiveProgress === 'function') {
      var lp = getMasteryLiveProgress(mode, stats);
      if (lp && !lp.allComplete) {
        var pct2 = Math.min(100, (lp.percent * 100)).toFixed(0);
        barHtml = '<div class="mastery-exp-bar-wrap"><div class="mastery-exp-bar" style="width:' +
          pct2 + '%;background:' + tierColor + ';"></div></div>';
      }
    }

    rows +=
      '<div class="mastery-exp-row ' + rowClass + '">' +
        '<span class="mastery-exp-icon">' + icon + '</span>' +
        '<div class="mastery-exp-info">' +
          '<span class="mastery-exp-tier-name">' +
            _masteryHudEscape(ch.tierName.charAt(0).toUpperCase() + ch.tierName.slice(1)) +
          '</span>' +
          '<span class="mastery-exp-desc">' + _masteryHudEscape(ch.desc) + '</span>' +
          barHtml +
        '</div>' +
      '</div>';
  }

  el.style.borderColor = _masteryHudHexAlpha('#c0c0c0', 0.3);
  el.innerHTML =
    '<div class="mastery-hud-inner mastery-hud-expanded">' +
      '<div class="mastery-hud-exp-title">' +
        _masteryHudEscape(modeLabel) + ' Mastery' +
        '<span class="mastery-hud-collapse-hint">▲</span>' +
      '</div>' +
      rows +
    '</div>';

  _masteryHudExpanded = true;
}

function _masteryHudCollapseExpanded() {
  _masteryHudExpanded = false;
  clearTimeout(_masteryHudExpandTimer);
  _masteryHudDoUpdate();
}

// ── Core update logic ─────────────────────────────────────────────────────────

function _masteryHudDoUpdate() {
  var el = _masteryHudGetEl();
  if (!el) return;

  // Only show during active gameplay (pointer locked, not game over, not paused)
  var gameActive =
    typeof controls !== 'undefined' && controls && controls.isLocked &&
    !(typeof isGameOver !== 'undefined' && isGameOver) &&
    !(typeof isPaused !== 'undefined' && isPaused) &&
    !(typeof isPracticeMode !== 'undefined' && isPracticeMode) &&
    !(typeof isEditorMode !== 'undefined' && isEditorMode) &&
    !(typeof isReplayMode !== 'undefined' && isReplayMode);

  if (!gameActive) {
    _masteryHudHide(el);
    return;
  }

  var mode = _masteryHudMode();
  var stats = _masteryHudStats(mode);

  if (typeof getMasteryLiveProgress !== 'function') return;
  var progress = getMasteryLiveProgress(mode, stats);
  if (!progress) return;

  if (progress.allComplete) {
    if (_masteryHudCompleteShownMode !== mode) {
      _masteryHudCompleteShownMode = mode;
      var modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
      el.style.borderColor = _masteryHudHexAlpha(
        (typeof MASTERY_TIER_COLORS !== 'undefined' ? MASTERY_TIER_COLORS.obsidian : '#7c3aed'),
        0.3
      );
      el.innerHTML =
        '<div class="mastery-hud-inner">' +
          '<div class="mastery-hud-complete">⬛ ' + _masteryHudEscape(modeLabel.toUpperCase()) + ' MASTERY COMPLETE</div>' +
        '</div>';
      _masteryHudShow(el);
      _masteryHudScheduleHide(5000);
    }
    return;
  }

  // Mid-game tier unlock detection
  var unlockKey = mode + '_' + progress.tierName;
  if (progress.justUnlocked && !_masteryMidGameUnlocks.has(unlockKey)) {
    _masteryMidGameUnlocks.add(unlockKey);
    if (typeof unlockMasteryTier === 'function') {
      unlockMasteryTier(mode, progress.tierIndex + 1);
    }
    _masteryHudMilestoneFlash(mode, progress);
    // After flash, re-evaluate for next tier
    setTimeout(function() {
      _masteryHudLastPercent = -1;
      _masteryHudCompleteShownMode = null;
      _masteryHudDoUpdate();
    }, 3500);
    return;
  }

  var prevPercent = _masteryHudLastPercent;
  var percentChanged = Math.abs(progress.percent - prevPercent) > 0.001;
  _masteryHudLastPercent = progress.percent;

  _masteryHudRender(el, progress, mode);

  var rm = typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled;

  if (progress.percent >= 0.8) {
    _masteryHudShow(el);
    clearTimeout(_masteryHudHideTimer);
    _masteryHudHideTimer = null;
    el.classList.toggle('mastery-hud-pulse', !rm);
  } else {
    el.classList.remove('mastery-hud-pulse');
    if (!_masteryHudVisible) {
      _masteryHudShow(el);
      _masteryHudScheduleHide(10000);
    } else if (percentChanged) {
      _masteryHudShow(el);
      _masteryHudScheduleHide(5000);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

// Throttled update: max 2 calls/sec
function masteryHudUpdate() {
  var now = Date.now();
  var elapsed = now - _masteryHudLastUpdateMs;
  if (elapsed < 500) {
    if (!_masteryHudUpdatePending) {
      _masteryHudUpdatePending = true;
      setTimeout(function() {
        _masteryHudUpdatePending = false;
        masteryHudUpdate();
      }, 500 - elapsed);
    }
    return;
  }
  _masteryHudLastUpdateMs = now;
  _masteryHudDoUpdate();
}

// Hide widget immediately (game over / pause)
function masteryHudStop() {
  _masteryHudHide();
}

// Reset session state (new game)
function masteryHudReset() {
  _masteryHudHide();
  _masteryMidGameUnlocks = new Set();
  _masteryHudLastPercent = -1;
  _masteryHudCompleteShownMode = null;
  _masteryHudLastUpdateMs = 0;
  _masteryHudUpdatePending = false;
  _masteryHudExpanded = false;
  clearTimeout(_masteryHudExpandTimer);
  var flash = document.getElementById('mastery-milestone-flash');
  if (flash && flash.parentNode) flash.parentNode.removeChild(flash);
}

// ── Init ──────────────────────────────────────────────────────────────────────

(function _masteryHudInit() {
  function _setup() {
    var el = document.getElementById('mastery-progress-hud');
    if (!el) return;
    _masteryHudEl = el;
    el.style.pointerEvents = 'auto';
    el.addEventListener('mouseenter', _masteryHudOnHoverEnter);
    el.addEventListener('mouseleave', _masteryHudOnHoverLeave);
    el.addEventListener('touchstart', _masteryHudOnTap, { passive: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _setup);
  } else {
    _setup();
  }
})();

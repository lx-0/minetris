// Block-type scarcity — materials spawn in waves and deplete over time.
// Requires: state.js (gameElapsedSeconds, lastDifficultyTier, isSurvivalMode, etc.)
//           worldmodifier.js (worldModifierWeightedIndex)
// Called by pieces.js _randomShapeIndex() after weekly/world-modifier overrides.
//
// Design: each tracked block type (by COLORS index) has a time-breakpoint curve
// [[seconds, weight], ...]. Weight is linearly interpolated between breakpoints and
// clamped at the endpoints. worldModifierWeightedIndex() rounds floats to ints, so
// weight 0.4 → excluded, 0.5 → 1 slot. Types without explicit curves use a flat base
// weight for stable presence throughout the session.

// ── Scarcity curves ────────────────────────────────────────────────────────────────
// Keys are COLORS indices (1–8). All times in seconds.
// peak: the highest weight in this curve, used to compute depletion threshold.

const SCARCITY_CURVES = {
  // Gold (index 3): abundant early (4), starts thinning at 3 min, nearly gone by 8 min.
  3: { curve: [[0, 4], [180, 4], [300, 2], [480, 1], [600, 0]], peak: 4 },
  // Crystal (index 7): rare early, peaks mid-game at ~6 min, eases off late.
  7: { curve: [[0, 1], [240, 2], [360, 3], [540, 2], [720, 1]], peak: 3 },
  // Lava (index 6): low at start, rises steadily — heat builds as game goes on.
  6: { curve: [[0, 1], [300, 2], [600, 4]], peak: 4 },
  // Diamond (index 8): zero early, only unlocks after ~7 min (tier gate in pieces.js).
  8: { curve: [[0, 0], [420, 0], [540, 1], [720, 3]], peak: 3 },
};

// Flat base weights for types not in SCARCITY_CURVES (stable throughout session).
const SCARCITY_BASE_WEIGHTS = { 1: 2, 2: 3, 3: 4, 4: 2, 5: 2, 6: 1, 7: 1, 8: 0 };

// ── Per-mode opt-in ────────────────────────────────────────────────────────────────
// Keys are mode identifiers returned by _scarcityModeId(). A mode must be listed
// here with enabled:true to activate scarcity. Modes may override curves with a
// custom { curves: { ... } } object; absent keys fall back to SCARCITY_CURVES.
const SCARCITY_MODE_CONFIG = {
  classic:          { enabled: true },
  survival:         { enabled: true },
  marathon:         { enabled: true },
  marathon_endless: { enabled: true },
  weekly:           { enabled: true },
  daily:            { enabled: true },
  countdown:        { enabled: true },
  ultra:            { enabled: true },
  dig:              { enabled: true },
  // Expedition: mining-primary mode — faster depletion, elevated lava, earlier diamond.
  expedition: {
    enabled: true,
    curves: {
      3: { curve: [[0, 4], [120, 4], [200, 2], [300, 1], [420, 0]], peak: 4 },
      7: { curve: [[0, 2], [180, 3], [300, 4], [480, 2], [600, 1]], peak: 4 },
      6: { curve: [[0, 2], [240, 4], [480, 5]], peak: 5 },
      8: { curve: [[0, 0], [300, 0], [420, 2], [600, 3]], peak: 3 },
    },
  },
  // Endless Survival: mining-primary — longer sessions, depletion starts later than Survival.
  endless_survival: {
    enabled: true,
    curves: {
      3: { curve: [[0, 4], [240, 4], [420, 2], [600, 1], [780, 0]], peak: 4 },
      7: { curve: [[0, 1], [300, 2], [480, 4], [660, 3], [900, 1]], peak: 4 },
      6: { curve: [[0, 1], [360, 2], [720, 5]], peak: 5 },
      8: { curve: [[0, 0], [480, 0], [600, 1], [840, 3]], peak: 3 },
    },
  },
  // The Depths: dungeon mode — harsh resource pressure; gold depletes fast, lava dominates.
  depths: {
    enabled: true,
    curves: {
      3: { curve: [[0, 4], [90, 4], [150, 2], [240, 1], [360, 0]], peak: 4 },
      7: { curve: [[0, 1], [120, 2], [240, 3], [420, 2], [600, 1]], peak: 3 },
      6: { curve: [[0, 3], [180, 4], [360, 6]], peak: 6 },
      8: { curve: [[0, 0], [240, 0], [360, 1], [540, 3]], peak: 3 },
    },
  },
  // sprint, blitz, zen, practice, training, combo, battle, coop, puzzle: disabled
};

// Weight fraction below which a type is considered "depleting" (for HUD indicator).
const SCARCITY_DEPLETION_THRESHOLD = 0.35;
// Weight fraction below which a type enters the critical (red) tier.
const SCARCITY_CRITICAL_THRESHOLD = 0.15;
// Duration constants for exhaustion feedback.
const SCARCITY_VIGNETTE_MS = 800;
const SCARCITY_EXHAUSTION_BANNER_MS = 1500;

// ── Helpers ────────────────────────────────────────────────────────────────────────

function _scarcityModeId() {
  if (typeof isSurvivalMode !== 'undefined' && isSurvivalMode) return 'survival';
  if (typeof isEndlessSurvivalMode !== 'undefined' && isEndlessSurvivalMode) return 'endless_survival';
  if (typeof activeDungeonId !== 'undefined' && activeDungeonId !== null) return 'depths';
  if (typeof isMarathonEndlessMode !== 'undefined' && isMarathonEndlessMode) return 'marathon_endless';
  if (typeof isMarathonMode !== 'undefined' && isMarathonMode) return 'marathon';
  if (typeof isSprintMode !== 'undefined' && isSprintMode) return 'sprint';
  if (typeof isBlitzMode !== 'undefined' && isBlitzMode) return 'blitz';
  if (typeof isZenMode !== 'undefined' && isZenMode) return 'zen';
  if (typeof isPracticeMode !== 'undefined' && isPracticeMode) return 'practice';
  if (typeof isTrainingMode !== 'undefined' && isTrainingMode) return 'training';
  if (typeof isWeeklyChallenge !== 'undefined' && isWeeklyChallenge) return 'weekly';
  if (typeof isDailyChallenge !== 'undefined' && isDailyChallenge) return 'daily';
  if (typeof isCountdownMode !== 'undefined' && isCountdownMode) return 'countdown';
  if (typeof isUltraMode !== 'undefined' && isUltraMode) return 'ultra';
  if (typeof isDigMode !== 'undefined' && isDigMode) return 'dig';
  if (typeof isExpeditionMode !== 'undefined' && isExpeditionMode) return 'expedition';
  if (typeof isComboChallenge !== 'undefined' && isComboChallenge) return 'combo';
  if (typeof isBattleMode !== 'undefined' && isBattleMode) return 'battle';
  if (typeof isCoopMode !== 'undefined' && isCoopMode) return 'coop';
  if (typeof isPuzzleMode !== 'undefined' && isPuzzleMode) return 'puzzle';
  return 'classic';
}

function _interpolateCurve(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, w0] = pts[i];
    const [t1, w1] = pts[i + 1];
    if (t >= t0 && t <= t1) {
      return w0 + (w1 - w0) * (t - t0) / (t1 - t0);
    }
  }
  return last[1];
}

// ── Public API ─────────────────────────────────────────────────────────────────────

/**
 * Returns a blockWeights map { index: weight } for the current game state, or null
 * if scarcity is disabled for the current mode.
 * Weights are floats; worldModifierWeightedIndex() rounds them to ints.
 */
function getScarcityWeights() {
  const modeId = _scarcityModeId();
  const cfg = SCARCITY_MODE_CONFIG[modeId];
  if (!cfg || !cfg.enabled) return null;

  const t = (typeof gameElapsedSeconds !== 'undefined') ? gameElapsedSeconds : 0;
  const curveSet = (cfg.curves) ? Object.assign({}, SCARCITY_CURVES, cfg.curves) : SCARCITY_CURVES;

  const weights = {};
  for (let i = 1; i <= 8; i++) {
    const entry = curveSet[i];
    if (entry) {
      weights[i] = _interpolateCurve(entry.curve, t);
    } else {
      weights[i] = SCARCITY_BASE_WEIGHTS[i] !== undefined ? SCARCITY_BASE_WEIGHTS[i] : 1;
    }
  }
  return weights;
}

/**
 * Returns array of block type indices that are currently "depleting":
 * weight is below SCARCITY_DEPLETION_THRESHOLD × peak, still > 0, and declining.
 */
function getScarcityDepletingTypes() {
  const modeId = _scarcityModeId();
  const cfg = SCARCITY_MODE_CONFIG[modeId];
  if (!cfg || !cfg.enabled) return [];

  const t = (typeof gameElapsedSeconds !== 'undefined') ? gameElapsedSeconds : 0;
  const curveSet = (cfg.curves) ? Object.assign({}, SCARCITY_CURVES, cfg.curves) : SCARCITY_CURVES;
  const depleting = [];

  for (const idxStr in curveSet) {
    const idx = parseInt(idxStr, 10);
    const entry = curveSet[idx];
    if (!entry) continue;
    const w = _interpolateCurve(entry.curve, t);
    if (w <= 0) continue;
    if (w < entry.peak * SCARCITY_DEPLETION_THRESHOLD) {
      // Confirm it's actually declining (not recovering)
      const wFuture = _interpolateCurve(entry.curve, t + 30);
      if (wFuture <= w + 0.05) depleting.push(idx);
    }
  }
  return depleting;
}

// ── HUD ───────────────────────────────────────────────────────────────────────────

// Block type metadata for the HUD (tracked types only).
const _SCARCITY_HUD_TYPES = [
  { idx: 3, label: 'Gold',    color: '#ffff00', abbr: 'Au' },
  { idx: 7, label: 'Crystal', color: '#800080', abbr: 'Cr' },
  { idx: 6, label: 'Lava',    color: '#ff0000', abbr: 'Lv' },
  { idx: 8, label: 'Diamond', color: '#1a237e', abbr: 'Di' },
];

let _scarcityHudEl = null;
let _scarcityHudVisible = false;
let _expeditionCoachFired = false;
const _scarcityHasAppeared = {};
// One-shot event tracking — reset on game reset.
const _scarcityChimeFired    = new Set();  // warning chime fired per material idx
const _scarcityCriticalFired = new Set();  // critical tone fired per material idx
const _scarcityExhaustionFired = new Set(); // exhaustion events fired per material idx
let _scarcityVignetteEl = null;
let _exhaustionBannerEl = null;
let _scarcityVignetteTimer    = null;
let _exhaustionBannerTimer    = null;
let _exhaustionBannerDelayTimer = null;

function getScarcityPhase(typeIndex) {
  const modeId = _scarcityModeId();
  const cfg = SCARCITY_MODE_CONFIG[modeId];
  if (!cfg || !cfg.enabled) return null;

  const t = (typeof gameElapsedSeconds !== 'undefined') ? gameElapsedSeconds : 0;
  const curveSet = (cfg.curves) ? Object.assign({}, SCARCITY_CURVES, cfg.curves) : SCARCITY_CURVES;
  const entry = curveSet[typeIndex];
  if (!entry) return null;

  const w = _interpolateCurve(entry.curve, t);
  const ratio = w / entry.peak;

  if (w <= 0) {
    if (_scarcityHasAppeared[typeIndex]) {
      return { phase: 'depleted', label: 'Depleted', hint: 'Exhausted for this game', color: '#888888' };
    }
    return { phase: 'incoming', label: 'Incoming', hint: 'Arrives later this game', color: '#44ffff' };
  }
  if (ratio >= 0.7) return { phase: 'plentiful', label: 'Plentiful', hint: 'Abundant now', color: '#44ff44' };
  if (ratio >= 0.35) return { phase: 'thinning', label: 'Thinning', hint: 'Fading — mine it while you can', color: '#ffaa00' };
  return { phase: 'scarce', label: 'Scarce', hint: 'Almost gone', color: '#ff4444' };
}

/**
 * Refresh the scarcity HUD. Call after each piece spawn (from pieces.js) or on
 * game state changes. Hidden when scarcity is not enabled for the current mode.
 */
function updateScarcityHUD() {
  if (!_scarcityHudEl) _scarcityHudEl = document.getElementById('scarcity-hud');
  if (!_scarcityHudEl) return;

  const modeId = _scarcityModeId();
  const cfg = SCARCITY_MODE_CONFIG[modeId];
  if (!cfg || !cfg.enabled) {
    if (_scarcityHudVisible) {
      _scarcityHudEl.style.display = 'none';
      _scarcityHudVisible = false;
    }
    return;
  }

  const t = (typeof gameElapsedSeconds !== 'undefined') ? gameElapsedSeconds : 0;
  const curveSet = (cfg.curves) ? Object.assign({}, SCARCITY_CURVES, cfg.curves) : SCARCITY_CURVES;
  const depleting = getScarcityDepletingTypes();
  const depletingSet = new Set(depleting);

  // Build swatch HTML only for types that have a defined curve.
  const swatchParts = _SCARCITY_HUD_TYPES
    .filter(({ idx }) => !!curveSet[idx])
    .map(({ idx, label, color, abbr }) => {
      const entry = curveSet[idx];
      const w = _interpolateCurve(entry.curve, t);
      if (w > 0) _scarcityHasAppeared[idx] = true;
      const fillPct = Math.round((w / entry.peak) * 100);
      const ratio = w / entry.peak;

      // Three-tier classification
      let tier = 'healthy';
      if (w <= 0) {
        tier = 'exhausted';
      } else if (ratio <= SCARCITY_CRITICAL_THRESHOLD) {
        tier = 'critical';
      } else if (depletingSet.has(idx)) {
        tier = 'warning';
      }

      // Tier CSS class and inline status text
      let tierClass = '';
      let statusHtml = '';
      if (tier === 'warning') {
        tierClass = ' sc-warning';
        statusHtml = '<span class="sc-status sc-status-warning">LOW</span>';
      } else if (tier === 'critical') {
        tierClass = ' sc-critical';
        statusHtml = '<span class="sc-status sc-status-critical">!</span>';
      } else if (tier === 'exhausted') {
        tierClass = ' sc-exhausted';
        statusHtml = '<span class="sc-status sc-status-exhausted">OUT</span>';
      }

      // One-shot audio/visual events on first tier entry
      if (tier === 'warning' && !_scarcityChimeFired.has(idx)) {
        _scarcityChimeFired.add(idx);
        if (typeof playScarcityWarningChime === 'function') playScarcityWarningChime(idx);
      }
      if (tier === 'critical' && !_scarcityCriticalFired.has(idx)) {
        _scarcityCriticalFired.add(idx);
        if (typeof playScarcityCriticalTone === 'function') playScarcityCriticalTone();
      }
      if (tier === 'exhausted' && _scarcityHasAppeared[idx] && !_scarcityExhaustionFired.has(idx)) {
        _scarcityExhaustionFired.add(idx);
        if (typeof playScarcityExhaustionTone === 'function') playScarcityExhaustionTone(idx);
        _triggerScarcityVignette();
        _showScarcityExhaustionBanner(label);
      }

      const cls = 'sc-swatch' + tierClass;
      return `<div class="${cls}" data-type-idx="${idx}" title="${label}">` +
        `<div class="sc-dot" style="background:${color}"></div>` +
        `<span class="sc-name">${abbr}</span>` +
        `<div class="sc-bar-wrap"><div class="sc-bar-fill" style="width:${fillPct}%"></div></div>` +
        statusHtml +
        `</div>`;
    });

  _scarcityHudEl.innerHTML =
    '<div class="sc-label">VEINS</div>' +
    '<div class="sc-swatches">' + swatchParts.join('') + '</div>';

  if (!_scarcityHudVisible) {
    _scarcityHudEl.style.display = '';
    _scarcityHudVisible = true;
    if (typeof gameTooltip === 'function') gameTooltip('scarcityIntro');
  }

  // Layer 3: expedition economy coach mark at 10s
  if (!_expeditionCoachFired && modeId === 'expedition' && t >= 10) {
    _expeditionCoachFired = true;
    if (typeof coachMarkExpeditionScarcity === 'function') coachMarkExpeditionScarcity();
  }
}

// ── Exhaustion feedback helpers ────────────────────────────────────────────────

function _triggerScarcityVignette() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!_scarcityVignetteEl) _scarcityVignetteEl = document.getElementById('scarcity-vignette');
  if (!_scarcityVignetteEl) return;
  if (_scarcityVignetteTimer) { clearTimeout(_scarcityVignetteTimer); _scarcityVignetteTimer = null; }
  _scarcityVignetteEl.style.display = 'block';
  _scarcityVignetteEl.classList.add('active');
  _scarcityVignetteTimer = setTimeout(function() {
    _scarcityVignetteTimer = null;
    if (!_scarcityVignetteEl) return;
    _scarcityVignetteEl.classList.remove('active');
    _scarcityVignetteEl.style.display = 'none';
  }, SCARCITY_VIGNETTE_MS);
}

function _showScarcityExhaustionBanner(materialLabel) {
  if (!_exhaustionBannerEl) _exhaustionBannerEl = document.getElementById('mining-streak-banner');
  if (!_exhaustionBannerEl) return;
  const _show = function() {
    if (_exhaustionBannerTimer) { clearTimeout(_exhaustionBannerTimer); _exhaustionBannerTimer = null; }
    _exhaustionBannerEl.textContent = materialLabel + ' veins exhausted';
    _exhaustionBannerEl.style.display = 'block';
    _exhaustionBannerTimer = setTimeout(function() {
      _exhaustionBannerTimer = null;
      if (_exhaustionBannerEl) _exhaustionBannerEl.style.display = 'none';
    }, SCARCITY_EXHAUSTION_BANNER_MS);
  };
  if (_exhaustionBannerEl.style.display !== 'none') {
    if (_exhaustionBannerDelayTimer) clearTimeout(_exhaustionBannerDelayTimer);
    _exhaustionBannerDelayTimer = setTimeout(function() {
      _exhaustionBannerDelayTimer = null;
      _show();
    }, 500);
  } else {
    _show();
  }
}

/** Reset scarcity HUD state (call on game reset). */
function resetScarcityHUD() {
  _scarcityHudVisible = false;
  _expeditionCoachFired = false;
  for (const k in _scarcityHasAppeared) delete _scarcityHasAppeared[k];
  _scarcityChimeFired.clear();
  _scarcityCriticalFired.clear();
  _scarcityExhaustionFired.clear();
  if (_scarcityHudEl) _scarcityHudEl.style.display = 'none';
  // Cancel any in-flight feedback timers so they don't bleed into the next session
  if (_scarcityVignetteTimer) { clearTimeout(_scarcityVignetteTimer); _scarcityVignetteTimer = null; }
  if (_scarcityVignetteEl) {
    _scarcityVignetteEl.classList.remove('active');
    _scarcityVignetteEl.style.display = 'none';
  }
  if (_exhaustionBannerTimer) { clearTimeout(_exhaustionBannerTimer); _exhaustionBannerTimer = null; }
  if (_exhaustionBannerDelayTimer) { clearTimeout(_exhaustionBannerDelayTimer); _exhaustionBannerDelayTimer = null; }
  if (_exhaustionBannerEl) _exhaustionBannerEl.style.display = 'none';
}

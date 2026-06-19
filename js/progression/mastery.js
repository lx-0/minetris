// Mastery System — tracking engine, data model, and challenge definitions.
// 7 modes × 5 tiers (Bronze → Silver → Gold → Diamond → Obsidian) = 35 challenges.
//
// Requires: (none — pure localStorage + optional notification DOM)
// Called by: gamestate.js, sprint.js, blitz.js, main.js,
//            expedition-session.js
//
// Storage key: mineCtris_mastery
// Schema: { classic: { tier, progress }, sprint: { tier, progress }, … }

const MASTERY_STORAGE_KEY = 'mineCtris_mastery';

// Tier names and point values
const MASTERY_TIER_NAMES  = ['bronze', 'silver', 'gold', 'diamond', 'obsidian'];
const MASTERY_TIER_POINTS = { bronze: 1, silver: 2, gold: 3, diamond: 4, obsidian: 5 };
const MASTERY_TIER_ICONS  = { bronze: '🥉', silver: '🥈', gold: '🥇', diamond: '💎', obsidian: '⬛' };

// All 8 mode keys
const MASTERY_MODES = ['classic', 'sprint', 'blitz', 'daily', 'survival', 'battle', 'expedition', 'depths'];

// ── Challenge definitions ─────────────────────────────────────────────────────
// Each challenge: { mode, tier (1-5), tierName, desc, check(progress) → bool }
// check() is called with the mode's accumulated progress object; returns true if met.
// Tier ordering is enforced externally (must unlock tier N before N+1 is checked).

var MASTERY_CHALLENGES = {

  classic: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Clear 50 lines in a single game',
      check: function (p) { return p.bestLines >= 50; },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Score 25,000+ in a single game',
      check: function (p) { return p.bestScore >= 25000; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Achieve a 10+ combo chain',
      check: function (p) { return p.bestCombo >= 10; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Score 50,000+ with Diamond Pickaxe crafted in-game',
      check: function (p) { return p.bestScoreWithDiamond >= 50000; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Survive 10+ difficulty tiers (10 minutes at escalating speed)',
      check: function (p) { return p.bestTier >= 10 && p.bestTimeSeconds >= 600; },
    },
  ],

  sprint: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Complete 10 Sprint games',
      check: function (p) { return p.completions >= 10; },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Finish under 2:00',
      check: function (p) { return p.bestTimeMs > 0 && p.bestTimeMs <= 120000; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Finish under 1:30',
      check: function (p) { return p.bestTimeMs > 0 && p.bestTimeMs <= 90000; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Finish under 1:15',
      check: function (p) { return p.bestTimeMs > 0 && p.bestTimeMs <= 75000; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Finish under 1:00',
      check: function (p) { return p.bestTimeMs > 0 && p.bestTimeMs <= 60000; },
    },
  ],

  blitz: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Complete 10 Blitz games',
      check: function (p) { return p.completions >= 10; },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Score 10,000+ in a single Blitz',
      check: function (p) { return p.bestScore >= 10000; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Score 15,000+ in a single Blitz',
      check: function (p) { return p.bestScore >= 15000; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Score 20,000+ with at least 5 combos',
      check: function (p) { return p.bestScoreWithCombos >= 20000; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Score 25,000+ in a single Blitz',
      check: function (p) { return p.bestScore >= 25000; },
    },
  ],

  daily: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Complete 7 daily challenges',
      check: function (p) { return p.completions >= 7; },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Complete 14 daily challenges with top-50% score',
      check: function (p) { return p.top50Count >= 14; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Achieve #1 on any daily leaderboard',
      check: function (p) { return p.firstPlaceCount >= 1; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Complete 30 daily challenges',
      check: function (p) { return p.completions >= 30; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Achieve #1 on 5 different daily leaderboards',
      check: function (p) { return p.firstPlaceCount >= 5; },
    },
  ],

  survival: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Survive 5 minutes in Survival mode',
      check: function (p) { return p.bestTimeSeconds >= 300; },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Build a world with 100+ placed blocks',
      check: function (p) { return p.bestBlocksPlaced >= 100; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Survive 15 minutes in a single session',
      check: function (p) { return p.bestTimeSeconds >= 900; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Craft a Diamond Pickaxe in Survival',
      check: function (p) { return p.diamondPickaxeCrafted === true; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Survive 30 minutes with 200+ placed blocks',
      check: function (p) { return p.bestTimeSeconds >= 1800 && p.bestBlocksPlaced >= 200; },
    },
  ],

  battle: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Win 5 Battle matches',
      check: function (p) { return p.wins >= 5; },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Reach Iron rank (1000 rating)',
      check: function (p) { return p.peakRating >= 1000; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Reach Gold rank (1200 rating)',
      check: function (p) { return p.peakRating >= 1200; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Reach Diamond rank (1400 rating)',
      check: function (p) { return p.peakRating >= 1400; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Reach Obsidian rank (1600+ rating)',
      check: function (p) { return p.peakRating >= 1600; },
    },
  ],

  expedition: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Complete one expedition run in each biome',
      check: function (p) {
        return p.biomesCompleted && p.biomesCompleted.stone && p.biomesCompleted.forest &&
               p.biomesCompleted.nether && p.biomesCompleted.ice;
      },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Reach tier 5 in any biome reward track',
      check: function (p) { return p.maxBiomeTier >= 5; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Reach tier 10 in any biome reward track',
      check: function (p) { return p.maxBiomeTier >= 10; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Reach tier 10 in 2+ biome reward tracks',
      check: function (p) { return p.biomesAtTier10 >= 2; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Reach tier 15 (Master) in any biome',
      check: function (p) { return p.maxBiomeTier >= 15; },
    },
  ],

  depths: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Complete 3 Depths runs (any variant)',
      check: function (p) { return p.completions >= 3; },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Descend to floor 5 in any Depths run',
      check: function (p) { return p.bestFloor >= 5; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Descend to floor 10 in any Depths run',
      check: function (p) { return p.bestFloor >= 10; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Reach floor 8 in Infinite Depths',
      check: function (p) { return p.bestInfiniteFloor >= 8; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Reach floor 15 in Infinite Depths',
      check: function (p) { return p.bestInfiniteFloor >= 15; },
    },
  ],

};

// ── Persistence ───────────────────────────────────────────────────────────────

function loadMastery() {
  try {
    var raw = localStorage.getItem(MASTERY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveMastery(state) {
  try {
    localStorage.setItem(MASTERY_STORAGE_KEY, JSON.stringify(state));
  } catch (_) {}
}

/** Returns the mastery state for a mode, creating default if missing. */
function _getModeState(state, mode) {
  if (!state[mode]) {
    state[mode] = { tier: 0, progress: {} };
  }
  return state[mode];
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Returns the total mastery score across all modes.
 * Bronze=1, Silver=2, Gold=3, Diamond=4, Obsidian=5 per mode.
 */
function getMasteryScore() {
  var state = loadMastery();
  var total = 0;
  for (var i = 0; i < MASTERY_MODES.length; i++) {
    var mode = MASTERY_MODES[i];
    var ms = state[mode];
    if (ms && ms.tier > 0) {
      total += MASTERY_TIER_POINTS[MASTERY_TIER_NAMES[ms.tier - 1]] || 0;
    }
  }
  return total;
}

/**
 * Returns current tier number (0=none, 1=bronze…5=obsidian) for a mode.
 */
function getMasteryTier(mode) {
  var state = loadMastery();
  return state[mode] ? (state[mode].tier || 0) : 0;
}

// ── Unlock ────────────────────────────────────────────────────────────────────

/**
 * Unlock a mastery tier for a mode. Persists and shows notification.
 * No-ops if tier already unlocked or tier is not the next sequential tier.
 *
 * @param {string} mode      Mode key (e.g. 'classic')
 * @param {number} tier      Tier number 1-5
 */
function unlockMasteryTier(mode, tier) {
  var state = loadMastery();
  var ms = _getModeState(state, mode);

  // Must be the next sequential tier
  if (ms.tier >= tier) return;
  if (tier !== ms.tier + 1) return;

  ms.tier = tier;
  saveMastery(state);

  var tierName = MASTERY_TIER_NAMES[tier - 1] || '';
  var modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);

  // Unlock the cosmetic reward for this tier
  var cosmeticId = 'mastery_' + mode + '_' + tierName;
  if (typeof processUnlocks === 'function') processUnlocks();

  // Skip post-game overlay if already celebrated mid-game via mastery HUD
  var _midKey = mode + '_' + tierName;
  var _skipOverlay = typeof _masteryMidGameUnlocks !== 'undefined' &&
                     _masteryMidGameUnlocks instanceof Set &&
                     _masteryMidGameUnlocks.has(_midKey);
  if (!_skipOverlay) {
    _showMasteryUnlockOverlay(modeLabel, tierName, cosmeticId);
  }

  // Award guild XP for mastery tier unlock
  if (typeof awardGuildXP === 'function') {
    awardGuildXP('mastery_unlock');
  }

  // Submit updated mastery score to leaderboard worker
  _submitMasteryToLeaderboard();
}

// ── Notification ──────────────────────────────────────────────────────────────

// Mode icons for display
var MASTERY_MODE_ICONS = {
  classic:    '\uD83C\uDFAE',
  sprint:     '\u26A1',
  blitz:      '\uD83D\uDCA5',
  daily:      '\uD83D\uDCC5',
  survival:   '\uD83C\uDF32',
  battle:     '\u2694\uFE0F',
  expedition: '\uD83D\uDDFA\uFE0F',
  depths:     '\u2620\uFE0F',
};

// Tier accent colors
var MASTERY_TIER_COLORS = {
  bronze:   '#cd7f32',
  silver:   '#c0c0c0',
  gold:     '#ffd700',
  diamond:  '#b9f2ff',
  obsidian: '#7c3aed',
};

function _showMasteryUnlockOverlay(modeLabel, tierName, cosmeticId) {
  var tierIcon  = MASTERY_TIER_ICONS[tierName] || '\u2B50';
  var tierLabel = tierName.charAt(0).toUpperCase() + tierName.slice(1);
  var tierColor = MASTERY_TIER_COLORS[tierName] || '#ffd700';
  var modeLower = modeLabel.toLowerCase();
  var modeIcon  = MASTERY_MODE_ICONS[modeLower] || '\uD83C\uDFAE';

  // Find cosmetic reward name
  var rewardName = '';
  if (typeof getCosmeticById === 'function' && cosmeticId) {
    var cos = getCosmeticById(cosmeticId);
    if (cos) rewardName = cos.name + ' (' + cos.category.replace('_', ' ') + ')';
  }

  // Build or reuse overlay
  var overlay = document.getElementById('mastery-unlock-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mastery-unlock-overlay';
    overlay.innerHTML =
      '<div class="muo-backdrop"></div>' +
      '<div class="muo-panel">' +
        '<div class="muo-mode-icon"></div>' +
        '<div class="muo-tier-icon"></div>' +
        '<div class="muo-header">MASTERY UNLOCKED</div>' +
        '<div class="muo-tier-label"></div>' +
        '<div class="muo-mode-label"></div>' +
        '<div class="muo-reward"></div>' +
        '<button class="muo-dismiss-btn">TAP TO CONTINUE</button>' +
      '</div>';
    document.body.appendChild(overlay);

    // Dismiss on button or backdrop click
    overlay.querySelector('.muo-dismiss-btn').addEventListener('click', function () {
      _hideMasteryUnlockOverlay();
    });
    overlay.querySelector('.muo-backdrop').addEventListener('click', function () {
      _hideMasteryUnlockOverlay();
    });
  }

  overlay.querySelector('.muo-mode-icon').textContent  = modeIcon;
  overlay.querySelector('.muo-tier-icon').textContent  = tierIcon;
  overlay.querySelector('.muo-tier-label').textContent = tierLabel;
  overlay.querySelector('.muo-mode-label').textContent = modeLabel + ' Mastery';
  overlay.querySelector('.muo-reward').textContent     = rewardName ? '\uD83C\uDF81 ' + rewardName : '';

  var panel = overlay.querySelector('.muo-panel');
  if (panel) panel.style.borderColor = tierColor;
  var header = overlay.querySelector('.muo-header');
  if (header) header.style.color = tierColor;

  // Play ascending chime
  _playMasteryChime(tierName);

  overlay.classList.remove('muo-visible');
  void overlay.offsetWidth;
  overlay.classList.add('muo-visible');

  // Auto-dismiss after 3 seconds
  clearTimeout(overlay._hideTimer);
  overlay._hideTimer = setTimeout(function () {
    _hideMasteryUnlockOverlay();
  }, 3000);
}

function _hideMasteryUnlockOverlay() {
  var overlay = document.getElementById('mastery-unlock-overlay');
  if (overlay) {
    clearTimeout(overlay._hideTimer);
    overlay.classList.remove('muo-visible');
  }
}

function _playMasteryChime(tierName) {
  try {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    var ctx = new AudioCtx();

    // Ascending scale — more notes for higher tiers
    var tierIndex = ['bronze', 'silver', 'gold', 'diamond', 'obsidian'].indexOf(tierName);
    var noteCount = 3 + tierIndex; // 3-7 notes
    var baseFreq = 440;
    var scale    = [1, 1.125, 1.25, 1.333, 1.5, 1.667, 1.875, 2]; // major scale ratios
    var noteDur  = 0.12;
    var now = ctx.currentTime;

    for (var i = 0; i < noteCount; i++) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = baseFreq * scale[i % scale.length];
      var t = now + i * noteDur;
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + noteDur * 0.9);
      osc.start(t);
      osc.stop(t + noteDur);
    }
  } catch (_) {}
}

// ── Core progress checker ─────────────────────────────────────────────────────

/**
 * Check and unlock any newly-met mastery tiers for a mode.
 * Respects sequential ordering: only checks the next tier above the current one.
 *
 * @param {string} mode      Mode key
 * @param {object} gameStats Stats from the just-ended game/run (see mode hooks below)
 */
function checkMasteryProgress(mode, gameStats) {
  var challenges = MASTERY_CHALLENGES[mode];
  if (!challenges) return;

  var state = loadMastery();
  var ms = _getModeState(state, mode);

  // Merge incoming gameStats into persistent progress
  _mergeProgress(mode, ms.progress, gameStats);
  saveMastery(state);

  // Check challenges sequentially — stop at first unmet tier
  for (var i = 0; i < challenges.length; i++) {
    var challenge = challenges[i];
    if (challenge.tier <= ms.tier) continue; // already unlocked
    if (challenge.tier !== ms.tier + 1) break; // not the next sequential tier

    if (challenge.check(ms.progress)) {
      unlockMasteryTier(mode, challenge.tier);
      // Re-read state after potential unlock to continue checking next tier
      state = loadMastery();
      ms = _getModeState(state, mode);
    } else {
      break; // Sequential — stop checking once a tier fails
    }
  }
}

/**
 * Merge a gameStats snapshot into the persistent progress for a mode.
 * Only ever updates with better/higher values (best-of tracking).
 */
function _mergeProgress(mode, progress, stats) {
  if (!stats) return;

  if (mode === 'classic') {
    if (stats.linesCleared > (progress.bestLines || 0))         progress.bestLines = stats.linesCleared;
    if (stats.score > (progress.bestScore || 0))                progress.bestScore = stats.score;
    if (stats.maxCombo > (progress.bestCombo || 0))             progress.bestCombo = stats.maxCombo;
    if (stats.tier > (progress.bestTier || 0))                  progress.bestTier = stats.tier;
    if (stats.timeSeconds > (progress.bestTimeSeconds || 0))    progress.bestTimeSeconds = stats.timeSeconds;
    if (stats.diamondPickaxe && stats.score >= 50000) {
      if (stats.score > (progress.bestScoreWithDiamond || 0))   progress.bestScoreWithDiamond = stats.score;
    }
  }

  if (mode === 'sprint') {
    progress.completions = (progress.completions || 0) + 1;
    if (!progress.bestTimeMs || stats.timeMs < progress.bestTimeMs) progress.bestTimeMs = stats.timeMs;
  }

  if (mode === 'blitz') {
    progress.completions = (progress.completions || 0) + 1;
    if (stats.score > (progress.bestScore || 0))                progress.bestScore = stats.score;
    if (stats.score >= 20000 && stats.combos >= 5) {
      if (stats.score > (progress.bestScoreWithCombos || 0))    progress.bestScoreWithCombos = stats.score;
    }
  }

  if (mode === 'daily') {
    if (stats.completed) {
      progress.completions = (progress.completions || 0) + 1;
    }
    if (stats.isTop50) {
      progress.top50Count = (progress.top50Count || 0) + 1;
    }
    if (stats.isFirstPlace) {
      progress.firstPlaceCount = (progress.firstPlaceCount || 0) + 1;
    }
  }

  if (mode === 'survival') {
    if (stats.timeSeconds > (progress.bestTimeSeconds || 0))    progress.bestTimeSeconds = stats.timeSeconds;
    if (stats.blocksPlaced > (progress.bestBlocksPlaced || 0))  progress.bestBlocksPlaced = stats.blocksPlaced;
    if (stats.diamondPickaxe)                                   progress.diamondPickaxeCrafted = true;
  }

  if (mode === 'battle') {
    if (stats.wins !== undefined && stats.wins > (progress.wins || 0))        progress.wins = stats.wins;
    if (stats.rating !== undefined && stats.rating > (progress.peakRating || 0)) progress.peakRating = stats.rating;
  }

  if (mode === 'expedition') {
    if (!progress.biomesCompleted) progress.biomesCompleted = {};
    if (stats.biomeId) progress.biomesCompleted[stats.biomeId] = true;
    if (stats.maxBiomeTier > (progress.maxBiomeTier || 0))      progress.maxBiomeTier = stats.maxBiomeTier;
    if (stats.biomesAtTier10 > (progress.biomesAtTier10 || 0))  progress.biomesAtTier10 = stats.biomesAtTier10;
  }

  if (mode === 'depths') {
    progress.completions = (progress.completions || 0) + 1;
    if (stats.floor > (progress.bestFloor || 0))               progress.bestFloor = stats.floor;
    if (stats.dungeonId === 'infinite' && stats.floor > (progress.bestInfiniteFloor || 0)) {
      progress.bestInfiniteFloor = stats.floor;
    }
  }

}

// ── Mode-specific hooks ───────────────────────────────────────────────────────
// Call these from each mode's game-end handler.

/**
 * Call at the end of a classic, survival, or daily game (from gamestate.js showGameOver).
 * @param {object} opts  {
 *   score, linesCleared, maxCombo, difficultyTier, timeSeconds,
 *   pickaxeTier, isSurvivalMode, isDailyChallenge, blocksPlaced
 * }
 */
function masteryOnClassicEnd(opts) {
  var score        = opts.score        || 0;
  var linesCleared = opts.linesCleared || 0;
  var maxCombo     = opts.maxCombo     || 0;
  var tier         = opts.difficultyTier || 0;
  var timeSeconds  = opts.timeSeconds  || 0;
  var pickaxeTier  = opts.pickaxeTier  || 'none';
  var blocksPlaced = opts.blocksPlaced || 0;
  var hasDiamond   = (pickaxeTier === 'diamond' || pickaxeTier === 'obsidian');

  if (opts.isSurvivalMode) {
    checkMasteryProgress('survival', {
      timeSeconds:  timeSeconds,
      blocksPlaced: blocksPlaced,
      diamondPickaxe: hasDiamond,
    });
    return;
  }

  if (opts.isDailyChallenge) {
    checkMasteryProgress('daily', {
      completed:    true,
      isTop50:      false, // updated later by masteryOnDailyLeaderboardRank
      isFirstPlace: false,
    });
    return;
  }

  // Pure classic
  checkMasteryProgress('classic', {
    score:          score,
    linesCleared:   linesCleared,
    maxCombo:       maxCombo,
    tier:           tier,
    timeSeconds:    timeSeconds,
    diamondPickaxe: hasDiamond,
  });
}

/**
 * Call when sprint is completed (from sprint.js).
 * @param {number} finalTimeMs  Sprint finish time in milliseconds
 */
function masteryOnSprintComplete(finalTimeMs) {
  checkMasteryProgress('sprint', { timeMs: finalTimeMs });
}

/**
 * Call when blitz is completed (from blitz.js).
 * @param {number} finalScore  Final blitz score
 * @param {number} combos      Number of combos achieved this game
 */
function masteryOnBlitzComplete(finalScore, combos) {
  checkMasteryProgress('blitz', { score: finalScore || 0, combos: combos || 0 });
}

/**
 * Call when a battle result is received (from gamestate.js).
 * Reads current rating from loadBattleRating() directly.
 */
function masteryOnBattleResult() {
  if (typeof loadBattleRating !== 'function') return;
  var ratingData = loadBattleRating();
  checkMasteryProgress('battle', {
    wins:   ratingData.wins   || 0,
    rating: ratingData.rating || 1000,
  });
}

/**
 * Call when a daily leaderboard rank comes back from the server.
 * @param {number} rank         Player's rank (1 = first place)
 * @param {number} totalPlayers Total players on the leaderboard
 */
function masteryOnDailyLeaderboardRank(rank, totalPlayers) {
  var isTop50      = rank > 0 && totalPlayers > 0 && rank <= Math.ceil(totalPlayers / 2);
  var isFirstPlace = rank === 1;

  var state   = loadMastery();
  var ms      = _getModeState(state, 'daily');
  var prog    = ms.progress;

  if (isTop50)      prog.top50Count      = (prog.top50Count      || 0) + 1;
  if (isFirstPlace) prog.firstPlaceCount = (prog.firstPlaceCount || 0) + 1;

  saveMastery(state);
  checkMasteryProgress('daily', {}); // re-evaluate without changing counters again
}

/**
 * Call when an expedition run ends (from expedition-session.js showExpeditionResults).
 * @param {string} biomeId    The biome that was run (stone, forest, nether, ice)
 * @param {object} trackInfo  getBiomeTrackInfo(biomeId) result
 */
function masteryOnExpeditionEnd(biomeId, trackInfo) {
  if (!biomeId) return;

  // Collect current tier info for all 4 biomes to compute maxBiomeTier & biomesAtTier10
  var biomes = ['stone', 'forest', 'nether', 'ice'];
  var maxTier = 0;
  var tier10Count = 0;
  for (var i = 0; i < biomes.length; i++) {
    var info = (typeof getBiomeTrackInfo === 'function') ? getBiomeTrackInfo(biomes[i]) : null;
    var t = info ? (info.currentTier ? info.currentTier.tier : 1) : 1;
    if (t > maxTier) maxTier = t;
    if (t >= 10) tier10Count++;
  }

  checkMasteryProgress('expedition', {
    biomeId:       biomeId,
    maxBiomeTier:  maxTier,
    biomesAtTier10: tier10Count,
  });
}

/**
 * Call when a survival session ends (alias for masteryOnClassicEnd with isSurvivalMode=true).
 * Convenience hook for callers that track survival separately.
 * @param {object} opts  { timeSeconds, blocksPlaced, pickaxeTier }
 */
function masteryOnSurvivalEnd(opts) {
  var pickaxeTier = opts.pickaxeTier || 'none';
  checkMasteryProgress('survival', {
    timeSeconds:   opts.timeSeconds  || 0,
    blocksPlaced:  opts.blocksPlaced || 0,
    diamondPickaxe: (pickaxeTier === 'diamond' || pickaxeTier === 'obsidian'),
  });
}

/**
 * Call when a Depths dungeon run ends (from gamestate.js triggerGameOver).
 * @param {object} opts  { floor, dungeonId }
 */
function masteryOnDepthsEnd(opts) {
  var floor     = opts.floor     || 1;
  var dungeonId = opts.dungeonId || '';
  checkMasteryProgress('depths', { floor: floor, dungeonId: dungeonId });
}

// ── Leaderboard submission ─────────────────────────────────────────────────────

/**
 * Submit current mastery state to the global mastery leaderboard worker.
 * Called automatically on tier unlock. Requires loadDisplayName() from leaderboard.js.
 */
function _submitMasteryToLeaderboard() {
  if (typeof loadDisplayName !== 'function') return;
  var displayName = loadDisplayName();
  if (!displayName) return;

  var state = loadMastery();
  var totalScore = 0;
  var obsidianCount = 0;
  var tiers = {};

  for (var i = 0; i < MASTERY_MODES.length; i++) {
    var mode = MASTERY_MODES[i];
    var ms = state[mode];
    var tier = ms ? (ms.tier || 0) : 0;
    tiers[mode] = tier;
    if (tier > 0) {
      totalScore += MASTERY_TIER_POINTS[MASTERY_TIER_NAMES[tier - 1]] || 0;
      if (tier === 5) obsidianCount++;
    }
  }

  var workerUrl = (typeof LEADERBOARD_WORKER_URL !== 'undefined') ? LEADERBOARD_WORKER_URL : '';
  if (!workerUrl) return;

  fetch(workerUrl + '/api/mastery/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName:  displayName,
      totalScore:   totalScore,
      tiers:        tiers,
      obsidianCount: obsidianCount,
      timestamp:    new Date().toISOString(),
    }),
  }).catch(function () {}); // fire-and-forget
}

// ── Live progress calculator (for in-game HUD) ────────────────────────────────
//
// Returns (current, target, unit, type) for the next incomplete tier.
// Read-only: does not mutate any stored state.

var MASTERY_LIVE_CALC = {

  classic: [
    function(p, s) { // Bronze: clear 50 lines
      var cur = Math.max(p.bestLines || 0, s.linesCleared || 0);
      return { type: 'threshold', primary: { current: cur, target: 50, unit: 'lines' }, percent: cur / 50 };
    },
    function(p, s) { // Silver: score 25,000
      var cur = Math.max(p.bestScore || 0, s.score || 0);
      return { type: 'threshold', primary: { current: cur, target: 25000, unit: 'pts' }, percent: cur / 25000 };
    },
    function(p, s) { // Gold: 10+ combo
      var cur = Math.max(p.bestCombo || 0, s.maxCombo || 0);
      return { type: 'threshold', primary: { current: cur, target: 10, unit: 'combo' }, percent: cur / 10 };
    },
    function(p, s) { // Diamond: 50K + diamond pickaxe
      var cur = Math.max(p.bestScoreWithDiamond || 0, s.hasDiamondPickaxe ? (s.score || 0) : 0);
      var secMet = !!(s.hasDiamondPickaxe || (p.bestScoreWithDiamond || 0) > 0);
      return { type: 'compound', primary: { current: cur, target: 50000, unit: 'pts' },
        secondary: { label: '⛏ Diamond Pick', met: secMet }, percent: cur / 50000 };
    },
    function(p, s) { // Obsidian: 10+ tiers + 10 min
      var curTier = Math.max(p.bestTier || 0, s.difficultyTier || 0);
      var curTime = Math.max(p.bestTimeSeconds || 0, s.timeSeconds || 0);
      return { type: 'compound', primary: { current: curTier, target: 10, unit: 'tiers' },
        secondary: { label: '⏱ 10+ min', met: curTime >= 600 }, percent: curTier / 10 };
    },
  ],

  sprint: [
    function(p, s) { // Bronze: 10 completions
      var cur = p.completions || 0;
      return { type: 'cumulative', primary: { current: cur, target: 10, unit: 'games', pending: true }, percent: cur / 10 };
    },
    function(p, s) { // Silver: under 2:00
      var e = s.elapsedMs || 0;
      return { type: 'time_under', primary: { current: e, target: 120000, unit: 'ms' }, percent: e / 120000 };
    },
    function(p, s) { // Gold: under 1:30
      var e = s.elapsedMs || 0;
      return { type: 'time_under', primary: { current: e, target: 90000, unit: 'ms' }, percent: e / 90000 };
    },
    function(p, s) { // Diamond: under 1:15
      var e = s.elapsedMs || 0;
      return { type: 'time_under', primary: { current: e, target: 75000, unit: 'ms' }, percent: e / 75000 };
    },
    function(p, s) { // Obsidian: under 1:00
      var e = s.elapsedMs || 0;
      return { type: 'time_under', primary: { current: e, target: 60000, unit: 'ms' }, percent: e / 60000 };
    },
  ],

  blitz: [
    function(p, s) { // Bronze: 10 completions
      var cur = p.completions || 0;
      return { type: 'cumulative', primary: { current: cur, target: 10, unit: 'games', pending: true }, percent: cur / 10 };
    },
    function(p, s) { // Silver: 10,000
      var cur = Math.max(p.bestScore || 0, s.score || 0);
      return { type: 'threshold', primary: { current: cur, target: 10000, unit: 'pts' }, percent: cur / 10000 };
    },
    function(p, s) { // Gold: 15,000
      var cur = Math.max(p.bestScore || 0, s.score || 0);
      return { type: 'threshold', primary: { current: cur, target: 15000, unit: 'pts' }, percent: cur / 15000 };
    },
    function(p, s) { // Diamond: 20K + 5 combos
      var combos = s.combos || 0;
      var cur = Math.max(p.bestScore || 0, s.score || 0);
      var secMet = combos >= 5;
      return { type: 'compound', primary: { current: cur, target: 20000, unit: 'pts' },
        secondary: { label: 'Combos: ' + combos + '/5', met: secMet }, percent: cur / 20000 };
    },
    function(p, s) { // Obsidian: 25,000
      var cur = Math.max(p.bestScore || 0, s.score || 0);
      return { type: 'threshold', primary: { current: cur, target: 25000, unit: 'pts' }, percent: cur / 25000 };
    },
  ],

  daily: [
    function(p, s) { // Bronze: 7 completions
      var cur = p.completions || 0;
      return { type: 'cumulative', primary: { current: cur, target: 7, unit: 'challenges', pending: false }, percent: cur / 7 };
    },
    function(p, s) { // Silver: 14 top-50%
      var cur = p.top50Count || 0;
      return { type: 'cumulative', primary: { current: cur, target: 14, unit: 'top-50%', pending: false }, percent: cur / 14 };
    },
    function(p, s) { // Gold: 1 first place
      var cur = p.firstPlaceCount || 0;
      return { type: 'cumulative', primary: { current: cur, target: 1, unit: '#1 finish', pending: false }, percent: cur / 1 };
    },
    function(p, s) { // Diamond: 30 completions
      var cur = p.completions || 0;
      return { type: 'cumulative', primary: { current: cur, target: 30, unit: 'challenges', pending: false }, percent: cur / 30 };
    },
    function(p, s) { // Obsidian: 5 first places
      var cur = p.firstPlaceCount || 0;
      return { type: 'cumulative', primary: { current: cur, target: 5, unit: '#1 finishes', pending: false }, percent: cur / 5 };
    },
  ],

  survival: [
    function(p, s) { // Bronze: 5 min
      var cur = Math.max(p.bestTimeSeconds || 0, s.timeSeconds || 0);
      return { type: 'threshold', primary: { current: cur, target: 300, unit: 'sec' }, percent: cur / 300 };
    },
    function(p, s) { // Silver: 100 blocks
      var cur = Math.max(p.bestBlocksPlaced || 0, s.blocksPlaced || 0);
      return { type: 'threshold', primary: { current: cur, target: 100, unit: 'blocks' }, percent: cur / 100 };
    },
    function(p, s) { // Gold: 15 min
      var cur = Math.max(p.bestTimeSeconds || 0, s.timeSeconds || 0);
      return { type: 'threshold', primary: { current: cur, target: 900, unit: 'sec' }, percent: cur / 900 };
    },
    function(p, s) { // Diamond: craft diamond pickaxe
      var met = !!(p.diamondPickaxeCrafted || s.hasDiamondPickaxe);
      return { type: 'threshold', primary: { current: met ? 1 : 0, target: 1, unit: 'craft' }, percent: met ? 1.0 : 0.0 };
    },
    function(p, s) { // Obsidian: 30 min + 200 blocks
      var curTime = Math.max(p.bestTimeSeconds || 0, s.timeSeconds || 0);
      var curBlocks = Math.max(p.bestBlocksPlaced || 0, s.blocksPlaced || 0);
      return { type: 'compound', primary: { current: curTime, target: 1800, unit: 'sec' },
        secondary: { label: 'Blocks: ' + curBlocks + '/200', met: curBlocks >= 200 }, percent: curTime / 1800 };
    },
  ],

  battle: [
    function(p, s) { // Bronze: 5 wins
      var cur = p.wins || 0;
      return { type: 'cumulative', primary: { current: cur, target: 5, unit: 'wins', pending: false }, percent: cur / 5 };
    },
    function(p, s) { // Silver: 1000 rating
      var cur = Math.max(p.peakRating || 0, s.rating || 0);
      return { type: 'threshold', primary: { current: cur, target: 1000, unit: 'rating' }, percent: cur / 1000 };
    },
    function(p, s) { // Gold: 1200 rating
      var cur = Math.max(p.peakRating || 0, s.rating || 0);
      return { type: 'threshold', primary: { current: cur, target: 1200, unit: 'rating' }, percent: cur / 1200 };
    },
    function(p, s) { // Diamond: 1400 rating
      var cur = Math.max(p.peakRating || 0, s.rating || 0);
      return { type: 'threshold', primary: { current: cur, target: 1400, unit: 'rating' }, percent: cur / 1400 };
    },
    function(p, s) { // Obsidian: 1600 rating
      var cur = Math.max(p.peakRating || 0, s.rating || 0);
      return { type: 'threshold', primary: { current: cur, target: 1600, unit: 'rating' }, percent: cur / 1600 };
    },
  ],

  expedition: [
    function(p, s) { // Bronze: all 4 biomes
      var bc = p.biomesCompleted || {};
      var biomes = ['stone', 'forest', 'nether', 'ice'];
      var count = 0;
      for (var i = 0; i < biomes.length; i++) { if (bc[biomes[i]]) count++; }
      return { type: 'multi_target', primary: { current: count, target: 4, unit: 'biomes' }, percent: count / 4 };
    },
    function(p, s) { // Silver: max biome tier 5
      var cur = Math.max(p.maxBiomeTier || 0, s.maxBiomeTier || 0);
      return { type: 'threshold', primary: { current: cur, target: 5, unit: 'tier' }, percent: cur / 5 };
    },
    function(p, s) { // Gold: max biome tier 10
      var cur = Math.max(p.maxBiomeTier || 0, s.maxBiomeTier || 0);
      return { type: 'threshold', primary: { current: cur, target: 10, unit: 'tier' }, percent: cur / 10 };
    },
    function(p, s) { // Diamond: 2+ biomes at tier 10
      var cur = Math.max(p.biomesAtTier10 || 0, s.biomesAtTier10 || 0);
      return { type: 'multi_target', primary: { current: cur, target: 2, unit: 'biomes@T10' }, percent: cur / 2 };
    },
    function(p, s) { // Obsidian: max biome tier 15
      var cur = Math.max(p.maxBiomeTier || 0, s.maxBiomeTier || 0);
      return { type: 'threshold', primary: { current: cur, target: 15, unit: 'tier' }, percent: cur / 15 };
    },
  ],

  depths: [
    function(p, s) { // Bronze: 3 completions
      var cur = p.completions || 0;
      return { type: 'cumulative', primary: { current: cur, target: 3, unit: 'runs', pending: false }, percent: cur / 3 };
    },
    function(p, s) { // Silver: floor 5
      var cur = Math.max(p.bestFloor || 0, s.floor || 0);
      return { type: 'threshold', primary: { current: cur, target: 5, unit: 'floors' }, percent: cur / 5 };
    },
    function(p, s) { // Gold: floor 10
      var cur = Math.max(p.bestFloor || 0, s.floor || 0);
      return { type: 'threshold', primary: { current: cur, target: 10, unit: 'floors' }, percent: cur / 10 };
    },
    function(p, s) { // Diamond: infinite floor 8
      var cur = Math.max(p.bestInfiniteFloor || 0, s.infiniteFloor || 0);
      return { type: 'threshold', primary: { current: cur, target: 8, unit: 'floors' }, percent: cur / 8 };
    },
    function(p, s) { // Obsidian: infinite floor 15
      var cur = Math.max(p.bestInfiniteFloor || 0, s.infiniteFloor || 0);
      return { type: 'threshold', primary: { current: cur, target: 15, unit: 'floors' }, percent: cur / 15 };
    },
  ],

};

/**
 * Compute live progress toward the next incomplete mastery tier.
 * Read-only — does not mutate any stored state.
 * Called from the mastery HUD on discrete game events (debounced at ~2/sec).
 *
 * @param {string} mode         Mode key (e.g. 'classic')
 * @param {object} currentStats Real-time stats for this mode (see mastery-hud.js)
 * @returns {object|null} Progress descriptor, or null if mode has no mastery data.
 *   Fields: tierIndex, tierName, tierLabel, tierIcon, tierColor, challengeText,
 *           progressType, primary, secondary, percent, justUnlocked, allComplete
 */
function getMasteryLiveProgress(mode, currentStats) {
  var challenges = MASTERY_CHALLENGES[mode];
  var calcs      = MASTERY_LIVE_CALC[mode];
  if (!challenges || !calcs) return null;

  var state = loadMastery();
  var ms = _getModeState(state, mode);
  var currentTier = ms.tier || 0;

  if (currentTier >= 5) return { allComplete: true };

  var nextTierIdx = currentTier; // 0-indexed
  var challenge   = challenges[nextTierIdx];
  var calc        = calcs[nextTierIdx];
  if (!challenge || !calc) return { allComplete: true };

  var tierName  = challenge.tierName;
  var computed  = calc(ms.progress || {}, currentStats || {});
  var pct       = isNaN(computed.percent) ? 0 : Math.min(1.0, Math.max(0, computed.percent));

  // Determine if this threshold was just crossed (mid-game unlock eligible)
  var justUnlocked = false;
  if (computed.type === 'threshold' || computed.type === 'multi_target') {
    justUnlocked = pct >= 1.0;
  } else if (computed.type === 'compound') {
    justUnlocked = pct >= 1.0 && !!(computed.secondary && computed.secondary.met);
  }
  // time_under and cumulative are handled post-game; justUnlocked stays false

  return {
    tierIndex:     nextTierIdx,
    tierName:      tierName,
    tierLabel:     tierName.charAt(0).toUpperCase() + tierName.slice(1),
    tierIcon:      MASTERY_TIER_ICONS[tierName]  || '⭐',
    tierColor:     MASTERY_TIER_COLORS[tierName] || '#ffd700',
    challengeText: challenge.desc,
    progressType:  computed.type,
    primary:       computed.primary  || null,
    secondary:     computed.secondary || null,
    percent:       pct,
    justUnlocked:  justUnlocked,
    allComplete:   false,
  };
}

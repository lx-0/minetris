// js/battle-rating.js — Elo-based rating system for Battle mode.
// Depends on: leaderboard.js (LEADERBOARD_WORKER_URL), daily.js (getDailyDateString)

const BATTLE_RATING_KEY           = 'mineCtris_battleRating';
const BATTLE_RATING_SUBMITTED_KEY = 'mineCtris_battleRatingSubmitted';

// Rank tiers (ordered highest first for lookup)
// Bronze (0-999), Silver (1000-1199), Gold (1200-1399), Platinum (1400-1599), Diamond (1600+)
const BATTLE_RANK_TIERS = [
  { name: 'Diamond',  icon: '\u25C6', cls: 'diamond',  min: 1600 },
  { name: 'Platinum', icon: '\u2739', cls: 'platinum', min: 1400 },
  { name: 'Gold',     icon: '\u2605', cls: 'gold',     min: 1200 },
  { name: 'Silver',   icon: '\u25A1', cls: 'silver',   min: 1000 },
  { name: 'Bronze',   icon: '\u25CB', cls: 'bronze',   min: 0    },
];

// Number of placement matches before rating is revealed
const PLACEMENT_MATCH_COUNT = 10;

// ── Storage ──────────────────────────────────────────────────────────────────

function _defaultBattleRating() {
  return {
    rating:          1000,
    wins:            0,
    losses:          0,
    draws:           0,
    matchCount:      0,
    rankedCount:     0,   // matches played in ranked queue
    placementDone:   false,
    winStreak:       0,
    peakRating:      1000,
  };
}

/** Returns true if the player is still in placement (first 10 ranked matches). */
function isInPlacement() {
  const data = loadBattleRating();
  return !data.placementDone && (data.rankedCount || 0) < PLACEMENT_MATCH_COUNT;
}

/** Returns placement progress string, e.g. "3 / 10". */
function getPlacementProgress() {
  const data = loadBattleRating();
  const done = Math.min(data.rankedCount || 0, PLACEMENT_MATCH_COUNT);
  return done + ' / ' + PLACEMENT_MATCH_COUNT;
}

/**
 * Returns an HTML snippet showing placement or tier badge.
 * During placement, shows "Placement X/10" instead of the rating.
 */
function getRankedStatusHtml() {
  const data = loadBattleRating();
  if (!data.placementDone && (data.rankedCount || 0) < PLACEMENT_MATCH_COUNT) {
    var done = data.rankedCount || 0;
    return '<span class="battle-rank-badge battle-rank-placement" title="Complete placement matches to reveal your rank">' +
      '\u26A1 Placement ' + done + '/' + PLACEMENT_MATCH_COUNT + '</span>';
  }
  return getBattleRankBadgeHtml(data.rating);
}

function loadBattleRating() {
  try {
    const raw = localStorage.getItem(BATTLE_RATING_KEY);
    return raw ? Object.assign(_defaultBattleRating(), JSON.parse(raw)) : _defaultBattleRating();
  } catch (_) {
    return _defaultBattleRating();
  }
}

function saveBattleRating(data) {
  try { localStorage.setItem(BATTLE_RATING_KEY, JSON.stringify(data)); } catch (_) {}
}

// ── Elo logic ─────────────────────────────────────────────────────────────────

/**
 * Expected score for the player given ratings.
 * @param {number} myRating
 * @param {number} oppRating
 */
function _eloExpected(myRating, oppRating) {
  return 1 / (1 + Math.pow(10, (oppRating - myRating) / 400));
}

/**
 * Apply Elo update after a match. Returns { ratingBefore, ratingAfter, delta, isPlacement }.
 * @param {'win'|'loss'|'draw'} result
 * @param {number} [oppRating=1000]  Opponent's rating (1000 default if unknown)
 * @param {boolean} [ranked=false]   Whether this was a ranked match
 */
function updateBattleRating(result, oppRating, ranked) {
  const data = loadBattleRating();
  const ratingBefore = data.rating;
  const wasInPlacement = !data.placementDone && (data.rankedCount || 0) < PLACEMENT_MATCH_COUNT;

  // K-factor: 48 during placement/anti-smurf (fast calibration for new accounts),
  // 32 for first 30 total matches, 16 thereafter for stable rating.
  let K;
  if (ranked && wasInPlacement) {
    K = 48; // Anti-smurf: new accounts calibrate quickly in placement
  } else if ((data.matchCount || 0) < 30) {
    K = 32; // Early matches: still learning the tier
  } else {
    K = 16; // Established rating: smaller swings
  }
  const opp      = (oppRating != null && !isNaN(oppRating)) ? oppRating : 1000;
  const expected = _eloExpected(data.rating, opp);
  const actual   = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  const delta    = Math.round(K * (actual - expected));

  data.rating     = Math.max(0, (data.rating || 1000) + delta);
  data.matchCount = (data.matchCount || 0) + 1;

  // Track ranked match count for placement
  if (ranked) {
    data.rankedCount = (data.rankedCount || 0) + 1;
    if (!data.placementDone && data.rankedCount >= PLACEMENT_MATCH_COUNT) {
      data.placementDone = true;
    }
  }

  if (result === 'win') {
    data.wins      = (data.wins || 0) + 1;
    data.winStreak = (data.winStreak || 0) + 1;
    // Award guild XP for winning a standard battle match
    if (typeof awardGuildXP === 'function') {
      awardGuildXP('standard_match_win');
    }
  } else if (result === 'loss') {
    data.losses    = (data.losses || 0) + 1;
    data.winStreak = 0;
  } else {
    data.draws     = (data.draws || 0) + 1;
    data.winStreak = 0;
  }

  var _isNewHigh = data.rating > (data.peakRating || 0);
  if (_isNewHigh) {
    data.peakRating = data.rating;
  }

  saveBattleRating(data);
  if (typeof recordSeasonBattleResult === 'function') recordSeasonBattleResult(result);

  // Season mission hooks
  if (_isNewHigh && typeof onSeasonMissionRatingHigh === 'function') {
    onSeasonMissionRatingHigh();
  }
  if (data.rating >= 1200 && typeof onSeasonMissionGoldTierReached === 'function') {
    onSeasonMissionGoldTierReached();
  }

  return { ratingBefore, ratingAfter: data.rating, delta, isPlacement: wasInPlacement, placementDone: data.placementDone };
}

// ── Rank tiers ────────────────────────────────────────────────────────────────

/** Returns the rank tier object for a given rating. */
function getBattleRankTier(rating) {
  for (let i = 0; i < BATTLE_RANK_TIERS.length; i++) {
    if ((rating || 0) >= BATTLE_RANK_TIERS[i].min) return BATTLE_RANK_TIERS[i];
  }
  return BATTLE_RANK_TIERS[BATTLE_RANK_TIERS.length - 1];
}

/**
 * Returns an HTML span with the rank badge icon + name.
 * @param {number} rating
 * @param {boolean} [showName=true]
 */
function getBattleRankBadgeHtml(rating, showName) {
  const tier = getBattleRankTier(rating);
  const nameStr = (showName !== false) ? ' ' + tier.name : '';
  return '<span class="battle-rank-badge battle-rank-' + tier.cls + '" title="' + tier.name + ' \u2014 ' + (rating || 1000) + ' pts">' +
    tier.icon + nameStr + '</span>';
}

// ── Tournament win bonus ──────────────────────────────────────────────────────

/**
 * Apply the +50 rating bonus for winning a tournament.
 * Returns the new rating value.
 */
function applyTournamentWinBonus() {
  const data = loadBattleRating();
  data.rating = (data.rating || 1000) + 50;
  const _isNewHigh = data.rating > (data.peakRating || 0);
  if (_isNewHigh) {
    data.peakRating = data.rating;
  }
  saveBattleRating(data);

  // Award guild XP for winning a tournament match
  if (typeof awardGuildXP === 'function') {
    awardGuildXP('tournament_match_win');
  }

  // XP Season Pass: 50 XP for tournament win
  if (typeof awardXpPassTournamentWin === 'function') awardXpPassTournamentWin();

  if (_isNewHigh && typeof onSeasonMissionRatingHigh === 'function') {
    onSeasonMissionRatingHigh();
  }
  if (data.rating >= 1200 && typeof onSeasonMissionGoldTierReached === 'function') {
    onSeasonMissionGoldTierReached();
  }
  return data.rating;
}

// ── Rate-limit helpers ────────────────────────────────────────────────────────

function hasBattleRatingSubmittedToday() {
  try {
    return localStorage.getItem(BATTLE_RATING_SUBMITTED_KEY) === getDailyDateString();
  } catch (_) { return false; }
}

function markBattleRatingSubmittedToday() {
  try { localStorage.setItem(BATTLE_RATING_SUBMITTED_KEY, getDailyDateString()); } catch (_) {}
}

// ── API calls ─────────────────────────────────────────────────────────────────

/**
 * Submit player's current battle rating to the Cloudflare Worker leaderboard.
 * Rate-limited to 1 submission per player per day.
 */
async function apiSubmitBattleRating(displayName, rating, wins, losses, draws) {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/battle/ratings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName,
      rating,
      wins,
      losses,
      draws,
      date: getDailyDateString(),
      clientTimestamp: Date.now(),
    }),
  });
  return resp.json();
}

/** Fetch the top-100 battle rankings from the Cloudflare Worker. */
async function apiFetchBattleLeaderboard() {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/battle/ratings?limit=100');
  return resp.json();
}

/**
 * Submit rating to leaderboard after a match (respects daily rate-limit).
 * Silently fails on network error — does not block UX.
 */
async function trySubmitBattleRatingToLeaderboard() {
  if (hasBattleRatingSubmittedToday()) return;
  const name = (typeof loadDisplayName === 'function') ? loadDisplayName() : '';
  if (!name) return;
  const data = loadBattleRating();
  try {
    await apiSubmitBattleRating(name, data.rating, data.wins, data.losses, data.draws);
    markBattleRatingSubmittedToday();
  } catch (_) {}
}

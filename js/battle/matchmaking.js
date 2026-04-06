// js/battle/matchmaking.js — Ranked matchmaking constants and helpers.
// Provides ELO search-range expansion logic and monthly rating soft-reset.
// Depends on: battle-rating.js (loadBattleRating, saveBattleRating)

// Ranked queue search-range constants
const RANKED_INITIAL_RANGE      = 200;   // Initial ±ELO search window
const RANKED_EXPAND_DELTA       = 50;    // ELO added per expansion tick
const RANKED_EXPAND_INTERVAL_MS = 15000; // Expand every 15 seconds

const _MONTHLY_RESET_KEY = 'mineCtris_monthlyRatingReset';

/**
 * Returns the current ELO search range given elapsed wait time.
 * Expands by RANKED_EXPAND_DELTA every RANKED_EXPAND_INTERVAL_MS.
 * @param {number} waitMs  Milliseconds elapsed since queue entry.
 * @returns {number}  Current ±ELO range.
 */
function getRankedSearchRange(waitMs) {
  const expansions = Math.floor((waitMs || 0) / RANKED_EXPAND_INTERVAL_MS);
  return RANKED_INITIAL_RANGE + expansions * RANKED_EXPAND_DELTA;
}

/**
 * Returns a "YYYY-MM" string for the current calendar month.
 */
function _getMonthlyResetKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/**
 * Apply the monthly rating soft-reset if not already done for this calendar month.
 * new rating = round(oldRating * 0.75 + 250)  → equilibrium at 1000 (Bronze/Silver border)
 * Only applies once per calendar month; skips players with zero ranked matches.
 * Idempotent — tracks last-reset month in localStorage.
 * @returns {number|null}  New rating, or null if reset was skipped or already applied.
 */
function applyMonthlyRatingResetIfNeeded() {
  const key = _getMonthlyResetKey();
  try {
    if (localStorage.getItem(_MONTHLY_RESET_KEY) === key) return null;
  } catch (_) {}

  if (typeof loadBattleRating !== 'function' || typeof saveBattleRating !== 'function') return null;

  const data = loadBattleRating();
  // Only reset if the player has played at least 1 ranked match
  if ((data.rankedCount || 0) < 1) return null;

  const oldRating  = data.rating || 1000;
  const newRating  = Math.round(oldRating * 0.75 + 250);
  data.rating      = newRating;
  saveBattleRating(data);

  try { localStorage.setItem(_MONTHLY_RESET_KEY, key); } catch (_) {}
  return newRating;
}

// Pure leveling helpers extracted for unit testing (no DOM / localStorage deps).

const MAX_LEVEL = 100;
export const PRESTIGE_LEVEL = 50;

function _xpForLevelUp(level) { return level * 500; }

const CUMULATIVE_XP = (() => {
  const arr = [0];
  for (let i = 1; i <= MAX_LEVEL; i++) arr[i] = arr[i - 1] + _xpForLevelUp(i);
  return arr;
})();

export function getLevelFromXP(totalXP) {
  if (!totalXP || totalXP < 0) return 1;
  for (let lvl = MAX_LEVEL; lvl >= 1; lvl--) {
    if (totalXP >= CUMULATIVE_XP[lvl - 1]) return lvl;
  }
  return 1;
}

export function getXPThresholdForLevel(level) {
  const idx = Math.max(1, Math.min(level, MAX_LEVEL));
  return CUMULATIVE_XP[idx - 1];
}

/** Mirrors canPrestige() logic: eligible when level >= PRESTIGE_LEVEL. */
export function canPrestigeAtXP(totalXP) {
  return getLevelFromXP(totalXP) >= PRESTIGE_LEVEL;
}

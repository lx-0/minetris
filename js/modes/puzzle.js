// Puzzle Mode — definitions, progress tracking, preset-block setup, and completion.
// Requires: state.js, config.js (COLORS, BLOCK_TYPES), world.js (createBlockMesh, registerBlock),
//           gamestate.js (submitLifetimeStats), achievements.js (unlockAchievement)

const PUZZLE_STORAGE_KEY = "mineCtris_puzzleProgress";

// ── Puzzle definitions ─────────────────────────────────────────────────────────
// layout: [[x, yLevel, z, colorIndex], ...]  yLevel 0 → world Y=0.5 (ground)
// pieces: ordered array of piece indices to draw from (1–7)
const PUZZLES = [
  {
    id: 1,
    name: "First Steps",
    difficulty: "easy",
    description: "Mine all the stone blocks to clear the field.",
    layout: [
      [-1, 0, 0, 2], [0, 0, 0, 2], [1, 0, 0, 2],
    ],
    pieces: [1, 3, 5, 2, 7, 4, 6],
    hintBlocks: [[-1, 0], [0, 0], [1, 0]],
  },
  {
    id: 2,
    name: "L-Shape",
    difficulty: "easy",
    description: "An L-shaped wall. Mine your way through it.",
    layout: [
      [0, 0, 0, 2], [0, 1, 0, 2], [0, 2, 0, 2], [1, 0, 0, 2],
    ],
    pieces: [2, 4, 6, 1, 3, 5, 7, 2],
    hintBlocks: [[0, 0], [1, 0]],
  },
  {
    id: 3,
    name: "The Staircase",
    difficulty: "easy",
    description: "Blocks ascend like stairs. Reach and mine each one.",
    layout: [
      [-2, 0, 0, 2], [-1, 1, 0, 2], [0, 2, 0, 2], [1, 3, 0, 2], [2, 4, 0, 2],
    ],
    pieces: [3, 1, 5, 2, 7, 4, 6, 1, 3],
    hintBlocks: [[-2, 0], [-1, 0], [0, 0]],
  },
  {
    id: 4,
    name: "Golden Arch",
    difficulty: "medium",
    description: "Gold ore forms an arch. Mine it all before pieces run out.",
    layout: [
      [-1, 0, 0, 3], [1, 0, 0, 3],
      [-1, 1, 0, 3], [0, 1, 0, 3], [1, 1, 0, 3],
    ],
    pieces: [2, 5, 7, 4, 1, 3, 6, 2, 5, 7],
    hintBlocks: [[-1, 0], [0, 0], [1, 0]],
  },
  {
    id: 5,
    name: "Crystal Column",
    difficulty: "medium",
    description: "Crystals stacked five high. Reach the top to clear them.",
    layout: [
      [0, 0, 0, 7], [0, 1, 0, 7], [0, 2, 0, 7], [0, 3, 0, 7], [0, 4, 0, 7],
    ],
    pieces: [1, 6, 3, 5, 2, 4, 7, 1, 6, 3],
    hintBlocks: [[-1, 0], [0, 0], [1, 0]],
  },
  {
    id: 6,
    name: "Mossy Cross",
    difficulty: "medium",
    description: "A cross of moss stone. Mine from all sides.",
    layout: [
      [0, 0, 0, 5],
      [-1, 1, 0, 5], [0, 1, 0, 5], [1, 1, 0, 5],
      [0, 2, 0, 5],
    ],
    pieces: [4, 7, 2, 5, 1, 6, 3, 4, 7, 2, 5],
    hintBlocks: [[-1, 0], [0, 0], [1, 0]],
  },
  {
    id: 7,
    name: "The Gate",
    difficulty: "medium",
    description: "Stone pillars support a crossbeam. Dismantle the gate.",
    layout: [
      [-2, 0, 0, 2], [-2, 1, 0, 2], [-2, 2, 0, 2],
      [2, 0, 0, 2], [2, 1, 0, 2], [2, 2, 0, 2],
      [-1, 2, 0, 2], [0, 2, 0, 2], [1, 2, 0, 2],
    ],
    pieces: [3, 1, 7, 5, 2, 6, 4, 3, 1, 7, 5, 2],
    hintBlocks: [[-2, 0], [-1, 0], [0, 0]],
  },
  {
    id: 8,
    name: "Lava Shards",
    difficulty: "hard",
    description: "Lava blocks scattered at height. Build stacks to reach them and clear 3 lines.",
    layout: [
      [-2, 3, -1, 6], [0, 4, 0, 6], [2, 3, 1, 6],
      [-1, 2, 1, 6], [1, 2, -1, 6],
    ],
    pieces: [2, 4, 7, 1, 5, 3, 6, 2, 4, 7, 1, 5],
    winCondition: { mode: "clear_lines", n: 3 },
    hintBlocks: [[-2, 0], [-1, 0], [0, 0], [1, 0]],
  },
  {
    id: 9,
    name: "Crystal Fortress",
    difficulty: "hard",
    description: "Crystal walls form a fortress. Tear it down — but don't touch the crafting table.",
    layout: [
      [-1, 0, -1, 7], [0, 0, -1, 7], [1, 0, -1, 7],
      [-1, 0, 1, 7], [0, 0, 1, 7], [1, 0, 1, 7],
      [-1, 1, -1, 7], [1, 1, -1, 7],
      [-1, 1, 1, 7], [1, 1, 1, 7],
    ],
    pieces: [1, 5, 3, 7, 2, 6, 4, 1, 5, 3, 7, 2, 6, 4],
    winCondition: { mode: "no_craft" },
    hintBlocks: [[-1, 0], [0, 0], [1, 0]],
  },
  {
    id: 10,
    name: "The Colossus",
    difficulty: "hard",
    description: "Stone pillars, a gold crown, a crystal capstone. Score 500 points in 2 minutes.",
    layout: [
      [-2, 0, 0, 2], [-2, 1, 0, 2], [-2, 2, 0, 2], [-2, 3, 0, 2],
      [2, 0, 0, 2], [2, 1, 0, 2], [2, 2, 0, 2], [2, 3, 0, 2],
      [-1, 4, 0, 3], [0, 4, 0, 3], [1, 4, 0, 3],
      [0, 5, 0, 7],
    ],
    pieces: [4, 6, 2, 7, 1, 5, 3, 4, 6, 2, 7, 1, 5, 3, 4, 6],
    winCondition: { mode: "timed_score", scoreTarget: 500, timeLimit: 120 },
    hintBlocks: [[-2, 0], [-1, 0], [0, 0]],
  },

  // ── Easy tier continued ───────────────────────────────────────────────────────
  {
    id: 16,
    name: "Lone Wolf",
    difficulty: "easy",
    description: "A single stone block stands alone. Mine it to move on.",
    layout: [[0, 0, 0, 2]],
    pieces: [4, 1, 2, 3, 7],
    hintBlocks: [[-1, 0], [0, 0]],
  },
  {
    id: 17,
    name: "Gold Speck",
    difficulty: "easy",
    description: "One gold block — it won't take long.",
    layout: [[0, 0, 0, 3]],
    pieces: [2, 4, 1, 3, 5],
    hintBlocks: [[0, 0], [1, 0]],
  },
  {
    id: 18,
    name: "Neighbors",
    difficulty: "easy",
    description: "Two stone blocks side by side. Take them both out.",
    layout: [[-1, 0, 0, 2], [1, 0, 0, 2]],
    pieces: [3, 1, 4, 2, 5, 7],
    hintBlocks: [[-1, 0], [0, 0], [1, 0]],
  },
  {
    id: 19,
    name: "Short Stack",
    difficulty: "easy",
    description: "Three blocks stacked in a column. Reach the top.",
    layout: [[0, 0, 0, 2], [0, 1, 0, 2], [0, 2, 0, 2]],
    pieces: [4, 1, 3, 5, 2, 7, 6],
    hintBlocks: [[-1, 0], [0, 0], [1, 0]],
  },
  {
    id: 20,
    name: "Flat Four",
    difficulty: "easy",
    description: "Four stone blocks in a row at ground level. Clear them all.",
    layout: [[-1, 0, 0, 2], [0, 0, 0, 2], [1, 0, 0, 2], [2, 0, 0, 2]],
    pieces: [4, 4, 2, 1, 3, 5],
    hintBlocks: [[-1, 0], [0, 0], [1, 0], [2, 0]],
  },
  {
    id: 21,
    name: "Ice Row",
    difficulty: "easy",
    description: "Three ice blocks in a row — they shatter in one hit each.",
    layout: [[-1, 0, 0, 4], [0, 0, 0, 4], [1, 0, 0, 4]],
    pieces: [1, 3, 5, 2, 4, 7],
    hintBlocks: [[-1, 0], [0, 0], [1, 0]],
  },
  {
    id: 22,
    name: "Corner Step",
    difficulty: "easy",
    description: "Three stone blocks forming an L. Mine around the bend.",
    layout: [[-1, 0, 0, 2], [0, 0, 0, 2], [0, 1, 0, 2]],
    pieces: [7, 4, 1, 2, 3, 5],
    hintBlocks: [[-1, 0], [0, 0]],
  },

  // ── Medium tier continued ─────────────────────────────────────────────────────
  {
    id: 11,
    name: "The Bridge",
    difficulty: "medium",
    description: "Two stone pillars flank a 4-block gap. Bridge it with L and T pieces to clear 3 lines.",
    layout: [
      [-3, 0, 0, 2], [-2, 0, 0, 2], [1, 0, 0, 2], [2, 0, 0, 2],
      [-3, 1, 0, 2], [-2, 1, 0, 2], [1, 1, 0, 2], [2, 1, 0, 2],
      [-3, 2, 0, 2], [-2, 2, 0, 2], [1, 2, 0, 2], [2, 2, 0, 2],
    ],
    pieces: [7, 1, 7, 1, 7, 1, 7, 1, 7, 1, 7, 1, 7, 1, 7, 1],
    winCondition: { mode: "clear_lines", n: 3 },
    hintBlocks: [[-1, 0], [0, 0], [1, 0]],
  },
  {
    id: 13,
    name: "Gold Rush",
    difficulty: "medium",
    description: "Gold ore fills the field. Clear 5 lines using only square gold pieces.",
    layout: [
      [-2, 0, 0, 3], [0, 0, 0, 3], [2, 0, 0, 3],
      [-2, 1, 0, 3], [0, 1, 0, 3], [2, 1, 0, 3],
      [-2, 2, 0, 3], [0, 2, 0, 3], [2, 2, 0, 3],
      [-2, 3, 0, 3], [0, 3, 0, 3], [2, 3, 0, 3],
      [-2, 4, 0, 3], [0, 4, 0, 3], [2, 4, 0, 3],
    ],
    pieces: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    winCondition: { mode: "clear_lines", n: 5 },
    hintBlocks: [[-2, 0], [-1, 0], [0, 0]],
  },
  {
    id: 23,
    name: "Tall Tower",
    difficulty: "medium",
    description: "A six-block stone column. Stack pieces alongside it to reach the summit.",
    layout: [
      [0, 0, 0, 2], [0, 1, 0, 2], [0, 2, 0, 2],
      [0, 3, 0, 2], [0, 4, 0, 2], [0, 5, 0, 2],
    ],
    pieces: [1, 6, 4, 3, 5, 2, 7, 1, 4],
    hintBlocks: [[-1, 0], [0, 0], [1, 0]],
  },
  {
    id: 24,
    name: "Gold Cluster",
    difficulty: "medium",
    description: "Six gold blocks form a 2×3 wall. Mine them all before pieces run out.",
    layout: [
      [-1, 0, 0, 3], [0, 0, 0, 3], [1, 0, 0, 3],
      [-1, 1, 0, 3], [0, 1, 0, 3], [1, 1, 0, 3],
    ],
    pieces: [3, 3, 4, 2, 7, 1, 5, 6],
    hintBlocks: [[-1, 0], [0, 0], [1, 0]],
  },
  {
    id: 25,
    name: "Crystal Trio",
    difficulty: "medium",
    description: "Three crystals at varying heights. Stack smartly to reach each one.",
    layout: [[-2, 0, 0, 7], [0, 2, 0, 7], [2, 0, 0, 7]],
    pieces: [4, 2, 1, 5, 7, 3, 4, 6, 1],
    hintBlocks: [[-2, 0], [-1, 0], [0, 0]],
  },
  {
    id: 26,
    name: "Lava Pillars",
    difficulty: "medium",
    description: "Two twin lava pillars. Mine them before the heat gets you.",
    layout: [
      [-2, 0, 0, 6], [-2, 1, 0, 6],
      [2, 0, 0, 6], [2, 1, 0, 6],
    ],
    pieces: [5, 7, 1, 4, 2, 3, 6, 5],
    hintBlocks: [[-2, 0], [-1, 0]],
  },

  // ── Hard tier continued ───────────────────────────────────────────────────────
  {
    id: 12,
    name: "Tetris Tower",
    difficulty: "hard",
    description: "Stack I-pieces to reach height 15 without clearing a single line. Every clear is failure.",
    layout: [],
    pieces: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    winCondition: { mode: "reach_height", targetHeight: 14 },
    hintBlocks: [[-2, 0], [-1, 0], [0, 0], [1, 0]],
  },
  {
    id: 14,
    name: "The Squeeze",
    difficulty: "hard",
    description: "Stone walls close in, leaving a narrow channel. Survive the squeeze — clear 8 lines.",
    layout: [
      [-4, 0, 0, 2], [-3, 0, 0, 2], [-2, 0, 0, 2], [1, 0, 0, 2], [2, 0, 0, 2], [3, 0, 0, 2],
      [-4, 1, 0, 2], [-3, 1, 0, 2], [-2, 1, 0, 2], [1, 1, 0, 2], [2, 1, 0, 2], [3, 1, 0, 2],
      [-4, 2, 0, 2], [-3, 2, 0, 2], [-2, 2, 0, 2], [1, 2, 0, 2], [2, 2, 0, 2], [3, 2, 0, 2],
      [-4, 3, 0, 2], [-3, 3, 0, 2], [-2, 3, 0, 2], [1, 3, 0, 2], [2, 3, 0, 2], [3, 3, 0, 2],
      [-4, 4, 0, 2], [-3, 4, 0, 2], [-2, 4, 0, 2], [1, 4, 0, 2], [2, 4, 0, 2], [3, 4, 0, 2],
    ],
    pieces: [4, 2, 1, 7, 4, 2, 1, 7, 4, 2, 1, 7, 4, 2, 1, 7, 4, 2, 1, 7],
    winCondition: { mode: "clear_lines", n: 8 },
    hintBlocks: [[-1, 0], [0, 0], [1, 0]],
  },
  {
    id: 15,
    name: "Obsidian Gauntlet",
    difficulty: "hard",
    description: "Obsidian blocks stand scattered — each takes 8 hits to break. Endure and clear them all.",
    layout: [
      [-2, 0, 0, 15], [0, 0, 0, 15], [2, 0, 0, 15],
      [-1, 1, 0, 15], [1, 1, 0, 15],
      [-2, 2, 0, 15], [0, 2, 0, 15], [2, 2, 0, 15],
      [-1, 3, 0, 15], [1, 3, 0, 15],
      [0, 4, 0, 15],
    ],
    pieces: [1, 5, 2, 7, 3, 4, 6, 1, 5, 2, 7, 3, 4, 6, 1, 5, 2, 7, 3, 4, 6],
    hintBlocks: [[-2, 0], [-1, 0], [0, 0]],
  },
  {
    id: 27,
    name: "Stone Pyramid",
    difficulty: "hard",
    description: "A full pyramid of stone crowned with gold. Mine it all from base to peak.",
    layout: [
      [-3, 0, 0, 2], [-2, 0, 0, 2], [-1, 0, 0, 2], [0, 0, 0, 2], [1, 0, 0, 2], [2, 0, 0, 2], [3, 0, 0, 2],
      [-2, 1, 0, 2], [-1, 1, 0, 2], [0, 1, 0, 2], [1, 1, 0, 2], [2, 1, 0, 2],
      [-1, 2, 0, 2], [0, 2, 0, 2], [1, 2, 0, 2],
      [0, 3, 0, 3],
    ],
    pieces: [4, 2, 7, 5, 1, 3, 6, 4, 2, 7, 5, 1, 3, 6, 4, 2],
    hintBlocks: [[-3, 0], [-2, 0], [-1, 0], [0, 0]],
  },
  {
    id: 28,
    name: "Score Chase",
    difficulty: "hard",
    description: "High-value ore scattered across the field. Score 600 points in 2 minutes.",
    layout: [
      [-2, 0, 0, 3], [0, 0, 0, 7], [2, 0, 0, 3],
      [-1, 1, 0, 7], [1, 1, 0, 7],
      [0, 2, 0, 3],
    ],
    pieces: [4, 2, 7, 5, 1, 3, 6, 4, 2, 7, 5, 1, 3, 6, 4, 2, 7, 5, 1],
    winCondition: { mode: "timed_score", scoreTarget: 600, timeLimit: 120 },
    hintBlocks: [[-2, 0], [-1, 0], [0, 0]],
  },
  {
    id: 29,
    name: "Crystal Cascade",
    difficulty: "hard",
    description: "Crystals staircase upward — each step higher than the last.",
    layout: [
      [-3, 0, 0, 7], [-2, 1, 0, 7], [-1, 2, 0, 7],
      [0, 3, 0, 7], [1, 4, 0, 7], [2, 5, 0, 7], [3, 6, 0, 7],
    ],
    pieces: [1, 4, 2, 5, 3, 7, 6, 1, 4, 2, 5, 3, 7, 6],
    hintBlocks: [[-3, 0], [-2, 0], [-1, 0], [0, 0]],
  },
  {
    id: 30,
    name: "Final Trial",
    difficulty: "hard",
    description: "Stone walls flank an open channel. Fill 10 complete lines to win.",
    layout: [
      [-4, 0, 0, 2], [-3, 0, 0, 2], [-2, 0, 0, 2], [2, 0, 0, 2], [3, 0, 0, 2], [4, 0, 0, 2],
      [-4, 1, 0, 2], [-3, 1, 0, 2], [3, 1, 0, 2], [4, 1, 0, 2],
      [-4, 2, 0, 2], [-3, 2, 0, 7], [3, 2, 0, 7], [4, 2, 0, 2],
      [-4, 3, 0, 2], [4, 3, 0, 2],
    ],
    pieces: [4, 4, 4, 1, 1, 2, 7, 5, 3, 4, 4, 4, 1, 1, 2, 7, 5, 3, 4, 4, 4, 1, 1, 2, 7, 5],
    winCondition: { mode: "clear_lines", n: 10 },
    hintBlocks: [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0]],
  },
];

// ── Progress persistence ───────────────────────────────────────────────────────

// Fail count storage — tracks how many times each puzzle has been failed.
const PUZZLE_FAIL_KEY = "mineCtris_puzzleFailCounts";

function _loadPuzzleFailCounts() {
  try { return JSON.parse(localStorage.getItem(PUZZLE_FAIL_KEY)) || {}; } catch (_) { return {}; }
}

/** Return number of failed attempts for a puzzle (0 if never failed). */
function getPuzzleFailCount(puzzleId) {
  return (_loadPuzzleFailCounts()[puzzleId] || 0);
}

/** Increment the fail count for a puzzle by 1. */
function incPuzzleFailCount(puzzleId) {
  const counts = _loadPuzzleFailCounts();
  counts[puzzleId] = (counts[puzzleId] || 0) + 1;
  try { localStorage.setItem(PUZZLE_FAIL_KEY, JSON.stringify(counts)); } catch (_) {}
}

/** Reset fail count for a puzzle (called on win). */
function resetPuzzleFailCount(puzzleId) {
  const counts = _loadPuzzleFailCounts();
  counts[puzzleId] = 0;
  try { localStorage.setItem(PUZZLE_FAIL_KEY, JSON.stringify(counts)); } catch (_) {}
}

/** Return true if the hint ghost should be shown for this puzzle (≥3 fails). */
function shouldShowPuzzleHint(puzzleId) {
  return getPuzzleFailCount(puzzleId) >= 3;
}

/** Load all puzzle progress from localStorage. Returns { [puzzleId]: { stars, date } }. */
function loadPuzzleProgress() {
  try {
    const raw = localStorage.getItem(PUZZLE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

/** Save stars for a puzzle if it beats the existing record. Returns true if new best. */
function savePuzzleStars(puzzleId, stars) {
  const progress = loadPuzzleProgress();
  const existing = progress[puzzleId] || {};
  if ((existing.stars || 0) < stars) {
    progress[puzzleId] = { stars, date: new Date().toISOString().slice(0, 10) };
    try { localStorage.setItem(PUZZLE_STORAGE_KEY, JSON.stringify(progress)); } catch (_) {}
    return true;
  }
  return false;
}

/** Get best star rating for a puzzle (0 = never completed). */
function getPuzzleStars(puzzleId) {
  const progress = loadPuzzleProgress();
  return (progress[puzzleId] || {}).stars || 0;
}

/** Count completed puzzles (≥1 star) in the given difficulty tier. */
function countCompletedByDiff(diff) {
  const progress = loadPuzzleProgress();
  return PUZZLES.filter(function (p) {
    return p.difficulty === diff && (progress[p.id] || {}).stars >= 1;
  }).length;
}

/**
 * Unlock rules (per difficulty tier, sorted by puzzle id within tier):
 *  - easy:   first is always unlocked; each subsequent needs previous easy solved.
 *  - medium: first needs 5 easy solved; each subsequent needs previous medium solved.
 *  - hard:   first needs 5 medium solved; each subsequent needs previous hard solved.
 */
function isPuzzleUnlocked(puzzleId) {
  const puzzle = getPuzzleById(puzzleId);
  if (!puzzle) return false;
  const diff = puzzle.difficulty;
  const tier = PUZZLES.filter(function (p) { return p.difficulty === diff; })
                      .sort(function (a, b) { return a.id - b.id; });
  const idx = tier.findIndex(function (p) { return p.id === puzzleId; });
  if (idx <= 0) {
    if (diff === "easy") return true;
    if (diff === "medium") return countCompletedByDiff("easy") >= 5;
    if (diff === "hard") return countCompletedByDiff("medium") >= 5;
    return false;
  }
  return getPuzzleStars(tier[idx - 1].id) >= 1;
}

/** Count how many puzzles have been completed (≥1 star). */
function countCompletedPuzzles() {
  const progress = loadPuzzleProgress();
  return Object.keys(progress).filter(id => (progress[id].stars || 0) >= 1).length;
}

/** Count how many puzzles have 3 stars. */
function countThreeStarPuzzles() {
  const progress = loadPuzzleProgress();
  return Object.keys(progress).filter(id => (progress[id].stars || 0) >= 3).length;
}

/** @deprecated Legacy helpers kept for external call-sites. */
function countCompletedPack1() { return countCompletedByDiff("easy"); }
function countCompletedPack2() { return countCompletedByDiff("medium"); }

// ── Runtime state ─────────────────────────────────────────────────────────────
// These track the current puzzle session; reset in resetPuzzleState().

let _puzzlePresetBlocks = [];   // Array of THREE.Mesh refs that are puzzle presets
let _puzzleInitialCount = 0;    // Total preset blocks at puzzle start
let _puzzleIsFirstAttempt = true; // Cleared if player has attempted this puzzle before
let _puzzlePiecesUsed = 0;      // Count of pieces consumed so far this session
let _thinkModeActive = false;   // True while think-mode key is held
let _puzzleNoCraftViolated = false; // True if player crafted during a no_craft puzzle
let _puzzleTimeLimitSecs = 0;       // Time limit for timed_score puzzles (0 = no limit)
let _puzzleTimeElapsed = 0;         // Seconds elapsed for timed_score puzzles

// ── Hint ghost state ──────────────────────────────────────────────────────────
let _hintGhostMeshes = [];  // Transparent hint block meshes shown after 3 fails

/**
 * Remove all hint ghost meshes from the scene and dispose their resources.
 * Safe to call even if no hint is active.
 */
function clearPuzzleHintGhost() {
  _hintGhostMeshes.forEach(function (m) {
    if (typeof worldGroup !== "undefined" && worldGroup) worldGroup.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  });
  _hintGhostMeshes = [];
}

/**
 * Place semi-transparent hint blocks in the world showing where to land the first piece.
 * Called from setupPuzzleLayout() when shouldShowPuzzleHint() is true.
 * Requires THREE.js, worldGroup, gridOccupancy to be available.
 */
function setupPuzzleHintGhost() {
  clearPuzzleHintGhost();
  if (!shouldShowPuzzleHint(puzzlePuzzleId)) return;
  const puzzle = getPuzzleById(puzzlePuzzleId);
  if (!puzzle || !puzzle.hintBlocks || puzzle.hintBlocks.length === 0) return;
  if (typeof THREE === "undefined" || typeof worldGroup === "undefined" || !worldGroup) return;

  const geo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  puzzle.hintBlocks.forEach(function (hb) {
    const hx = hb[0], hz = hb[1];
    // Find landing Y: the first unoccupied Y above the highest occupied cell at this x,z
    let landY = 0;
    if (typeof gridOccupancy !== "undefined") {
      for (let y = WORLD_SIZE - 1; y >= 0; y--) {
        const row = gridOccupancy.get(y);
        if (row && row.has(hx + "," + hz)) { landY = y + 1; break; }
      }
    }
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.38,
      emissive: new THREE.Color(0xffff66),
      emissiveIntensity: 0.6,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(hx, landY + 0.5, hz);
    mesh.name = "puzzle_hint_ghost";
    worldGroup.add(mesh);
    _hintGhostMeshes.push(mesh);
  });
}

function resetPuzzleState() {
  _puzzlePresetBlocks = [];
  _puzzleInitialCount = 0;
  _puzzlePiecesUsed = 0;
  _thinkModeActive = false;
  _puzzleNoCraftViolated = false;
  _puzzleTimeLimitSecs = 0;
  _puzzleTimeElapsed = 0;
  clearPuzzleHintGhost();
}

// ── Piece queue for puzzle mode ────────────────────────────────────────────────

/** Remaining pieces in the current puzzle's fixed queue (populated on puzzle start). */
let puzzleFixedQueue = [];

/** Populate puzzleFixedQueue from the puzzle's piece list and init the visible queue. */
function initPuzzlePieceQueue() {
  const puzzle = getPuzzleById(puzzlePuzzleId);
  if (!puzzle) return;
  puzzleFixedQueue = puzzle.pieces.slice(); // copy
  // Seed pieceQueue (visible preview) from the front of the fixed queue
  pieceQueue.length = 0;
  const previewCount = Math.min(NEXT_QUEUE_SIZE, puzzleFixedQueue.length);
  for (let i = 0; i < previewCount; i++) {
    const idx = puzzleFixedQueue[i];
    pieceQueue.push({ index: idx, shape: SHAPES[idx] });
  }
  updateNextPiecesHUD();
}

/** Initialize win-condition state for the current built-in puzzle (call after resetPuzzleState). */
function initPuzzleWinCondition() {
  const puzzle = getPuzzleById(puzzlePuzzleId);
  const wc = puzzle && puzzle.winCondition;
  _puzzleTimeLimitSecs = (wc && wc.mode === "timed_score") ? wc.timeLimit : 0;
  _puzzleTimeElapsed = 0;
  _puzzleNoCraftViolated = false;
}

/** Draw the next piece from puzzleFixedQueue. Returns { index, shape } or null if empty. */
function drawPuzzlePiece() {
  if (puzzleFixedQueue.length === 0) return null;
  _puzzlePiecesUsed++;
  // Clear hint ghost as soon as the first piece is drawn (hint served its purpose)
  if (_puzzlePiecesUsed === 1) clearPuzzleHintGhost();
  const idx = puzzleFixedQueue.shift();
  // Rebuild preview from remaining fixed queue
  pieceQueue.length = 0;
  const previewCount = Math.min(NEXT_QUEUE_SIZE, puzzleFixedQueue.length);
  for (let i = 0; i < previewCount; i++) {
    const qIdx = puzzleFixedQueue[i];
    pieceQueue.push({ index: qIdx, shape: SHAPES[qIdx] });
  }
  updateNextPiecesHUD();
  return { index: idx, shape: SHAPES[idx] };
}

// ── Custom puzzle piece sequence queue ────────────────────────────────────────

/** Internal looping cursor for the custom puzzle fixed sequence. */
let _customPieceSeqIndex = 0;

/**
 * Initialise the piece queue for a custom puzzle based on customPieceSequence.
 * In "fixed" mode: seeds pieceQueue from the sequence (looping).
 * In "random" mode: does nothing — spawnFallingPiece falls through to random logic.
 */
function initCustomPuzzlePieceQueue() {
  _customPieceSeqIndex = 0;
  if (typeof customPieceSequence === "undefined" || customPieceSequence.mode !== "fixed") return;
  const seq = customPieceSequence.pieces;
  if (!seq || seq.length === 0) return;
  // Seed visible preview queue from beginning of fixed sequence
  pieceQueue.length = 0;
  const previewCount = Math.min(NEXT_QUEUE_SIZE, seq.length);
  for (let i = 0; i < previewCount; i++) {
    const idx = seq[i % seq.length];
    pieceQueue.push({ index: idx, shape: SHAPES[idx] });
  }
  updateNextPiecesHUD();
}

/**
 * Draw the next piece from the custom puzzle fixed sequence (looping).
 * Returns { index, shape } or null if sequence is empty / mode is random.
 */
function drawCustomPuzzlePiece() {
  if (typeof customPieceSequence === "undefined" || customPieceSequence.mode !== "fixed") return null;
  const seq = customPieceSequence.pieces;
  if (!seq || seq.length === 0) return null;
  const idx = seq[_customPieceSeqIndex % seq.length];
  _customPieceSeqIndex++;
  // Rebuild preview: next NEXT_QUEUE_SIZE pieces in the looping sequence
  pieceQueue.length = 0;
  for (let i = 0; i < NEXT_QUEUE_SIZE; i++) {
    const pi = seq[(_customPieceSeqIndex + i) % seq.length];
    pieceQueue.push({ index: pi, shape: SHAPES[pi] });
  }
  updateNextPiecesHUD();
  return { index: idx, shape: SHAPES[idx] };
}

// ── Preset block setup ─────────────────────────────────────────────────────────

function getPuzzleById(id) {
  return PUZZLES.find(p => p.id === id) || null;
}

// Map colorIndex (1-15) to material type string (used for mining behavior)
const _PUZZLE_COLOR_TO_MAT = {
  1: "dirt",
  2: "stone",
  3: "gold",
  4: "ice",
  5: "moss",
  6: "lava",
  7: "crystal",
  8: "diamond",
  15: "obsidian",
};

/**
 * Place all preset blocks for the given puzzle into the world.
 * Must be called after the scene is ready (worldGroup exists).
 */
function setupPuzzleLayout() {
  const puzzle = getPuzzleById(puzzlePuzzleId);
  if (!puzzle) return;

  _puzzlePresetBlocks = [];

  puzzle.layout.forEach(([x, yLevel, z, colorIndex]) => {
    const color = COLORS[colorIndex];
    const block = createBlockMesh(color);
    block.name = "landed_block";

    // Tag as puzzle preset for win-condition tracking
    block.userData.isPuzzlePreset = true;
    block.userData.materialType = _PUZZLE_COLOR_TO_MAT[colorIndex] || "stone";

    // Mining clicks from BLOCK_TYPES
    const matInfo = BLOCK_TYPES[block.userData.materialType];
    block.userData.miningClicks = matInfo ? matInfo.hits : MINING_CLICKS_NEEDED;

    // Place in world
    block.position.set(x, yLevel + 0.5, z);
    worldGroup.add(block);
    registerBlock(block);

    _puzzlePresetBlocks.push(block);
  });

  _puzzleInitialCount = _puzzlePresetBlocks.length;

  // Check if this is the first attempt (no stars recorded yet)
  const progress = loadPuzzleProgress();
  _puzzleIsFirstAttempt = !progress[puzzlePuzzleId];

  // Show hint ghost after 3 failed attempts (placed after preset blocks so landing Y is correct)
  setupPuzzleHintGhost();
}

// ── Custom puzzle layout setup ────────────────────────────────────────────────

/**
 * Place preset blocks from customPuzzleLayout into the world.
 * Used when entering a test play of an editor-built puzzle.
 */
function setupCustomPuzzleLayout() {
  _puzzlePresetBlocks = [];

  if (!Array.isArray(customPuzzleLayout)) return;

  customPuzzleLayout.forEach(function (b) {
    // Determine palette index from color hex for material type lookup
    var hexInt = 0;
    if (b.color) {
      hexInt = parseInt(b.color.replace("#", ""), 16);
    }
    var paletteIdx = 1; // default stone
    if (typeof EDITOR_PALETTE !== "undefined") {
      for (var i = 0; i < EDITOR_PALETTE.length; i++) {
        if (EDITOR_PALETTE[i].hex === hexInt) { paletteIdx = i; break; }
      }
    }
    // Map palette idx to COLORS index (EDITOR_PALETTE order matches colorIndex 1-9)
    var colorIndex = paletteIdx + 1;
    var color = COLORS[colorIndex] || COLORS[2];

    var block = createBlockMesh(color);
    block.name = "landed_block";
    block.userData.isPuzzlePreset = true;
    var matName = _PUZZLE_COLOR_TO_MAT[colorIndex] || "stone";
    block.userData.materialType = matName;
    var matInfo = BLOCK_TYPES[matName];
    block.userData.miningClicks = matInfo ? matInfo.hits : MINING_CLICKS_NEEDED;
    block.position.set(b.x, b.y, b.z);
    worldGroup.add(block);
    registerBlock(block);
    _puzzlePresetBlocks.push(block);
  });

  _puzzleInitialCount = _puzzlePresetBlocks.length;
  _puzzleIsFirstAttempt = true;
}

// ── Win / lose detection ───────────────────────────────────────────────────────

/**
 * Count how many preset blocks are still in the world (not yet mined/cleared).
 * A block is considered gone when its gridPos is null (unregistered).
 */
function countRemainingPresetBlocks() {
  return _puzzlePresetBlocks.filter(b => b.userData.gridPos !== null && worldGroup.children.includes(b)).length;
}

/** Return the highest y-level (0-indexed) among all landed blocks in the world. */
function _getMaxBlockHeight() {
  let maxY = -1;
  if (!worldGroup) return maxY;
  worldGroup.children.forEach(function (child) {
    if (child.name === "landed_block" && child.position) {
      const yLevel = Math.round(child.position.y - 0.5);
      if (yLevel > maxY) maxY = yLevel;
    }
  });
  return maxY;
}

/**
 * Check win/lose conditions. Call after each piece lands or block is mined.
 * Handles both built-in puzzle mode and editor custom puzzle mode.
 */
function checkPuzzleConditions() {
  if (isGameOver) return;

  // ── Custom puzzle mode ────────────────────────────────────────────────────
  if (isCustomPuzzleMode && customPuzzleWinCondition) {
    const wc = customPuzzleWinCondition;
    let won = false;
    if (wc.mode === "mine_all") {
      won = countRemainingPresetBlocks() === 0 && _puzzleInitialCount > 0;
    } else if (wc.mode === "clear_lines") {
      won = linesCleared >= wc.n;
    } else if (wc.mode === "survive_seconds") {
      won = gameElapsedSeconds >= wc.n;
    } else if (wc.mode === "score_points") {
      won = score >= wc.n;
    }
    if (won) _triggerCustomPuzzleWin();
    return;
  }

  // ── Built-in puzzle mode ──────────────────────────────────────────────────
  if (!isPuzzleMode) return;

  const puzzle = getPuzzleById(puzzlePuzzleId);
  const wc = (puzzle && puzzle.winCondition) ? puzzle.winCondition : { mode: "mine_all" };

  if (wc.mode === "mine_all") {
    const remaining = countRemainingPresetBlocks();
    if (remaining === 0 && _puzzleInitialCount > 0) {
      _triggerPuzzleWin();
      return;
    }
    if (puzzleFixedQueue.length === 0 && pieceQueue.length === 0 && fallingPieces.length === 0) {
      _triggerPuzzleLose();
    }

  } else if (wc.mode === "clear_lines") {
    if (linesCleared >= wc.n) {
      _triggerPuzzleWin();
      return;
    }
    if (puzzleFixedQueue.length === 0 && pieceQueue.length === 0 && fallingPieces.length === 0) {
      _triggerPuzzleLose();
    }

  } else if (wc.mode === "no_craft") {
    const remaining = countRemainingPresetBlocks();
    if (remaining === 0 && _puzzleInitialCount > 0) {
      if (_puzzleNoCraftViolated) {
        _triggerPuzzleLose();
      } else {
        _triggerPuzzleWin();
      }
      return;
    }
    if (puzzleFixedQueue.length === 0 && pieceQueue.length === 0 && fallingPieces.length === 0) {
      _triggerPuzzleLose();
    }

  } else if (wc.mode === "timed_score") {
    if (score >= wc.scoreTarget) {
      _triggerPuzzleWin();
      return;
    }
    const timeLeft = _puzzleTimeLimitSecs - _puzzleTimeElapsed;
    if (timeLeft <= 0) {
      _triggerPuzzleLose();
    }

  } else if (wc.mode === "reach_height") {
    if (linesCleared > 0) {
      _triggerPuzzleLose("line_cleared");
      return;
    }
    if (_getMaxBlockHeight() >= wc.targetHeight) {
      _triggerPuzzleWin();
      return;
    }
    if (puzzleFixedQueue.length === 0 && pieceQueue.length === 0 && fallingPieces.length === 0) {
      _triggerPuzzleLose();
    }
  }
}


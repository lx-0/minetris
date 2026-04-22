// Training Mode — scenario manager, board editor, undo/redo, guidance overlay, progress tracking.
// Requires: state.js, config.js (SHAPES, COLORS, BLOCK_TYPES, PIECE_NAMES),
//           world.js (createBlockMesh, registerBlock),
//           gamestate.js (updateScoreHUD), gamestate-reset.js (resetGame)

const TRAINING_STORAGE_KEY = 'mineCtris_trainingProgress';
const TRAINING_CUSTOM_KEY  = 'mineCtris_trainingCustomBoards';

// ── Category display info ────────────────────────────────────────────────────
const TRAINING_CATEGORIES = {
  tspin:    { label: 'T-Spin',       icon: '🔄', color: '#e060ff' },
  combo:    { label: 'Combos',       icon: '🔥', color: '#ff8c00' },
  speed:    { label: 'Speed Drill',  icon: '⚡', color: '#ffe040' },
  garbage:  { label: 'Garbage',      icon: '🗑️', color: '#60c8ff' },
  perfect:  { label: 'Perfect Clear',icon: '💎', color: '#50ffb0' },
};

// ── Scenario definitions ─────────────────────────────────────────────────────
// layout: [[x, yLevel, z, colorIndex], ...]   yLevel 0 → world Y=0.5
// pieces: forced piece queue (indices from SHAPES; repeats indefinitely)
// goalType: 'tspin_triple'|'tspin_double'|'combo'|'ppm'|'garbage_clear'|'perfect_clear'
// goalValue: numeric threshold (combo count, PPM target, etc.)
// guidanceNote: short string shown to player as hint
const TRAINING_SCENARIOS = [
  // ── T-Spin ──────────────────────────────────────────────────────────────
  {
    id: 'ts_triple',
    category: 'tspin',
    name: 'T-Spin Triple',
    description: 'Classic TSD setup. The T-piece fits perfectly in the slot for a 3-line spin.',
    goalType: 'tspin_triple',
    goalValue: 1,
    guidanceNote: 'Rotate the T-piece and drop it into the notch on the right.',
    // Board: columns filled except a T-shaped gap on right side, 3 rows
    layout: [
      // Row 0 — gap at x=1 only (the T notch bottom)
      [-4,0,0,2],[-3,0,0,2],[-2,0,0,2],[-1,0,0,2],[0,0,0,2],[2,0,0,2],[3,0,0,2],[4,0,0,2],
      // Row 1 — gap at x=0,1,2 (T body)
      [-4,1,0,2],[-3,1,0,2],[-2,1,0,2],[-1,1,0,2],[3,1,0,2],[4,1,0,2],
      // Row 2 — gap at x=1 only (T notch top)
      [-4,2,0,2],[-3,2,0,2],[-2,2,0,2],[-1,2,0,2],[0,2,0,2],[2,2,0,2],[3,2,0,2],[4,2,0,2],
    ],
    pieces: [1, 4, 3, 2, 5, 7, 1, 6, 4, 1],
  },
  {
    id: 'ts_double',
    category: 'tspin',
    name: 'T-Spin Double',
    description: 'A 2-line T-spin setup. Slide the T into the notch for a double clear.',
    goalType: 'tspin_double',
    goalValue: 1,
    guidanceNote: 'Drop the T-piece into the right-side slot — it should spin into 2 rows.',
    layout: [
      [-4,0,0,2],[-3,0,0,2],[-2,0,0,2],[-1,0,0,2],[0,0,0,2],[2,0,0,2],[3,0,0,2],[4,0,0,2],
      [-4,1,0,2],[-3,1,0,2],[-2,1,0,2],[-1,1,0,2],[3,1,0,2],[4,1,0,2],
    ],
    pieces: [1, 3, 4, 2, 7, 5, 6, 1, 4, 3],
  },
  {
    id: 'ts_mini',
    category: 'tspin',
    name: 'T-Spin Mini',
    description: 'Practice the mini T-spin. Small gap, one-line clear.',
    goalType: 'tspin_mini',
    goalValue: 1,
    guidanceNote: 'Tuck the T-piece into the corner notch at the edge.',
    layout: [
      [-4,0,0,2],[-3,0,0,2],[-2,0,0,2],[-1,0,0,2],[0,0,0,2],[1,0,0,2],[2,0,0,2],
      [-4,1,0,2],[-3,1,0,2],[-2,1,0,2],[-1,1,0,2],[0,1,0,2],[1,1,0,2],[2,1,0,2],[3,1,0,2],
    ],
    pieces: [1, 5, 3, 7, 2, 4, 6, 1, 3, 5],
  },

  // ── Combo ───────────────────────────────────────────────────────────────
  {
    id: 'combo_4',
    category: 'combo',
    name: '4-Combo Chain',
    description: 'Keep clearing lines back-to-back to build a 4-combo.',
    goalType: 'combo',
    goalValue: 4,
    guidanceNote: 'Clear one line at a time — each clear extends the combo.',
    layout: [
      [-4,0,0,2],[-3,0,0,2],[-2,0,0,2],[-1,0,0,2],[0,0,0,2],[1,0,0,2],[2,0,0,2],[3,0,0,2],
      [-4,1,0,2],[-3,1,0,2],[-2,1,0,2],[-1,1,0,2],[0,1,0,2],[1,1,0,2],[2,1,0,2],[3,1,0,2],
      [-4,2,0,2],[-3,2,0,2],[-2,2,0,2],[-1,2,0,2],[0,2,0,2],[1,2,0,2],[2,2,0,2],[3,2,0,2],
      [-4,3,0,2],[-3,3,0,2],[-2,3,0,2],[-1,3,0,2],[0,3,0,2],[1,3,0,2],[2,3,0,2],[3,3,0,2],
    ],
    pieces: [4, 4, 4, 4, 4, 4, 4, 4, 3, 2, 1],
  },
  {
    id: 'combo_b2b',
    category: 'combo',
    name: 'Back-to-Back Tetris',
    description: 'Clear two Tetrises in a row for the B2B bonus.',
    goalType: 'b2b',
    goalValue: 1,
    guidanceNote: 'Drop I-pieces to clear 4 lines, then do it again immediately.',
    layout: [
      [-4,0,0,2],[-3,0,0,2],[-2,0,0,2],[-1,0,0,2],[0,0,0,2],[1,0,0,2],[2,0,0,2],[3,0,0,2],
      [-4,1,0,2],[-3,1,0,2],[-2,1,0,2],[-1,1,0,2],[0,1,0,2],[1,1,0,2],[2,1,0,2],[3,1,0,2],
      [-4,2,0,2],[-3,2,0,2],[-2,2,0,2],[-1,2,0,2],[0,2,0,2],[1,2,0,2],[2,2,0,2],[3,2,0,2],
      [-4,3,0,2],[-3,3,0,2],[-2,3,0,2],[-1,3,0,2],[0,3,0,2],[1,3,0,2],[2,3,0,2],[3,3,0,2],
      [-4,4,0,2],[-3,4,0,2],[-2,4,0,2],[-1,4,0,2],[0,4,0,2],[1,4,0,2],[2,4,0,2],[3,4,0,2],
      [-4,5,0,2],[-3,5,0,2],[-2,5,0,2],[-1,5,0,2],[0,5,0,2],[1,5,0,2],[2,5,0,2],[3,5,0,2],
      [-4,6,0,2],[-3,6,0,2],[-2,6,0,2],[-1,6,0,2],[0,6,0,2],[1,6,0,2],[2,6,0,2],[3,6,0,2],
      [-4,7,0,2],[-3,7,0,2],[-2,7,0,2],[-1,7,0,2],[0,7,0,2],[1,7,0,2],[2,7,0,2],[3,7,0,2],
    ],
    pieces: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  },

  // ── Speed Drill ─────────────────────────────────────────────────────────
  {
    id: 'speed_30ppm',
    category: 'speed',
    name: '30 PPM Drill',
    description: 'Place 20 pieces in under 40 seconds — target 30 pieces per minute.',
    goalType: 'ppm',
    goalValue: 30,
    ppmTarget: 30,
    piecesNeeded: 20,
    timeLimit: 40,
    guidanceNote: 'Focus on quick drops. Use hard-drop (Space) as much as possible.',
    layout: [],
    pieces: [1,2,3,4,5,6,7,1,2,3,4,5,6,7,1,2,3,4,5,6],
  },
  {
    id: 'speed_50ppm',
    category: 'speed',
    name: '50 PPM Drill',
    description: 'Place 20 pieces in under 24 seconds — target 50 PPM. Expert level.',
    goalType: 'ppm',
    goalValue: 50,
    ppmTarget: 50,
    piecesNeeded: 20,
    timeLimit: 30,
    guidanceNote: 'Max speed. Hard-drop everything. No hesitation.',
    layout: [],
    pieces: [4,4,4,4,3,3,3,3,1,1,1,1,2,2,2,2,5,5,5,5],
  },

  // ── Garbage Clearing ─────────────────────────────────────────────────────
  {
    id: 'garbage_6',
    category: 'garbage',
    name: 'Garbage Survival',
    description: 'Board is loaded with 6 garbage rows. Clear them all.',
    goalType: 'garbage_clear',
    goalValue: 6,
    guidanceNote: 'Focus on clearing lines — each clear removes a garbage row.',
    layout: (function () {
      // 6 rows of garbage with random holes (deterministic)
      const holes = [3, 1, -2, 0, 2, -3];
      const rows = [];
      for (let y = 0; y < 6; y++) {
        for (let x = -4; x <= 4; x++) {
          if (x !== holes[y]) {
            rows.push([x, y, 0, 2]);
          }
        }
      }
      return rows;
    })(),
    pieces: [4, 1, 2, 7, 5, 3, 6, 4, 2, 1, 7, 5, 3, 6, 4],
  },
  {
    id: 'garbage_messy',
    category: 'garbage',
    name: 'Messy Board',
    description: 'Irregular stacking — 4 messy rows. Flatten and clear.',
    goalType: 'lines_cleared',
    goalValue: 4,
    guidanceNote: 'Fill in the gaps to clear rows. Work from bottom to top.',
    layout: [
      [-4,0,0,2],[-3,0,0,2],[-2,0,0,2],[0,0,0,2],[1,0,0,2],[3,0,0,2],[4,0,0,2],
      [-4,1,0,2],[-1,1,0,2],[0,1,0,2],[2,1,0,2],[3,1,0,2],[4,1,0,2],
      [-4,2,0,2],[-3,2,0,2],[1,2,0,2],[2,2,0,2],[4,2,0,2],
      [-3,3,0,2],[-2,3,0,2],[0,3,0,2],[1,3,0,2],[3,3,0,2],
    ],
    pieces: [3, 1, 5, 2, 7, 4, 6, 3, 1, 5, 2, 7],
  },

  // ── Perfect Clear ────────────────────────────────────────────────────────
  {
    id: 'pc_4piece',
    category: 'perfect',
    name: '4-Piece PC',
    description: 'Classic 4-piece perfect clear setup. Clear the board completely with 4 pieces.',
    goalType: 'perfect_clear',
    goalValue: 1,
    guidanceNote: 'Place L, J, S, Z to fill the 2×4 area perfectly — no blocks left.',
    layout: [],
    pieces: [2, 7, 5, 6, 4, 1, 3, 2, 7, 5],
  },
  {
    id: 'pc_residual',
    category: 'perfect',
    name: 'Clear the Residue',
    description: 'A few blocks are left behind. Can you set up and execute a perfect clear?',
    goalType: 'perfect_clear',
    goalValue: 1,
    guidanceNote: 'Fill in the existing blocks with pieces to get a full clear.',
    layout: [
      [-4,0,0,2],[-3,0,0,2],
      [-4,1,0,2],
    ],
    pieces: [7, 4, 1, 5, 2, 6, 3, 7, 4, 1],
  },
];

// ── Training state ───────────────────────────────────────────────────────────
let _trainingScenario        = null;   // active TRAINING_SCENARIOS entry
let _trainingUndoStack       = [];     // unlimited snapshots (before each piece land)
let _trainingRedoStack       = [];     // redo stack
let _trainingInitialSnapshot = null;   // snapshot at scenario start (for Reset)
let _trainingPresetBlocks    = [];     // Three.js objects placed by setupTrainingLayout
let _trainingGoalMet         = false;
let _trainingStartTime       = 0;      // performance.now() when scenario started
let _trainingPiecesPlaced    = 0;      // pieces placed this session
let _trainingGarbageRowsCleared = 0;   // for garbage_clear goal
let _trainingB2BAchieved     = false;
let _trainingTSpinType       = '';     // last T-spin type ('mini'|'full')
let _trainingLinesThisSession = 0;     // lines cleared this session
let _trainingSpeedDrillDone  = false;  // speed drill completion flag

// Fixed piece queue for training (mirrors puzzle pattern)
let trainingFixedQueue = [];

// ── Progress tracking ────────────────────────────────────────────────────────

function loadTrainingProgress() {
  try {
    const raw = localStorage.getItem(TRAINING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

function saveTrainingProgress(progress) {
  try { localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(progress)); } catch (_) {}
}

function markTrainingScenarioComplete(scenarioId, stats) {
  const progress = loadTrainingProgress();
  const prev = progress[scenarioId] || {};
  progress[scenarioId] = {
    completed: true,
    completedAt: Date.now(),
    bestTimeMs: (prev.bestTimeMs == null || stats.timeMs < prev.bestTimeMs)
      ? stats.timeMs : prev.bestTimeMs,
    bestPpm: (prev.bestPpm == null || stats.ppm > prev.bestPpm)
      ? stats.ppm : prev.bestPpm,
  };
  saveTrainingProgress(progress);
}

function getTrainingScenarioProgress(scenarioId) {
  return loadTrainingProgress()[scenarioId] || null;
}

// ── Custom board persistence ─────────────────────────────────────────────────

function loadCustomTrainingBoards() {
  try {
    const raw = localStorage.getItem(TRAINING_CUSTOM_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

function saveCustomTrainingBoard(name, layout) {
  const boards = loadCustomTrainingBoards();
  const existing = boards.findIndex(function (b) { return b.name === name; });
  const entry = { name: name, layout: layout, savedAt: Date.now() };
  if (existing >= 0) boards[existing] = entry;
  else boards.push(entry);
  try { localStorage.setItem(TRAINING_CUSTOM_KEY, JSON.stringify(boards)); } catch (_) {}
}

function deleteCustomTrainingBoard(name) {
  const boards = loadCustomTrainingBoards().filter(function (b) { return b.name !== name; });
  try { localStorage.setItem(TRAINING_CUSTOM_KEY, JSON.stringify(boards)); } catch (_) {}
}

// ── Piece queue helpers ───────────────────────────────────────────────────────

/** Populate trainingFixedQueue from scenario, initialise visible next queue. */
function initTrainingPieceQueue() {
  if (!_trainingScenario) return;
  trainingFixedQueue = _trainingScenario.pieces.slice();
  // Fill display queue
  pieceQueue.length = 0;
  const previewCount = Math.min(NEXT_QUEUE_SIZE || 3, trainingFixedQueue.length);
  for (let i = 0; i < previewCount; i++) {
    const idx = trainingFixedQueue[i];
    pieceQueue.push({ index: idx, shape: SHAPES[idx] });
  }
  if (typeof updateNextPiecesHUD === 'function') updateNextPiecesHUD();
}

/** Draw the next piece from trainingFixedQueue. Returns {index,shape} or null if empty. */
function drawTrainingPiece() {
  if (trainingFixedQueue.length === 0) return null;
  const idx = trainingFixedQueue.shift();
  // If queue runs low, loop it
  if (trainingFixedQueue.length < (NEXT_QUEUE_SIZE || 3) && _trainingScenario) {
    const refill = _trainingScenario.pieces.slice();
    for (let i = 0; i < refill.length; i++) trainingFixedQueue.push(refill[i]);
  }
  const previewCount = Math.min(NEXT_QUEUE_SIZE || 3, trainingFixedQueue.length);
  pieceQueue.length = 0;
  for (let i = 0; i < previewCount; i++) {
    const qi = trainingFixedQueue[i];
    pieceQueue.push({ index: qi, shape: SHAPES[qi] });
  }
  if (typeof updateNextPiecesHUD === 'function') updateNextPiecesHUD();
  return { index: idx, shape: SHAPES[idx] };
}

// ── Board setup ───────────────────────────────────────────────────────────────

/** Place preset blocks for the active training scenario. */
function setupTrainingLayout(layout) {
  _trainingPresetBlocks = [];
  if (!layout || layout.length === 0) return;

  layout.forEach(function (entry) {
    const x = entry[0], yLevel = entry[1], z = entry[2], colorIdx = entry[3];
    const color = COLORS[colorIdx];
    const block = createBlockMesh(color);
    block.name = 'landed_block';
    block.userData.isTrainingPreset = true;
    block.userData.materialType = 'stone';
    const matInfo = BLOCK_TYPES['stone'];
    block.userData.miningClicks = matInfo ? matInfo.hits : 3;
    block.position.set(x, yLevel + 0.5, z);
    worldGroup.add(block);
    registerBlock(block);
    _trainingPresetBlocks.push(block);
  });
}

// ── Undo / Redo ──────────────────────────────────────────────────────────────

function _captureTrainingSnapshot() {
  const landedBlocks = [];
  worldGroup.children.forEach(function (obj) {
    if (obj.name === 'landed_block' && obj.userData.isBlock && obj.userData.gridPos) {
      const gp = obj.userData.gridPos;
      landedBlocks.push({
        x: gp.x, y: gp.y, z: gp.z,
        color: (obj.userData.canonicalColor !== undefined)
          ? obj.userData.canonicalColor
          : obj.material.color.getHex(),
      });
    }
  });
  return {
    blocks: landedBlocks,
    score: score,
    linesCleared: linesCleared,
    blocksMined: blocksMined,
    comboCount: comboCount,
    lastClearTime: lastClearTime,
    sessionHighestComboCount: sessionHighestComboCount,
    trainingLines: _trainingLinesThisSession,
    trainingPieces: _trainingPiecesPlaced,
  };
}

function _restoreTrainingSnapshot(snapshot) {
  // Remove all landed blocks
  const toRemove = worldGroup.children.filter(function (obj) {
    return obj.name === 'landed_block' && obj.userData.isBlock;
  });
  toRemove.forEach(function (obj) {
    if (obj.userData.gridPos) {
      const gp = obj.userData.gridPos;
      const key = gp.x + ',' + gp.z;
      const row = gridOccupancy.get(gp.y);
      if (row) {
        row.delete(key);
        if (row.size === 0) gridOccupancy.delete(gp.y);
      }
    }
    worldGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });

  snapshot.blocks.forEach(function (b) {
    const block = createBlockMesh(b.color);
    block.position.set(b.x, b.y, b.z);
    block.name = 'landed_block';
    worldGroup.add(block);
    registerBlock(block);
  });

  score                    = snapshot.score;
  linesCleared             = snapshot.linesCleared;
  blocksMined              = snapshot.blocksMined;
  comboCount               = snapshot.comboCount;
  lastClearTime            = snapshot.lastClearTime;
  sessionHighestComboCount = snapshot.sessionHighestComboCount;
  _trainingLinesThisSession = snapshot.trainingLines || 0;
  _trainingPiecesPlaced    = snapshot.trainingPieces || 0;

  if (typeof updateScoreHUD      === 'function') updateScoreHUD();
  if (typeof updateDangerWarning === 'function') updateDangerWarning();
}

/** Called after each piece lands — push to undo stack. */
function captureTrainingSnapshot() {
  if (!isTrainingMode) return;
  const snap = _captureTrainingSnapshot();
  _trainingUndoStack.push(snap);
  _trainingRedoStack.length = 0; // clear redo after a new action
  _updateTrainingUndoHUD();
}

/** Undo last piece placement. */
function undoTrainingPlacement() {
  if (!isTrainingMode) return;
  if (_trainingUndoStack.length === 0) {
    if (typeof showCraftedBanner === 'function') showCraftedBanner('Nothing to undo.');
    return;
  }
  // Current state → redo
  _trainingRedoStack.push(_captureTrainingSnapshot());
  const snap = _trainingUndoStack.pop();
  _restoreTrainingSnapshot(snap);
  _updateTrainingUndoHUD();
  if (typeof showCraftedBanner === 'function') showCraftedBanner('Undo');
}

/** Redo last undone placement. */
function redoTrainingPlacement() {
  if (!isTrainingMode) return;
  if (_trainingRedoStack.length === 0) {
    if (typeof showCraftedBanner === 'function') showCraftedBanner('Nothing to redo.');
    return;
  }
  _trainingUndoStack.push(_captureTrainingSnapshot());
  const snap = _trainingRedoStack.pop();
  _restoreTrainingSnapshot(snap);
  _updateTrainingUndoHUD();
  if (typeof showCraftedBanner === 'function') showCraftedBanner('Redo');
}

/** Reset to scenario initial state. */
function resetTrainingScenario() {
  if (!isTrainingMode || !_trainingInitialSnapshot) return;
  _trainingUndoStack.length = 0;
  _trainingRedoStack.length = 0;
  _trainingGoalMet     = false;
  _trainingPiecesPlaced = 0;
  _trainingLinesThisSession = 0;
  _trainingGarbageRowsCleared = 0;
  _trainingB2BAchieved = false;
  _trainingSpeedDrillDone = false;
  _trainingStartTime   = performance.now();
  _restoreTrainingSnapshot(_trainingInitialSnapshot);
  if (_trainingScenario) initTrainingPieceQueue();
  _updateTrainingUndoHUD();
  if (typeof showCraftedBanner === 'function') showCraftedBanner('Scenario Reset');
}

function _updateTrainingUndoHUD() {
  const undoEl = document.getElementById('training-undo-count');
  const redoEl = document.getElementById('training-redo-count');
  if (undoEl) undoEl.textContent = _trainingUndoStack.length;
  if (redoEl) redoEl.textContent = _trainingRedoStack.length;
}

// ── Guidance overlay ──────────────────────────────────────────────────────────

let _trainingGhostEnabled = true;
let _trainingGhostEl = null;

function toggleTrainingGuidance() {
  _trainingGhostEnabled = !_trainingGhostEnabled;
  const btn = document.getElementById('training-guidance-btn');
  if (btn) btn.textContent = _trainingGhostEnabled ? '👁 Guidance ON' : '👁 Guidance OFF';
  const tipEl = document.getElementById('training-guidance-tip');
  if (tipEl) tipEl.style.display = _trainingGhostEnabled ? 'block' : 'none';
}

function showTrainingGuidance() {
  if (!isTrainingMode || !_trainingScenario || !_trainingGhostEnabled) return;
  const tipEl = document.getElementById('training-guidance-tip');
  if (tipEl) {
    tipEl.textContent = _trainingScenario.guidanceNote || '';
    tipEl.style.display = 'block';
  }
}

// ── Speed drill HUD ───────────────────────────────────────────────────────────

function updateTrainingSpeedHUD() {
  if (!isTrainingMode || !_trainingScenario) return;
  if (_trainingScenario.category !== 'speed') return;

  const elapsed = (performance.now() - _trainingStartTime) / 1000;
  const ppm = elapsed > 0 ? (_trainingPiecesPlaced / elapsed) * 60 : 0;

  const ppmEl = document.getElementById('training-ppm-display');
  if (ppmEl) ppmEl.textContent = 'PPM: ' + Math.round(ppm);

  const timeEl = document.getElementById('training-timer-display');
  if (timeEl) {
    const remaining = (_trainingScenario.timeLimit || 60) - elapsed;
    if (remaining > 0) {
      const mm = Math.floor(remaining / 60).toString().padStart(2, '0');
      const ss = Math.ceil(remaining % 60).toString().padStart(2, '0');
      timeEl.textContent = mm + ':' + ss;
    } else {
      timeEl.textContent = '00:00';
    }
  }
}

// ── Goal detection ────────────────────────────────────────────────────────────

/**
 * Called after each line clear / T-spin event to check if the training goal is met.
 * @param {object} params - { tspinType, linesCleared, combo, b2b, isPerfectClear }
 */
function checkTrainingGoal(params) {
  if (!isTrainingMode || _trainingGoalMet || !_trainingScenario) return;

  const gt  = _trainingScenario.goalType;
  const gv  = _trainingScenario.goalValue;
  const { tspinType, linesJustCleared, combo, b2b, isPerfectClear } = params || {};

  if (linesJustCleared) {
    _trainingLinesThisSession += linesJustCleared;
  }

  let met = false;

  if (gt === 'tspin_triple' && tspinType === 'full' && linesJustCleared >= 3) {
    met = true;
  } else if (gt === 'tspin_double' && tspinType === 'full' && linesJustCleared >= 2) {
    met = true;
  } else if (gt === 'tspin_mini' && tspinType === 'mini' && linesJustCleared >= 1) {
    met = true;
  } else if (gt === 'combo' && combo >= gv) {
    met = true;
  } else if (gt === 'b2b' && b2b) {
    met = true;
  } else if (gt === 'lines_cleared' && _trainingLinesThisSession >= gv) {
    met = true;
  } else if (gt === 'perfect_clear' && isPerfectClear) {
    met = true;
  } else if (gt === 'garbage_clear') {
    // Count how many lines of garbage have been cleared
    if (linesJustCleared) _trainingGarbageRowsCleared += linesJustCleared;
    if (_trainingGarbageRowsCleared >= gv) met = true;
  }

  if (met) {
    _trainingGoalMet = true;
    setTimeout(function () { triggerTrainingComplete(); }, 600);
  }
}

/** Called after each piece placement for speed drill goal tracking. */
function onTrainingPiecePlaced() {
  if (!isTrainingMode || !_trainingScenario) return;
  _trainingPiecesPlaced++;

  if (_trainingScenario.category === 'speed') {
    updateTrainingSpeedHUD();
    const elapsed = (performance.now() - _trainingStartTime) / 1000;
    // Check time limit
    if (elapsed >= (_trainingScenario.timeLimit || 60)) {
      if (!_trainingGoalMet && !_trainingSpeedDrillDone) {
        _trainingSpeedDrillDone = true;
        const ppm = (elapsed > 0) ? (_trainingPiecesPlaced / elapsed) * 60 : 0;
        triggerTrainingComplete(ppm);
        return;
      }
    }
    // Check piece count target
    if (_trainingScenario.piecesNeeded && _trainingPiecesPlaced >= _trainingScenario.piecesNeeded) {
      if (!_trainingGoalMet) {
        _trainingGoalMet = true;
        const ppmFinal = (elapsed > 0) ? (_trainingPiecesPlaced / elapsed) * 60 : 0;
        setTimeout(function () { triggerTrainingComplete(ppmFinal); }, 300);
      }
    }
  }
}

// ── Complete overlay ──────────────────────────────────────────────────────────

function triggerTrainingComplete(finalPpm) {
  if (isGameOver) return;
  isGameOver       = true;
  gameTimerRunning = false;

  const elapsedMs = performance.now() - _trainingStartTime;
  const elapsedSecs = elapsedMs / 1000;
  const ppm = finalPpm != null ? finalPpm
    : (elapsedSecs > 0 ? (_trainingPiecesPlaced / elapsedSecs) * 60 : 0);

  // Record progress
  if (_trainingScenario) {
    markTrainingScenarioComplete(_trainingScenario.id, {
      timeMs: elapsedMs,
      ppm: Math.round(ppm),
    });
  }

  // Build stats
  const mm = Math.floor(elapsedSecs / 60).toString().padStart(2, '0');
  const ss = Math.floor(elapsedSecs % 60).toString().padStart(2, '0');

  const statsEl = document.getElementById('training-complete-stats');
  if (statsEl) {
    const goalMet = _trainingGoalMet;
    statsEl.innerHTML =
      '<div><span class="go-label">GOAL</span><br>' + (goalMet ? '✓ ACHIEVED' : 'PARTIAL') + '</div>' +
      '<div><span class="go-label">TIME</span><br>' + mm + ':' + ss + '</div>' +
      '<div><span class="go-label">PIECES</span><br>' + _trainingPiecesPlaced + '</div>' +
      '<div><span class="go-label">PPM</span><br>' + Math.round(ppm) + '</div>';
  }

  const titleEl = document.getElementById('training-complete-title');
  if (titleEl) titleEl.textContent = _trainingGoalMet ? 'GOAL ACHIEVED!' : 'TRAINING OVER';

  const subtitleEl = document.getElementById('training-complete-subtitle');
  if (subtitleEl) subtitleEl.textContent = _trainingScenario ? _trainingScenario.name : '';

  const overlayEl = document.getElementById('training-complete-screen');
  if (overlayEl) overlayEl.style.display = 'flex';

  if (typeof stopBgMusic        === 'function') stopBgMusic();
  if (typeof playGameOverJingle === 'function') playGameOverJingle();
  if (controls && controls.isLocked) controls.unlock();

  // Refresh scenario list badges
  setTimeout(renderTrainingScenarioList, 400);
}

// ── Scenario selection UI ────────────────────────────────────────────────────

let _trainingActiveCategory = 'tspin';

function showTrainingSelect() {
  const el = document.getElementById('training-select-screen');
  if (el) el.style.display = 'flex';
  renderTrainingScenarioList();
}

function hideTrainingSelect() {
  const el = document.getElementById('training-select-screen');
  if (el) el.style.display = 'none';
}

function renderTrainingScenarioList() {
  const listEl = document.getElementById('training-scenario-list');
  if (!listEl) return;

  const progress = loadTrainingProgress();
  const cat      = _trainingActiveCategory;

  const scenarios = TRAINING_SCENARIOS.filter(function (s) { return s.category === cat; });
  listEl.innerHTML = '';

  scenarios.forEach(function (s) {
    const prog = progress[s.id];
    const completed = prog && prog.completed;

    const card = document.createElement('div');
    card.className = 'training-scenario-card' + (completed ? ' training-scenario-done' : '');

    const catInfo = TRAINING_CATEGORIES[s.category] || {};
    const bestTime = (prog && prog.bestTimeMs != null)
      ? _fmtTrainingTime(prog.bestTimeMs) : '--';
    const bestPpm  = (prog && prog.bestPpm  != null) ? prog.bestPpm  : '--';

    card.innerHTML =
      '<div class="tsc-header">' +
        '<span class="tsc-name">' + (completed ? '✓ ' : '') + s.name + '</span>' +
      '</div>' +
      '<div class="tsc-desc">' + s.description + '</div>' +
      '<div class="tsc-stats">' +
        '<span>Best: ' + bestTime + '</span>' +
        (s.category === 'speed' ? '<span>Best PPM: ' + bestPpm + '</span>' : '') +
      '</div>' +
      '<button class="tsc-start-btn">▶ Start</button>';

    card.querySelector('.tsc-start-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      launchTrainingScenario(s.id);
    });
    listEl.appendChild(card);
  });

  // Sandbox tab — single launch button for Practice sandbox
  if (cat === 'sandbox') {
    listEl.innerHTML = '';
    const sandboxCard = document.createElement('div');
    sandboxCard.className = 'training-scenario-card';
    sandboxCard.innerHTML =
      '<div class="tsc-header"><span class="tsc-name">&#129137; Sandbox</span></div>' +
      '<div class="tsc-desc">Free play. Undo placements, set gravity, no scoring or goal.</div>' +
      '<button class="tsc-start-btn">&#9654; Start Sandbox</button>';
    sandboxCard.querySelector('.tsc-start-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      hideTrainingSelect();
      // Clear last scenario so Practice card body click defaults to sandbox next time
      try { localStorage.removeItem('mineCtris_practiceLastScenario'); } catch (_) {}
      if (typeof updatePracticeScenarioLabel === 'function') updatePracticeScenarioLabel();
      // Launch practice sandbox (mode-select already hidden by scenario button click)
      isPracticeMode       = true;
      isDailyChallenge     = false;
      gameRng              = null;
      difficultyMultiplier = 1.0;
      lastDifficultyTier   = 0;
      const practiceBadgeEl = document.getElementById('practice-badge');
      if (practiceBadgeEl) practiceBadgeEl.style.display = 'block';
      try { localStorage.setItem('mineCtris_lastMode', 'practice'); } catch (_) {}
      if (typeof metricsModePlayed === 'function') metricsModePlayed('practice');
      if (typeof requestPointerLock === 'function') requestPointerLock();
    });
    listEl.appendChild(sandboxCard);
    return;
  }

  // Custom scenarios tab
  if (cat === 'custom') {
    renderTrainingCustomList(listEl, progress);
  }
}

function renderTrainingCustomList(listEl, progress) {
  const boards = loadCustomTrainingBoards();
  if (boards.length === 0) {
    listEl.innerHTML += '<div class="tsc-empty">No custom boards yet. Use the Board Editor to create one.</div>';
    return;
  }
  boards.forEach(function (board) {
    const card = document.createElement('div');
    card.className = 'training-scenario-card';
    card.innerHTML =
      '<div class="tsc-header"><span class="tsc-name">📐 ' + board.name + '</span></div>' +
      '<button class="tsc-start-btn">▶ Start</button>' +
      '<button class="tsc-delete-btn">🗑 Delete</button>';
    card.querySelector('.tsc-start-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      launchCustomTrainingBoard(board);
    });
    card.querySelector('.tsc-delete-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      if (confirm('Delete "' + board.name + '"?')) {
        deleteCustomTrainingBoard(board.name);
        renderTrainingScenarioList();
      }
    });
    listEl.appendChild(card);
  });
}

function _fmtTrainingTime(ms) {
  const secs = Math.floor(ms / 1000);
  const mm   = Math.floor(secs / 60).toString().padStart(2, '0');
  const ss   = (secs % 60).toString().padStart(2, '0');
  return mm + ':' + ss;
}

function selectTrainingCategory(cat) {
  _trainingActiveCategory = cat;
  // Update tab active state
  document.querySelectorAll('.training-tab-btn').forEach(function (btn) {
    btn.classList.toggle('training-tab-active', btn.getAttribute('data-cat') === cat);
  });
  renderTrainingScenarioList();
}

// ── Launch a scenario ─────────────────────────────────────────────────────────

function launchTrainingScenario(scenarioId) {
  if (typeof analyticsFeatureUsed === 'function') analyticsFeatureUsed('training_mode');
  const scenario = TRAINING_SCENARIOS.find(function (s) { return s.id === scenarioId; });
  if (!scenario) return;

  isTrainingMode        = true;
  _trainingScenario     = scenario;
  isDailyChallenge      = false;
  isPracticeMode        = false;
  gameRng               = null;
  difficultyMultiplier  = 1.0;
  lastDifficultyTier    = 0;

  _trainingUndoStack.length = 0;
  _trainingRedoStack.length = 0;
  _trainingGoalMet          = false;
  _trainingPiecesPlaced     = 0;
  _trainingLinesThisSession = 0;
  _trainingGarbageRowsCleared = 0;
  _trainingB2BAchieved      = false;
  _trainingSpeedDrillDone   = false;
  _trainingGhostEnabled     = true;
  trainingFixedQueue.length = 0;

  // Store scenario in storage so HUD badge can read it, and update Practice card label
  try { localStorage.setItem('mineCtris_lastMode', 'training'); } catch (_) {}
  try { localStorage.setItem('mineCtris_practiceLastScenario', scenarioId); } catch (_) {}
  if (typeof updatePracticeScenarioLabel === 'function') updatePracticeScenarioLabel();
  if (typeof metricsModePlayed === 'function') metricsModePlayed('training');

  hideTrainingSelect();

  // Show training HUD badge and goal
  const badgeEl = document.getElementById('training-badge');
  if (badgeEl) {
    badgeEl.textContent = '🎯 ' + scenario.name;
    badgeEl.style.display = 'block';
  }

  // Update guidance tip
  const tipEl = document.getElementById('training-guidance-tip');
  if (tipEl) {
    tipEl.textContent = scenario.guidanceNote || '';
    tipEl.style.display = _trainingGhostEnabled ? 'block' : 'none';
  }

  // Show speed drill HUD if applicable
  const speedHud = document.getElementById('training-speed-hud');
  if (speedHud) speedHud.style.display = (scenario.category === 'speed') ? 'flex' : 'none';

  requestPointerLock();
}

function launchCustomTrainingBoard(board) {
  const customScenario = {
    id: 'custom_' + Date.now(),
    category: 'custom',
    name: board.name,
    description: 'Custom practice board.',
    goalType: 'none',
    goalValue: 0,
    guidanceNote: 'Practice freely on your custom board.',
    layout: board.layout,
    pieces: [1,2,3,4,5,6,7,1,2,3,4,5,6,7,1,2,3,4,5,6,7],
  };
  isTrainingMode        = true;
  _trainingScenario     = customScenario;
  isDailyChallenge      = false;
  isPracticeMode        = false;
  gameRng               = null;
  difficultyMultiplier  = 1.0;
  lastDifficultyTier    = 0;
  _trainingUndoStack.length = 0;
  _trainingRedoStack.length = 0;
  _trainingGoalMet          = false;
  _trainingPiecesPlaced     = 0;
  _trainingLinesThisSession = 0;
  _trainingGarbageRowsCleared = 0;
  _trainingGhostEnabled     = true;
  trainingFixedQueue.length = 0;

  hideTrainingSelect();

  const badgeEl = document.getElementById('training-badge');
  if (badgeEl) {
    badgeEl.textContent = '📐 ' + board.name;
    badgeEl.style.display = 'block';
  }

  const tipEl = document.getElementById('training-guidance-tip');
  if (tipEl) {
    tipEl.textContent = customScenario.guidanceNote;
    tipEl.style.display = _trainingGhostEnabled ? 'block' : 'none';
  }

  const speedHud = document.getElementById('training-speed-hud');
  if (speedHud) speedHud.style.display = 'none';

  requestPointerLock();
}

// ── Called from game-loop after pointer lock / game init ─────────────────────

/**
 * Setup the training board — called from the main game init path when isTrainingMode is true.
 * Mirrors setupPuzzleLayout() integration.
 */
function setupTrainingGame() {
  if (!isTrainingMode || !_trainingScenario) return;

  // Place preset blocks
  setupTrainingLayout(_trainingScenario.layout || []);

  // Init piece queue
  initTrainingPieceQueue();

  // Capture initial snapshot for Reset
  _trainingInitialSnapshot = _captureTrainingSnapshot();
  _trainingStartTime = performance.now();

  // Show undo HUD
  const undoHudEl = document.getElementById('training-undo-hud');
  if (undoHudEl) undoHudEl.style.display = 'flex';

  _updateTrainingUndoHUD();
  showTrainingGuidance();

  // Show goal overlay
  const goalEl = document.getElementById('training-goal-display');
  if (goalEl) {
    const goalLabels = {
      tspin_triple: 'Perform a T-Spin Triple',
      tspin_double: 'Perform a T-Spin Double',
      tspin_mini:   'Perform a T-Spin Mini',
      combo:        'Achieve a ' + (_trainingScenario.goalValue || '?') + '-Combo',
      b2b:          'Achieve Back-to-Back Tetris',
      ppm:          'Reach ' + (_trainingScenario.goalValue || '?') + ' PPM',
      lines_cleared:'Clear ' + (_trainingScenario.goalValue || '?') + ' lines',
      garbage_clear:'Clear ' + (_trainingScenario.goalValue || '?') + ' garbage rows',
      perfect_clear:'Achieve a Perfect Clear',
      none:         'Free practice',
    };
    goalEl.textContent = '🎯 ' + (goalLabels[_trainingScenario.goalType] || '');
    goalEl.style.display = 'block';
  }
}

/** Called from gamestate-reset.js to clear training state on mode exit. */
function resetTrainingMode() {
  isTrainingMode           = false;
  _trainingScenario        = null;
  _trainingUndoStack.length = 0;
  _trainingRedoStack.length = 0;
  _trainingInitialSnapshot = null;
  _trainingPresetBlocks    = [];
  _trainingGoalMet         = false;
  _trainingPiecesPlaced    = 0;
  _trainingLinesThisSession = 0;
  _trainingGarbageRowsCleared = 0;
  _trainingB2BAchieved     = false;
  _trainingSpeedDrillDone  = false;
  trainingFixedQueue.length = 0;

  const badgeEl = document.getElementById('training-badge');
  if (badgeEl) badgeEl.style.display = 'none';

  const completeEl = document.getElementById('training-complete-screen');
  if (completeEl) completeEl.style.display = 'none';

  const goalEl = document.getElementById('training-goal-display');
  if (goalEl) goalEl.style.display = 'none';

  const tipEl = document.getElementById('training-guidance-tip');
  if (tipEl) tipEl.style.display = 'none';

  const speedHud = document.getElementById('training-speed-hud');
  if (speedHud) speedHud.style.display = 'none';

  const undoHudEl = document.getElementById('training-undo-hud');
  if (undoHudEl) undoHudEl.style.display = 'none';
}

// ── Board editor ──────────────────────────────────────────────────────────────

const EDITOR_BOARD_W = 9; // -4 to 4
const EDITOR_BOARD_H = 10;
let _editorGrid = [];     // 2D array [y][x] of colorIndex or 0
let _editorSelectedColor = 2; // default: stone

function initEditorGrid() {
  _editorGrid = [];
  for (let y = 0; y < EDITOR_BOARD_H; y++) {
    _editorGrid.push(new Array(EDITOR_BOARD_W).fill(0));
  }
}

function renderBoardEditor() {
  const container = document.getElementById('training-editor-grid');
  if (!container) return;
  container.innerHTML = '';
  container.style.gridTemplateColumns = 'repeat(' + EDITOR_BOARD_W + ', 28px)';
  container.style.gridTemplateRows    = 'repeat(' + EDITOR_BOARD_H + ', 28px)';

  for (let y = EDITOR_BOARD_H - 1; y >= 0; y--) {
    for (let x = 0; x < EDITOR_BOARD_W; x++) {
      const cell = document.createElement('div');
      cell.className = 'training-editor-cell';
      const colorIdx = _editorGrid[y][x];
      if (colorIdx) {
        const hex = COLORS[colorIdx].toString(16).padStart(6, '0');
        cell.style.background = '#' + hex;
      }
      cell.setAttribute('data-x', x);
      cell.setAttribute('data-y', y);
      cell.addEventListener('mousedown', _onEditorCellClick);
      cell.addEventListener('mouseover', _onEditorCellDrag);
      container.appendChild(cell);
    }
  }
}

let _editorMouseDown = false;
let _editorMode = 'place'; // 'place' | 'erase'

function _onEditorCellClick(e) {
  if (e.type === 'mousedown') {
    _editorMouseDown = true;
    _editorMode = (e.button === 2 || e.shiftKey) ? 'erase' : 'place';
  }
  _applyEditorCell(e.target);
}

function _onEditorCellDrag(e) {
  if (!_editorMouseDown) return;
  _applyEditorCell(e.target);
}

function _applyEditorCell(cell) {
  const x = parseInt(cell.getAttribute('data-x'));
  const y = parseInt(cell.getAttribute('data-y'));
  if (_editorMode === 'erase') {
    _editorGrid[y][x] = 0;
    cell.style.background = '';
  } else {
    _editorGrid[y][x] = _editorSelectedColor;
    const hex = COLORS[_editorSelectedColor].toString(16).padStart(6, '0');
    cell.style.background = '#' + hex;
  }
}

function showBoardEditor() {
  initEditorGrid();
  renderBoardEditor();
  const editorEl = document.getElementById('training-editor-screen');
  if (editorEl) editorEl.style.display = 'flex';
}

function hideBoardEditor() {
  const editorEl = document.getElementById('training-editor-screen');
  if (editorEl) editorEl.style.display = 'none';
}

function saveBoardEditorLayout() {
  const nameInput = document.getElementById('training-editor-name');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) { alert('Please enter a name for your custom board.'); return; }

  const layout = [];
  for (let y = 0; y < EDITOR_BOARD_H; y++) {
    for (let x = 0; x < EDITOR_BOARD_W; x++) {
      const colorIdx = _editorGrid[y][x];
      if (colorIdx) {
        layout.push([x - Math.floor(EDITOR_BOARD_W / 2), y, 0, colorIdx]);
      }
    }
  }

  saveCustomTrainingBoard(name, layout);
  hideBoardEditor();
  _trainingActiveCategory = 'custom';
  showTrainingSelect();
}

// ── Init training select UI ───────────────────────────────────────────────────

(function _initTrainingUI() {
  // Tab buttons
  document.querySelectorAll('.training-tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectTrainingCategory(btn.getAttribute('data-cat'));
    });
  });

  // Back button on scenario select
  const backBtn = document.getElementById('training-select-back');
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      hideTrainingSelect();
      if (typeof showModeSelect === 'function') showModeSelect();
    });
  }

  // Board editor open
  const editorBtn = document.getElementById('training-open-editor-btn');
  if (editorBtn) {
    editorBtn.addEventListener('click', function () {
      hideTrainingSelect();
      showBoardEditor();
    });
  }

  // Board editor back
  const editorBackBtn = document.getElementById('training-editor-back');
  if (editorBackBtn) {
    editorBackBtn.addEventListener('click', function () {
      hideBoardEditor();
      showTrainingSelect();
    });
  }

  // Board editor save
  const editorSaveBtn = document.getElementById('training-editor-save');
  if (editorSaveBtn) {
    editorSaveBtn.addEventListener('click', saveBoardEditorLayout);
  }

  // Board editor clear
  const editorClearBtn = document.getElementById('training-editor-clear');
  if (editorClearBtn) {
    editorClearBtn.addEventListener('click', function () {
      initEditorGrid();
      renderBoardEditor();
    });
  }

  // Editor color palette
  document.querySelectorAll('.training-editor-color').forEach(function (swatch) {
    swatch.addEventListener('click', function () {
      _editorSelectedColor = parseInt(swatch.getAttribute('data-color-idx'));
      document.querySelectorAll('.training-editor-color').forEach(function (s) {
        s.classList.remove('training-editor-color-active');
      });
      swatch.classList.add('training-editor-color-active');
    });
  });

  // Editor mouseup
  document.addEventListener('mouseup', function () { _editorMouseDown = false; });

  // Training complete overlay buttons
  const retryBtn = document.getElementById('training-retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      if (typeof resetGame === 'function') resetGame();
    });
  }

  const menuBtn = document.getElementById('training-main-menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      if (typeof resetGame === 'function') resetGame();
    });
  }

  const selectBtn = document.getElementById('training-select-btn');
  if (selectBtn) {
    selectBtn.addEventListener('click', function () {
      if (typeof resetGame === 'function') resetGame();
      // After reset, open training select directly
      setTimeout(function () {
        showTrainingSelect();
        if (typeof hideModeSelect === 'function') hideModeSelect();
      }, 100);
    });
  }

  // In-game reset button
  const inGameResetBtn = document.getElementById('training-reset-btn');
  if (inGameResetBtn) {
    inGameResetBtn.addEventListener('click', function () {
      resetTrainingScenario();
    });
  }

  // Guidance toggle
  const guidanceBtn = document.getElementById('training-guidance-btn');
  if (guidanceBtn) {
    guidanceBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleTrainingGuidance();
    });
  }
})();

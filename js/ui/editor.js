// Editor mode — block palette, paint tools, ghost preview, draft autosave.
// Requires: state.js, config.js, world.js, mining.js (targetedBlock, targetedFaceNormal, groundPlacementPoint)

// ── Draft autosave ────────────────────────────────────────────────────────────

const EDITOR_DRAFT_KEY = "mineCtris_editorDraft";
const EDITOR_AUTOSAVE_INTERVAL = 30; // seconds

let _editorAutosaveTimer = 0;
// Set by main.js before pointer lock to carry a loaded draft into initEditorMode.
let _pendingEditorDraft = null;

// ── Undo/Redo ─────────────────────────────────────────────────────────────────
const EDITOR_UNDO_MAX = 50;
let _editorUndoStack = [];
let _editorRedoStack = [];

// ── Drag-to-paint / rect fill ─────────────────────────────────────────────────
// mode: 'none' | 'paint' | 'erase' | 'rect'
let _editorDragMode = 'none';
let _editorDragLastKey = null;    // "x,y,z" of last affected cell (dedup)
let _editorDragUndoCaptured = false;
let _editorRectStart = null;      // {x,y,z} — first corner of rect fill
let _editorRectPreview = [];      // temp ghost meshes showing rect preview
let _editorShiftDown = false;     // tracked for rect-fill activation

// ── Row clipboard ─────────────────────────────────────────────────────────────
let _editorRowClipboard = null;   // null | {blocks:[{x,z,color}], srcY}

// ── Grid helper ───────────────────────────────────────────────────────────────
let _editorGridHelper = null;
let _editorGridVisible = false;

// ── Status toast ──────────────────────────────────────────────────────────────
let _editorStatusTimeout = null;

// ── Win condition state ───────────────────────────────────────────────────────
// mode: "mine_all" | "clear_lines" | "survive_seconds" | "score_points"
// n:    numeric target (unused for mine_all)
let editorWinCondition = { mode: "mine_all", n: 10 };

// ── Puzzle metadata state ─────────────────────────────────────────────────────
let editorPuzzleMetadata = { name: "", description: "", author: "", difficulty: 0 };

// ── Piece sequence state ──────────────────────────────────────────────────────
// mode: "random" | "fixed"
// pieces: array of piece indices (1–7) defining the ordered spawn sequence.
//         In "random" mode this is ignored. In "fixed" mode the sequence loops.
let editorPieceSequence = { mode: "random", pieces: [] };

const _SEQ_PIECE_NAMES  = ["", "T", "L", "O", "I", "S", "Z", "J"];
const _SEQ_PIECE_COLORS = [null, 0x8b4513, 0x808080, 0xffff00, 0x00ffff, 0x008000, 0xff0000, 0x800080];

/** Serialize current editor world (all landed_block children) to localStorage. */
function saveEditorDraft() {
  try {
    const blocks = [];
    worldGroup.children.forEach(function (child) {
      if (child.name === "landed_block") {
        const wp = new THREE.Vector3();
        child.getWorldPosition(wp);
        blocks.push({ x: wp.x, y: wp.y, z: wp.z, color: child.userData.canonicalColor });
      }
    });
    const draft = {
      blocks: blocks,
      selectedIdx: editorSelectedIdx,
      winCondition: { mode: editorWinCondition.mode, n: editorWinCondition.n },
      metadata: {
        name: editorPuzzleMetadata.name,
        description: editorPuzzleMetadata.description,
        author: editorPuzzleMetadata.author,
        difficulty: editorPuzzleMetadata.difficulty,
      },
      pieceSequence: { mode: editorPieceSequence.mode, pieces: editorPieceSequence.pieces.slice() },
      savedAt: Date.now(),
    };
    localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify(draft));
  } catch (_) {}
}

/** Return the parsed draft object from localStorage, or null if none / invalid. */
function loadEditorDraft() {
  try {
    const raw = localStorage.getItem(EDITOR_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/** Remove the saved draft from localStorage. */
function clearEditorDraft() {
  try { localStorage.removeItem(EDITOR_DRAFT_KEY); } catch (_) {}
}

/** Place blocks from a draft object into the current editor world. */
function applyEditorDraft(draft) {
  if (!draft || !Array.isArray(draft.blocks)) return;
  draft.blocks.forEach(function (b) {
    const block = createBlockMesh(new THREE.Color(b.color));
    block.name = "landed_block";
    block.position.set(b.x, b.y, b.z);
    worldGroup.add(block);
    registerBlock(block);
  });
  if (typeof draft.selectedIdx === "number") {
    selectEditorBlock(draft.selectedIdx);
  }
  if (draft.winCondition && draft.winCondition.mode) {
    editorWinCondition = { mode: draft.winCondition.mode, n: draft.winCondition.n || 10 };
    renderWinConditionBuilder();
  }
  if (draft.metadata) {
    editorPuzzleMetadata = {
      name:        (draft.metadata.name        || "").slice(0, 40),
      description: (draft.metadata.description || "").slice(0, 120),
      author:      (draft.metadata.author      || "").slice(0, 20),
      difficulty:  draft.metadata.difficulty   || 0,
    };
    renderMetadataPanel();
  }
  if (draft.pieceSequence) {
    var seqMode = draft.pieceSequence.mode === "fixed" ? "fixed" : "random";
    var seqPieces = Array.isArray(draft.pieceSequence.pieces)
      ? draft.pieceSequence.pieces.filter(function(p) { return p >= 1 && p <= 7; })
      : [];
    editorPieceSequence = { mode: seqMode, pieces: seqPieces };
    renderPieceSequencePanel();
  }
}

/** Advance the autosave timer; call each frame while in editor mode with delta seconds. */
function tickEditorAutosave(delta) {
  _editorAutosaveTimer += delta;
  if (_editorAutosaveTimer >= EDITOR_AUTOSAVE_INTERVAL) {
    _editorAutosaveTimer = 0;
    saveEditorDraft();
  }
}

// ── Undo/Redo implementation ──────────────────────────────────────────────────

function _captureEditorSnapshot() {
  var snap = [];
  worldGroup.children.forEach(function (c) {
    if (c.name === "landed_block") {
      var wp = new THREE.Vector3();
      c.getWorldPosition(wp);
      snap.push({ x: wp.x, y: wp.y, z: wp.z, color: c.userData.canonicalColor });
    }
  });
  return snap;
}

function _restoreEditorSnapshot(snap) {
  var toRemove = worldGroup.children.filter(function (c) { return c.name === "landed_block"; });
  toRemove.forEach(function (b) {
    unregisterBlock(b);
    if (typeof disposeBlock === "function") disposeBlock(b);
    worldGroup.remove(b);
  });
  if (typeof obsidianBlocks !== "undefined") obsidianBlocks.length = 0;
  snap.forEach(function (b) {
    var block = createBlockMesh(new THREE.Color(b.color));
    block.name = "landed_block";
    block.position.set(b.x, b.y, b.z);
    worldGroup.add(block);
    registerBlock(block);
  });
}

function _pushUndo(preSnap) {
  _editorUndoStack.push(preSnap || _captureEditorSnapshot());
  if (_editorUndoStack.length > EDITOR_UNDO_MAX) _editorUndoStack.shift();
  _editorRedoStack = [];
  _updateUndoRedoBtns();
}

function editorUndo() {
  if (_editorUndoStack.length === 0) return;
  _editorRedoStack.push(_captureEditorSnapshot());
  _restoreEditorSnapshot(_editorUndoStack.pop());
  _updateUndoRedoBtns();
  _flashEditorStatus("Undo");
}

function editorRedo() {
  if (_editorRedoStack.length === 0) return;
  _editorUndoStack.push(_captureEditorSnapshot());
  _restoreEditorSnapshot(_editorRedoStack.pop());
  _updateUndoRedoBtns();
  _flashEditorStatus("Redo");
}

function _updateUndoRedoBtns() {
  var undoBtn = document.getElementById("editor-undo-btn");
  var redoBtn = document.getElementById("editor-redo-btn");
  if (undoBtn) {
    undoBtn.disabled = _editorUndoStack.length === 0;
    undoBtn.style.opacity = _editorUndoStack.length === 0 ? "0.45" : "";
  }
  if (redoBtn) {
    redoBtn.disabled = _editorRedoStack.length === 0;
    redoBtn.style.opacity = _editorRedoStack.length === 0 ? "0.45" : "";
  }
}

function _flashEditorStatus(msg) {
  var el = document.getElementById("editor-status-toast");
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(_editorStatusTimeout);
  _editorStatusTimeout = setTimeout(function () {
    el.style.opacity = "0";
  }, 1500);
}

// ── Drag-to-paint & rect fill ─────────────────────────────────────────────────

/** Start a drag session: 'paint', 'erase', or 'rect' (Shift+paint). */
function editorDragStart(mode) {
  if (_editorDragMode !== "none") return;
  _editorDragMode = mode;
  _editorDragLastKey = null;
  _editorDragUndoCaptured = false;
  if (mode === "rect") {
    _editorRectStart = null;
    _clearRectPreview();
  }
}

/** End the current drag session; commits rect fill if applicable. */
function editorDragStop() {
  if (_editorDragMode === "none") return;
  if (_editorDragMode === "rect" && _editorRectStart) {
    _commitRectFill();
  }
  _clearRectPreview();
  _editorDragMode = "none";
  _editorRectStart = null;
  _editorDragLastKey = null;
  _editorDragUndoCaptured = false;
}

/** Called each animation frame; handles continuous paint/erase/rect-preview. */
function tickEditorDrag() {
  if (_editorDragMode === "none") return;

  if (_editorDragMode === "paint") {
    var pos = _getGhostPlacementPos();
    if (!pos) return;
    var key = pos.x + "," + pos.y + "," + pos.z;
    if (key === _editorDragLastKey) return;
    if (!_isValidPlacementPos(pos.x, pos.y, pos.z)) return;
    if (!_editorDragUndoCaptured) {
      _pushUndo();
      _editorDragUndoCaptured = true;
    }
    var entry = EDITOR_PALETTE[editorSelectedIdx];
    var block = createBlockMesh(new THREE.Color(entry.hex));
    block.name = "landed_block";
    block.position.set(pos.x, pos.y, pos.z);
    worldGroup.add(block);
    registerBlock(block);
    _editorDragLastKey = key;
    if (typeof playPlaceSound === "function") playPlaceSound();
    if (typeof editorTutorialNotifyBlockPlaced === "function") editorTutorialNotifyBlockPlaced();

  } else if (_editorDragMode === "erase") {
    if (!targetedBlock || targetedBlock.name !== "landed_block") return;
    var wp = new THREE.Vector3();
    targetedBlock.getWorldPosition(wp);
    var eraseKey = wp.x + "," + wp.y + "," + wp.z;
    if (eraseKey === _editorDragLastKey) return;
    if (!_editorDragUndoCaptured) {
      _pushUndo();
      _editorDragUndoCaptured = true;
    }
    var b = targetedBlock;
    unregisterBlock(b);
    if (typeof disposeBlock === "function") disposeBlock(b);
    worldGroup.remove(b);
    if (typeof obsidianBlocks !== "undefined") {
      var oi = obsidianBlocks.indexOf(b);
      if (oi !== -1) obsidianBlocks.splice(oi, 1);
    }
    _editorDragLastKey = eraseKey;
    targetedBlock = null;
    if (typeof unhighlightTarget === "function") unhighlightTarget();

  } else if (_editorDragMode === "rect") {
    var rPos = _getGhostPlacementPos();
    if (!rPos) return;
    if (!_editorRectStart) {
      _editorRectStart = { x: rPos.x, y: rPos.y, z: rPos.z };
    }
    _updateRectPreview(rPos);
  }
}

function _updateRectPreview(curPos) {
  _clearRectPreview();
  if (!_editorRectStart) return;
  var y = _editorRectStart.y;
  var x0 = Math.min(_editorRectStart.x, curPos.x);
  var x1 = Math.max(_editorRectStart.x, curPos.x);
  var z0 = Math.min(_editorRectStart.z, curPos.z);
  var z1 = Math.max(_editorRectStart.z, curPos.z);
  var hexColor = EDITOR_PALETTE[editorSelectedIdx].hex;
  for (var rx = x0; rx <= x1; rx += BLOCK_SIZE) {
    for (var rz = z0; rz <= z1; rz += BLOCK_SIZE) {
      var geo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
      var mat = new THREE.MeshBasicMaterial({
        color: hexColor, transparent: true, opacity: 0.35, depthWrite: false
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(rx, y, rz);
      mesh.name = "editor_rect_preview";
      scene.add(mesh);
      _editorRectPreview.push(mesh);
    }
  }
}

function _clearRectPreview() {
  _editorRectPreview.forEach(function (m) {
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
    scene.remove(m);
  });
  _editorRectPreview = [];
}

function _commitRectFill() {
  if (!_editorRectStart) return;
  var curPos = _getGhostPlacementPos() || _editorRectStart;
  var y = _editorRectStart.y;
  var x0 = Math.min(_editorRectStart.x, curPos.x);
  var x1 = Math.max(_editorRectStart.x, curPos.x);
  var z0 = Math.min(_editorRectStart.z, curPos.z);
  var z1 = Math.max(_editorRectStart.z, curPos.z);
  _pushUndo();
  var entry = EDITOR_PALETTE[editorSelectedIdx];
  for (var fx = x0; fx <= x1; fx += BLOCK_SIZE) {
    for (var fz = z0; fz <= z1; fz += BLOCK_SIZE) {
      if (!_isValidPlacementPos(fx, y, fz)) continue;
      var block = createBlockMesh(new THREE.Color(entry.hex));
      block.name = "landed_block";
      block.position.set(fx, y, fz);
      worldGroup.add(block);
      registerBlock(block);
    }
  }
  var count = Math.round((x1 - x0 + 1) * (z1 - z0 + 1));
  _flashEditorStatus("Filled " + count + " block" + (count === 1 ? "" : "s"));
}

// ── Row copy / paste ──────────────────────────────────────────────────────────

/** Copy all blocks at the targeted block's Y level to the row clipboard. */
function editorCopyRow() {
  if (!targetedBlock) {
    _flashEditorStatus("Aim at a block to copy its row");
    return;
  }
  var wp = new THREE.Vector3();
  targetedBlock.getWorldPosition(wp);
  var srcY = wp.y;
  var blocks = [];
  worldGroup.children.forEach(function (c) {
    if (c.name === "landed_block") {
      var bwp = new THREE.Vector3();
      c.getWorldPosition(bwp);
      if (Math.abs(bwp.y - srcY) < 0.1) {
        blocks.push({ x: bwp.x, z: bwp.z, color: c.userData.canonicalColor });
      }
    }
  });
  if (blocks.length === 0) return;
  _editorRowClipboard = { blocks: blocks, srcY: srcY };
  _flashEditorStatus("Copied row (" + blocks.length + " block" + (blocks.length === 1 ? "" : "s") + ")");
}

/** Paste the copied row at the targeted block's Y (or ground Y if none targeted). */
function editorPasteRow() {
  if (!_editorRowClipboard) {
    _flashEditorStatus("Nothing to paste — copy a row first");
    return;
  }
  var pos = _getGhostPlacementPos();
  var destY = pos ? pos.y : _editorRowClipboard.srcY;
  _pushUndo();
  _editorRowClipboard.blocks.forEach(function (b) {
    if (!_isValidPlacementPos(b.x, destY, b.z)) return;
    var block = createBlockMesh(new THREE.Color(b.color));
    block.name = "landed_block";
    block.position.set(b.x, destY, b.z);
    worldGroup.add(block);
    registerBlock(block);
  });
  _flashEditorStatus("Pasted row at Y=" + destY);
}

// ── Mirror ────────────────────────────────────────────────────────────────────

/** Flip all blocks horizontally (mirror X around their X centroid). */
function editorMirrorH() {
  var snap = _captureEditorSnapshot();
  if (snap.length === 0) return;
  var sumX = snap.reduce(function (a, b) { return a + b.x; }, 0);
  var centerX = Math.round(sumX / snap.length);
  _pushUndo(snap);
  _restoreEditorSnapshot(snap.map(function (b) {
    return { x: 2 * centerX - b.x, y: b.y, z: b.z, color: b.color };
  }));
  _flashEditorStatus("Mirrored H");
}

/** Flip all blocks vertically (mirror Z around their Z centroid). */
function editorMirrorV() {
  var snap = _captureEditorSnapshot();
  if (snap.length === 0) return;
  var sumZ = snap.reduce(function (a, b) { return a + b.z; }, 0);
  var centerZ = Math.round(sumZ / snap.length);
  _pushUndo(snap);
  _restoreEditorSnapshot(snap.map(function (b) {
    return { x: b.x, y: b.y, z: 2 * centerZ - b.z, color: b.color };
  }));
  _flashEditorStatus("Mirrored V");
}

// ── Grid guidelines ───────────────────────────────────────────────────────────

/** Toggle a subtle grid overlay at Y≈0 for block alignment. */
function editorToggleGrid() {
  _editorGridVisible = !_editorGridVisible;
  if (_editorGridVisible) {
    if (!_editorGridHelper) {
      _editorGridHelper = new THREE.GridHelper(WORLD_SIZE, WORLD_SIZE, 0x333333, 0x222222);
      _editorGridHelper.position.y = 0.02;
      _editorGridHelper.name = "editor_grid";
      scene.add(_editorGridHelper);
    }
    _editorGridHelper.visible = true;
  } else if (_editorGridHelper) {
    _editorGridHelper.visible = false;
  }
  var btn = document.getElementById("editor-grid-btn");
  if (btn) btn.classList.toggle("editor-btn-active", _editorGridVisible);
  _flashEditorStatus(_editorGridVisible ? "Grid on" : "Grid off");
}

// ── Palette definition ────────────────────────────────────────────────────────
// 9 block types mapped to keys 1–9, each with canonical hex color (matching COLORS/COLOR_TO_MATERIAL).
const EDITOR_PALETTE = [
  { name: "Dirt",     hex: 0x8b4513 },
  { name: "Stone",    hex: 0x808080 },
  { name: "Gold",     hex: 0xffff00 },
  { name: "Ice",      hex: 0x00ffff },
  { name: "Moss",     hex: 0x008000 },
  { name: "Lava",     hex: 0xff0000 },
  { name: "Crystal",  hex: 0x800080 },
  { name: "Diamond",  hex: 0x1a237e },
  { name: "Obsidian", hex: 0x1a0020 },
];

let editorSelectedIdx = 0;
let editorGhostMesh = null;

// ── Ghost block ───────────────────────────────────────────────────────────────

function _createEditorGhost() {
  const geo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  const mat = new THREE.MeshBasicMaterial({
    color: EDITOR_PALETTE[editorSelectedIdx].hex,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "editor_ghost";
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

function _getGhostPlacementPos() {
  if (targetedBlock && targetedFaceNormal) {
    const blockPos = new THREE.Vector3();
    targetedBlock.getWorldPosition(blockPos);
    return {
      x: snapGrid(blockPos.x + targetedFaceNormal.x * BLOCK_SIZE),
      y: snapGridY(blockPos.y + targetedFaceNormal.y * BLOCK_SIZE),
      z: snapGrid(blockPos.z + targetedFaceNormal.z * BLOCK_SIZE),
    };
  } else if (groundPlacementPoint) {
    return {
      x: snapGrid(groundPlacementPoint.x),
      y: 0.5,
      z: snapGrid(groundPlacementPoint.z),
    };
  }
  return null;
}

function _isValidPlacementPos(px, py, pz) {
  if (py < 0.5) return false;
  const layer = gridOccupancy.get(py);
  if (layer && layer.has(px + "," + pz)) return false;
  if (controls) {
    const pp = controls.getObject().position;
    if (
      Math.abs(px - pp.x) < PLAYER_RADIUS + 0.5 &&
      Math.abs(pz - pp.z) < PLAYER_RADIUS + 0.5 &&
      Math.abs(py - pp.y) < PLAYER_HEIGHT / 2 + 0.5
    ) return false;
  }
  return true;
}

/** Call each animation frame while in editor mode to update ghost position and color. */
function updateEditorGhost() {
  if (!editorGhostMesh) return;
  const pos = _getGhostPlacementPos();
  if (pos && _isValidPlacementPos(pos.x, pos.y, pos.z)) {
    editorGhostMesh.position.set(pos.x, pos.y, pos.z);
    editorGhostMesh.material.color.setHex(EDITOR_PALETTE[editorSelectedIdx].hex);
    editorGhostMesh.visible = true;
  } else {
    editorGhostMesh.visible = false;
  }
}

// ── Block palette actions ─────────────────────────────────────────────────────

/** Select a palette entry by 0-based index. */
function selectEditorBlock(idx) {
  if (idx < 0 || idx >= EDITOR_PALETTE.length) return;
  editorSelectedIdx = idx;
  if (editorGhostMesh) {
    editorGhostMesh.material.color.setHex(EDITOR_PALETTE[editorSelectedIdx].hex);
  }
  renderEditorPaletteHUD();
}

/** Place the selected palette block at the current ghost position (free — no inventory cost). */
function editorPlaceBlock() {
  const pos = _getGhostPlacementPos();
  if (!pos) return;
  if (!_isValidPlacementPos(pos.x, pos.y, pos.z)) return;

  const entry = EDITOR_PALETTE[editorSelectedIdx];
  const block = createBlockMesh(new THREE.Color(entry.hex));
  block.name = "landed_block";
  block.position.set(pos.x, pos.y, pos.z);
  worldGroup.add(block);
  registerBlock(block);

  if (typeof playPlaceSound === "function") playPlaceSound();
  if (typeof editorTutorialNotifyBlockPlaced === "function") editorTutorialNotifyBlockPlaced();
}

/** Instantly remove the targeted block (no mining animation). Pushes undo. */
function editorEraseBlock() {
  if (!targetedBlock || targetedBlock.name !== "landed_block") return;
  _pushUndo();
  var b = targetedBlock;
  unregisterBlock(b);
  if (typeof disposeBlock === "function") disposeBlock(b);
  worldGroup.remove(b);
  if (typeof obsidianBlocks !== "undefined") {
    var idx = obsidianBlocks.indexOf(b);
    if (idx !== -1) obsidianBlocks.splice(idx, 1);
  }
  targetedBlock = null;
  if (typeof unhighlightTarget === "function") unhighlightTarget();
}

// ── Palette HUD ───────────────────────────────────────────────────────────────

/** Build / refresh the palette HUD strip. */
function renderEditorPaletteHUD() {
  const container = document.getElementById("editor-palette");
  if (!container) return;
  container.innerHTML = "";
  EDITOR_PALETTE.forEach(function (entry, i) {
    const slot = document.createElement("div");
    slot.className = "editor-palette-slot" + (i === editorSelectedIdx ? " editor-palette-selected" : "");
    slot.title = entry.name;

    const swatch = document.createElement("div");
    swatch.className = "editor-palette-swatch";
    swatch.style.background = "#" + entry.hex.toString(16).padStart(6, "0");

    const label = document.createElement("div");
    label.className = "editor-palette-key";
    label.textContent = String(i + 1);

    const name = document.createElement("div");
    name.className = "editor-palette-name";
    name.textContent = entry.name;

    slot.appendChild(swatch);
    slot.appendChild(label);
    slot.appendChild(name);
    container.appendChild(slot);
  });
}

// ── Win condition builder ─────────────────────────────────────────────────────

/** Get the player-facing preview text for the current win condition. */
function getWinConditionPreviewText() {
  const mode = editorWinCondition.mode;
  const n = editorWinCondition.n;
  if (mode === "mine_all") {
    let blockCount = 0;
    if (typeof worldGroup !== "undefined") {
      worldGroup.children.forEach(function (c) {
        if (c.name === "landed_block") blockCount++;
      });
    }
    return "Mine all " + blockCount + " block" + (blockCount === 1 ? "" : "s") + "!";
  }
  if (mode === "clear_lines") return "Clear " + n + " line" + (n === 1 ? "" : "s") + "!";
  if (mode === "survive_seconds") return "Survive " + n + " second" + (n === 1 ? "" : "s") + "!";
  if (mode === "score_points") return "Score " + n.toLocaleString() + " points!";
  return "";
}

/** Build / refresh the win condition builder panel inside #editor-win-condition. */
function renderWinConditionBuilder() {
  const container = document.getElementById("editor-win-condition");
  if (!container) return;

  const mode = editorWinCondition.mode;
  const n = editorWinCondition.n;
  const needsN = mode !== "mine_all";

  container.innerHTML =
    '<div class="editor-wc-label">WIN CONDITION</div>' +
    '<div class="editor-wc-row">' +
      '<select id="editor-wc-mode" class="editor-wc-select">' +
        '<option value="mine_all"' + (mode === "mine_all" ? " selected" : "") + '>Mine All Blocks</option>' +
        '<option value="clear_lines"' + (mode === "clear_lines" ? " selected" : "") + '>Clear N Lines</option>' +
        '<option value="survive_seconds"' + (mode === "survive_seconds" ? " selected" : "") + '>Survive N Secs</option>' +
        '<option value="score_points"' + (mode === "score_points" ? " selected" : "") + '>Score N Points</option>' +
      '</select>' +
      '<input type="number" id="editor-wc-n" class="editor-wc-n" min="1" max="9999" value="' + n + '"' +
        (needsN ? "" : ' style="display:none"') + '>' +
    '</div>' +
    '<div id="editor-wc-preview" class="editor-wc-preview">' + getWinConditionPreviewText() + '</div>';

  var modeSelect = document.getElementById("editor-wc-mode");
  if (modeSelect) {
    modeSelect.addEventListener("change", function () {
      editorWinCondition.mode = this.value;
      var nInput = document.getElementById("editor-wc-n");
      if (nInput) nInput.style.display = editorWinCondition.mode === "mine_all" ? "none" : "";
      var previewEl = document.getElementById("editor-wc-preview");
      if (previewEl) previewEl.textContent = getWinConditionPreviewText();
    });
  }

  var nInput = document.getElementById("editor-wc-n");
  if (nInput) {
    nInput.addEventListener("input", function () {
      var val = parseInt(this.value, 10);
      if (!isNaN(val) && val >= 1 && val <= 9999) {
        editorWinCondition.n = val;
        var previewEl = document.getElementById("editor-wc-preview");
        if (previewEl) previewEl.textContent = getWinConditionPreviewText();
      }
    });
  }
}

// ── Metadata panel ────────────────────────────────────────────────────────────

/** Build / refresh the puzzle metadata panel inside #editor-metadata. */
function renderMetadataPanel() {
  var container = document.getElementById("editor-metadata");
  if (!container) return;

  var m = editorPuzzleMetadata;

  container.innerHTML =
    '<div class="editor-meta-label">PUZZLE INFO</div>' +
    '<div class="editor-meta-row">' +
      '<label class="editor-meta-field-label">Name <span class="editor-meta-required">*</span></label>' +
      '<div class="editor-meta-field-wrap">' +
        '<input id="editor-meta-name" class="editor-meta-input" type="text" maxlength="40" ' +
               'placeholder="Puzzle name…" value="' + _escAttr(m.name) + '">' +
        '<span class="editor-meta-counter" id="editor-meta-name-count">' + m.name.length + '/40</span>' +
      '</div>' +
    '</div>' +
    '<div class="editor-meta-row">' +
      '<label class="editor-meta-field-label">Desc</label>' +
      '<div class="editor-meta-field-wrap">' +
        '<input id="editor-meta-desc" class="editor-meta-input editor-meta-input-wide" type="text" maxlength="120" ' +
               'placeholder="Short description…" value="' + _escAttr(m.description) + '">' +
        '<span class="editor-meta-counter" id="editor-meta-desc-count">' + m.description.length + '/120</span>' +
      '</div>' +
    '</div>' +
    '<div class="editor-meta-row">' +
      '<label class="editor-meta-field-label">Author</label>' +
      '<div class="editor-meta-field-wrap">' +
        '<input id="editor-meta-author" class="editor-meta-input" type="text" maxlength="20" ' +
               'placeholder="Your name…" value="' + _escAttr(m.author) + '">' +
        '<span class="editor-meta-counter" id="editor-meta-author-count">' + m.author.length + '/20</span>' +
      '</div>' +
    '</div>' +
    '<div class="editor-meta-row">' +
      '<label class="editor-meta-field-label">Diff</label>' +
      '<div class="editor-meta-stars" id="editor-meta-stars">' +
        _buildStarButtons(m.difficulty) +
      '</div>' +
    '</div>';

  // Wire up name input
  var nameInput = document.getElementById("editor-meta-name");
  if (nameInput) {
    nameInput.addEventListener("input", function () {
      editorPuzzleMetadata.name = this.value.slice(0, 40);
      var c = document.getElementById("editor-meta-name-count");
      if (c) c.textContent = editorPuzzleMetadata.name.length + "/40";
      _updateShareBtnState();
    });
  }

  // Wire up description input
  var descInput = document.getElementById("editor-meta-desc");
  if (descInput) {
    descInput.addEventListener("input", function () {
      editorPuzzleMetadata.description = this.value.slice(0, 120);
      var c = document.getElementById("editor-meta-desc-count");
      if (c) c.textContent = editorPuzzleMetadata.description.length + "/120";
    });
  }

  // Wire up author input
  var authorInput = document.getElementById("editor-meta-author");
  if (authorInput) {
    authorInput.addEventListener("input", function () {
      editorPuzzleMetadata.author = this.value.slice(0, 20);
      var c = document.getElementById("editor-meta-author-count");
      if (c) c.textContent = editorPuzzleMetadata.author.length + "/20";
    });
  }

  // Wire up star buttons
  _wireStarButtons();
  _updateShareBtnState();
}

function _buildStarButtons(selected) {
  var out = "";
  for (var i = 1; i <= 3; i++) {
    out += '<button class="editor-meta-star' + (i <= selected ? " editor-meta-star-on" : "") +
           '" data-star="' + i + '" type="button">' +
           (i <= selected ? "★" : "☆") + '</button>';
  }
  return out;
}

function _wireStarButtons() {
  var container = document.getElementById("editor-meta-stars");
  if (!container) return;
  container.querySelectorAll(".editor-meta-star").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var val = parseInt(this.getAttribute("data-star"), 10);
      // Clicking the already-selected star deselects (sets to 0)
      editorPuzzleMetadata.difficulty = (editorPuzzleMetadata.difficulty === val) ? 0 : val;
      var starsEl = document.getElementById("editor-meta-stars");
      if (starsEl) starsEl.innerHTML = _buildStarButtons(editorPuzzleMetadata.difficulty);
      _wireStarButtons();
    });
  });
}

/** Escape a string for use in an HTML attribute value. */
function _escAttr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Enable or disable share button based on whether puzzle name is filled in. */
function _updateShareBtnState() {
  var shareBtn = document.getElementById("editor-share-btn");
  if (!shareBtn) return;
  var hasName = editorPuzzleMetadata.name.trim().length > 0;
  shareBtn.disabled = !hasName;
  shareBtn.title = hasName ? "" : "Enter a puzzle name to share";
  shareBtn.style.opacity = hasName ? "" : "0.45";
}

// ── Piece sequence panel ──────────────────────────────────────────────────────

/** Build / refresh the piece sequence panel inside #editor-piece-sequence. */
function renderPieceSequencePanel() {
  var container = document.getElementById("editor-piece-sequence");
  if (!container) return;

  var mode = editorPieceSequence.mode;
  var pieces = editorPieceSequence.pieces;
  var isFixed = mode === "fixed";

  var html = '<div class="editor-seq-label">PIECE SEQUENCE</div>';
  html += '<div class="editor-seq-toggle">';
  html += '<button class="editor-seq-mode-btn' + (mode === "random" ? " editor-seq-mode-active" : "") + '" data-mode="random">Random</button>';
  html += '<button class="editor-seq-mode-btn' + (mode === "fixed" ? " editor-seq-mode-active" : "") + '" data-mode="fixed">Fixed</button>';
  html += '</div>';

  if (isFixed) {
    // Piece type picker buttons
    html += '<div class="editor-seq-picker">';
    for (var i = 1; i <= 7; i++) {
      var hexStr = "#" + _SEQ_PIECE_COLORS[i].toString(16).padStart(6, "0");
      html += '<button class="editor-seq-piece-btn" data-piece="' + i + '" style="background:' + hexStr + '" title="Add ' + _SEQ_PIECE_NAMES[i] + '-piece">' + _SEQ_PIECE_NAMES[i] + '</button>';
    }
    html += '</div>';

    // Sequence items (click to remove)
    html += '<div class="editor-seq-list">';
    if (pieces.length === 0) {
      html += '<span class="editor-seq-empty">Click pieces above to add</span>';
    } else {
      for (var j = 0; j < pieces.length; j++) {
        var p = pieces[j];
        var pc = "#" + _SEQ_PIECE_COLORS[p].toString(16).padStart(6, "0");
        html += '<button class="editor-seq-item" data-idx="' + j + '" style="background:' + pc + '" title="Remove">' + _SEQ_PIECE_NAMES[p] + '</button>';
      }
    }
    html += '</div>';

    // Count + clear
    html += '<div class="editor-seq-footer">';
    html += '<span class="editor-seq-count">' + pieces.length + ' piece' + (pieces.length === 1 ? "" : "s") + (pieces.length > 0 ? " · loops" : "") + '</span>';
    if (pieces.length > 0) {
      html += '<button class="editor-seq-clear-btn">Clear</button>';
    }
    html += '</div>';

    // Preview: first 5 pieces
    if (pieces.length > 0) {
      html += '<div class="editor-seq-preview">';
      var previewCount = Math.min(5, pieces.length);
      for (var k = 0; k < previewCount; k++) {
        var pi = pieces[k];
        var pc2 = "#" + _SEQ_PIECE_COLORS[pi].toString(16).padStart(6, "0");
        html += '<div class="editor-seq-preview-item" style="border-color:' + pc2 + ';color:' + pc2 + '">' + _SEQ_PIECE_NAMES[pi] + '</div>';
      }
      if (pieces.length > 5) {
        html += '<div class="editor-seq-preview-more">+' + (pieces.length - 5) + '</div>';
      }
      html += '</div>';
    }
  } else {
    html += '<div class="editor-seq-random-note">Players receive random pieces</div>';
  }

  container.innerHTML = html;

  // Wire mode toggle buttons
  container.querySelectorAll(".editor-seq-mode-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      editorPieceSequence.mode = this.getAttribute("data-mode");
      renderPieceSequencePanel();
    });
  });

  // Wire piece-add buttons
  container.querySelectorAll(".editor-seq-piece-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var p = parseInt(this.getAttribute("data-piece"), 10);
      editorPieceSequence.pieces.push(p);
      renderPieceSequencePanel();
    });
  });

  // Wire sequence-item remove buttons
  container.querySelectorAll(".editor-seq-item").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var idx = parseInt(this.getAttribute("data-idx"), 10);
      editorPieceSequence.pieces.splice(idx, 1);
      renderPieceSequencePanel();
    });
  });

  // Wire clear button
  var clearBtn = container.querySelector(".editor-seq-clear-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      editorPieceSequence.pieces = [];
      renderPieceSequencePanel();
    });
  }
}

/** Encode current editor layout + win condition into a compact URL-safe share code. */
function encodePuzzleShareCode() {
  if (typeof puzzleCodecEncode !== "function") return null;
  var blocks = [];
  if (typeof worldGroup !== "undefined") {
    worldGroup.children.forEach(function (child) {
      if (child.name === "landed_block") {
        var wp = new THREE.Vector3();
        child.getWorldPosition(wp);
        var hexInt = 0;
        if (child.material && child.material.color) {
          hexInt = child.material.color.getHex();
        }
        var paletteIdx = 0;
        for (var i = 0; i < EDITOR_PALETTE.length; i++) {
          if (EDITOR_PALETTE[i].hex === hexInt) { paletteIdx = i; break; }
        }
        blocks.push([Math.round(wp.x), Math.round(wp.y * 10) / 10, Math.round(wp.z), paletteIdx]);
      }
    });
  }
  return puzzleCodecEncode({
    winCondition: { mode: editorWinCondition.mode, n: editorWinCondition.n },
    blocks: blocks,
    metadata: {
      name:        editorPuzzleMetadata.name,
      description: editorPuzzleMetadata.description,
      author:      editorPuzzleMetadata.author,
      difficulty:  editorPuzzleMetadata.difficulty,
    },
    pieceSequence: { mode: editorPieceSequence.mode, pieces: editorPieceSequence.pieces.slice() },
  });
}

/**
 * Decode a share code. Returns { winCondition, blocks, metadata } or null if invalid.
 * For richer error info (version mismatch vs. corrupted), use puzzleCodecDecode() directly.
 */
function decodePuzzleShareCode(code) {
  if (typeof puzzleCodecDecode !== "function") return null;
  var result = puzzleCodecDecode(code);
  if (!result.ok) return null;
  return { winCondition: result.winCondition, blocks: result.blocks, metadata: result.metadata };
}

// ── Init / cleanup ────────────────────────────────────────────────────────────

/** Call when entering editor mode. */
function initEditorMode() {
  editorSelectedIdx = 0;
  _editorAutosaveTimer = 0;
  editorPuzzleMetadata = { name: "", description: "", author: "", difficulty: 0 };
  editorPieceSequence = { mode: "random", pieces: [] };
  // Reset undo/redo, drag, and tool state
  _editorUndoStack = [];
  _editorRedoStack = [];
  _editorDragMode = "none";
  _editorDragLastKey = null;
  _editorDragUndoCaptured = false;
  _editorRectStart = null;
  _clearRectPreview();
  _editorShiftDown = false;
  _editorRowClipboard = null;
  _updateUndoRedoBtns();
  if (!editorGhostMesh) {
    editorGhostMesh = _createEditorGhost();
  } else {
    editorGhostMesh.visible = false;
    editorGhostMesh.material.color.setHex(EDITOR_PALETTE[editorSelectedIdx].hex);
  }
  renderEditorPaletteHUD();
  renderWinConditionBuilder();
  renderMetadataPanel();
  renderPieceSequencePanel();

  // Apply loaded draft if one was queued by the draft prompt
  if (_pendingEditorDraft) {
    applyEditorDraft(_pendingEditorDraft);
    _pendingEditorDraft = null;
  }

  // Start first-time onboarding tutorial (no-op if already seen)
  if (typeof initEditorTutorial === "function") initEditorTutorial();
}

/** Call when leaving editor mode (reset / exit). */
function cleanupEditorMode() {
  // Final autosave before the world is cleared by resetGame
  saveEditorDraft();
  if (editorGhostMesh) {
    editorGhostMesh.visible = false;
  }
  // Stop any in-progress drag and clean up rect preview
  _editorDragMode = "none";
  _clearRectPreview();
  // Remove grid helper
  if (_editorGridHelper) {
    scene.remove(_editorGridHelper);
    _editorGridHelper.geometry.dispose();
    if (Array.isArray(_editorGridHelper.material)) {
      _editorGridHelper.material.forEach(function (m) { m.dispose(); });
    } else if (_editorGridHelper.material) {
      _editorGridHelper.material.dispose();
    }
    _editorGridHelper = null;
    _editorGridVisible = false;
  }
  const container = document.getElementById("editor-palette");
  if (container) container.innerHTML = "";
}

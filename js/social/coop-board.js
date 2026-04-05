// js/social/coop-board.js — Co-op wide-board helpers.
// Provides getLineClearCellsNeeded() (called by lineclear.js) and the center-line
// divider mesh shown at the midpoint of the 16-column shared board.
// Requires: config.js, state.js, Three.js.

// ─── Line-clear cell threshold hook ──────────────────────────────────────────

/**
 * Returns the number of occupied cells required to trigger a line clear.
 * In co-op wide-board mode the board is 16 × 10 = 160 cells;
 * otherwise falls back to the standard 10 × 10 = 100 cells.
 * Called by lineclear.js's checkLineClear().
 */
function getLineClearCellsNeeded() {
  if (typeof isCoopWideBoard !== 'undefined' && isCoopWideBoard) {
    return typeof COOP_BOARD_CELLS_NEEDED !== 'undefined' ? COOP_BOARD_CELLS_NEEDED : 160;
  }
  return typeof LINE_CLEAR_CELLS_NEEDED !== 'undefined' ? LINE_CLEAR_CELLS_NEEDED : 100;
}

// ─── Center divider ───────────────────────────────────────────────────────────

let _coopDividerMesh = null;

/**
 * Spawn the translucent center-line divider that marks the boundary between
 * the host's half (X ≤ 0) and the guest's half (X ≥ 1) of the wide board.
 * The divider runs at X = 0.5 across the full Z depth and full height.
 */
function coopBoardShowDivider() {
  if (_coopDividerMesh) return; // already spawned

  const zDepth = 10; // board Z rows (-4 … +5), same as standard
  const boardHeight = 22;
  const geo = new THREE.PlaneGeometry(zDepth, boardHeight);

  // Rotate to stand in the XZ plane at the board midpoint
  // We want the plane face the +X direction, standing vertically.
  const mat = new THREE.MeshBasicMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  _coopDividerMesh = new THREE.Mesh(geo, mat);
  // Center the Z across the board (-4 … +5 → center at +0.5)
  _coopDividerMesh.position.set(0.5, boardHeight / 2 - 0.5, 0.5);
  _coopDividerMesh.rotation.y = Math.PI / 2; // face along Z-axis
  if (typeof scene !== 'undefined') {
    scene.add(_coopDividerMesh);
  }
}

/**
 * Remove the center divider from the scene and dispose resources.
 */
function coopBoardHideDivider() {
  if (!_coopDividerMesh) return;
  if (typeof scene !== 'undefined') scene.remove(_coopDividerMesh);
  if (_coopDividerMesh.geometry) _coopDividerMesh.geometry.dispose();
  if (_coopDividerMesh.material) _coopDividerMesh.material.dispose();
  _coopDividerMesh = null;
}

// ─── Spawn-range helpers ──────────────────────────────────────────────────────

/**
 * Returns a random spawn X for a co-op piece.
 * Host (isCoopHost = true)  → left half:  -7 … 0
 * Guest (isCoopHost = false) → right half:  1 … 8
 */
function coopBoardSpawnX(isCoopHost) {
  const _rngFn = typeof _rng === 'function' ? _rng : Math.random;
  if (isCoopHost) {
    // Left half: -7 to 0 → range of 7.5, centred at -3.5
    return Math.round(_rngFn() * 7) - 7; // -7 … 0
  } else {
    // Right half: 1 to 8 → range of 7
    return Math.round(_rngFn() * 7) + 1; // 1 … 8
  }
}

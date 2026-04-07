// js/social/coop-highlight.js — Co-op column highlight zone manager.
// Each player can press N to mark the column under their feet as their working zone.
// A translucent plane spans the full board height at that X position for both players.
// Highlights expire after 5 s and fade during the last second.
// Requires: Three.js (global), state.js (isCoopMode, controls, isGameOver),
//           social/coop.js (coop, CoopState).

const COOP_HIGHLIGHT_DURATION     = 5.0;        // seconds before highlight expires
const COOP_HIGHLIGHT_MY_COLOR     = 0x00ffff;   // cyan  — local player
const COOP_HIGHLIGHT_PARTNER_COLOR = 0xff8800;  // amber — partner

const _COOP_HL_HEIGHT  = 22;   // matches coopBoardShowDivider height
const _COOP_HL_Z_DEPTH = 10;   // board Z extent (-4 … +5)
const _COOP_HL_Z_CTR   = 0.5;  // Z centre of the board

// Module-private state
let _myMesh       = null;
let _partnerMesh  = null;
let _myTimer      = 0;    // seconds remaining on local highlight
let _partnerTimer = 0;    // seconds remaining on partner highlight
let _myCol        = -1;   // current local highlighted column (-1 = none)
let _partnerCol   = -1;   // current partner highlighted column (-1 = none)

// ── Helpers ───────────────────────────────────────────────────────────────────

function _makeMesh(color) {
  const geo = new THREE.PlaneGeometry(_COOP_HL_Z_DEPTH, _COOP_HL_HEIGHT);
  const mat = new THREE.MeshBasicMaterial({
    color:       color,
    transparent: true,
    opacity:     0.18,
    side:        THREE.DoubleSide,
    depthWrite:  false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = Math.PI / 2;
  return mesh;
}

function _placeMesh(mesh, col) {
  mesh.position.set(col, _COOP_HL_HEIGHT / 2 - 0.5, _COOP_HL_Z_CTR);
}

function _addMesh(mesh) {
  if (typeof scene !== 'undefined') scene.add(mesh);
}

function _disposeMesh(mesh) {
  if (typeof scene !== 'undefined') scene.remove(mesh);
  if (mesh.geometry) mesh.geometry.dispose();
  if (mesh.material) mesh.material.dispose();
}

function _updateHUD() {
  const hudEl = document.getElementById('coop-highlight-hud');
  if (!hudEl) return;

  const myEl      = document.getElementById('coop-my-highlight');
  const partnerEl = document.getElementById('coop-partner-highlight');

  if (myEl) {
    myEl.style.display = (_myTimer > 0) ? '' : 'none';
    const colEl = myEl.querySelector('.coop-hl-col');
    if (colEl) colEl.textContent = _myCol;
  }
  if (partnerEl) {
    partnerEl.style.display = (_partnerTimer > 0) ? '' : 'none';
    const colEl = partnerEl.querySelector('.coop-hl-col');
    if (colEl) colEl.textContent = _partnerCol;
  }

  hudEl.style.display = (_myTimer > 0 || _partnerTimer > 0) ? '' : 'none';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Triggered when the local player presses N in co-op mode.
 * Marks the column at the player's current X position.
 */
function triggerCoopHighlight() {
  if (!isCoopMode) return;
  if (typeof coop === 'undefined' || coop.state !== CoopState.IN_GAME) return;
  if (!controls || !controls.isLocked || isGameOver) return;

  const col = Math.round(controls.getObject().position.x);
  _myCol   = col;
  _myTimer = COOP_HIGHLIGHT_DURATION;

  if (_myMesh) { _disposeMesh(_myMesh); _myMesh = null; }
  _myMesh = _makeMesh(COOP_HIGHLIGHT_MY_COLOR);
  _placeMesh(_myMesh, col);
  _addMesh(_myMesh);

  coop.send({ type: 'highlight', col: col });
  _updateHUD();
}

/**
 * Called when a 'highlight' message arrives from the partner.
 * @param {number} col  Board X column to highlight.
 */
function receiveCoopHighlight(col) {
  _partnerCol   = col;
  _partnerTimer = COOP_HIGHLIGHT_DURATION;

  if (_partnerMesh) { _disposeMesh(_partnerMesh); _partnerMesh = null; }
  _partnerMesh = _makeMesh(COOP_HIGHLIGHT_PARTNER_COLOR);
  _placeMesh(_partnerMesh, col);
  _addMesh(_partnerMesh);

  _updateHUD();
}

/**
 * Per-frame tick — counts down timers and fades out meshes in the last second.
 * Called from game-loop.js animate() while isCoopMode is true.
 * @param {number} delta  Seconds since last frame.
 */
function tickCoopHighlight(delta) {
  if (_myTimer > 0) {
    _myTimer -= delta;
    if (_myTimer <= 0) {
      _myTimer = 0;
      _myCol   = -1;
      if (_myMesh) { _disposeMesh(_myMesh); _myMesh = null; }
    } else if (_myMesh) {
      _myMesh.material.opacity = 0.18 * Math.min(_myTimer, 1.0);
    }
    _updateHUD();
  }

  if (_partnerTimer > 0) {
    _partnerTimer -= delta;
    if (_partnerTimer <= 0) {
      _partnerTimer = 0;
      _partnerCol   = -1;
      if (_partnerMesh) { _disposeMesh(_partnerMesh); _partnerMesh = null; }
    } else if (_partnerMesh) {
      _partnerMesh.material.opacity = 0.18 * Math.min(_partnerTimer, 1.0);
    }
    _updateHUD();
  }
}

/**
 * Clear all highlights and reset state — called from gamestate-reset.js.
 */
function resetCoopHighlights() {
  _myTimer = 0;  _myCol = -1;
  if (_myMesh)      { _disposeMesh(_myMesh);      _myMesh      = null; }

  _partnerTimer = 0; _partnerCol = -1;
  if (_partnerMesh) { _disposeMesh(_partnerMesh); _partnerMesh = null; }

  _updateHUD();
}

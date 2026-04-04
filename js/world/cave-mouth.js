// Cave mouth — dungeon entry point in Survival world.
// Creates a visible cave entrance structure near spawn, handles proximity detection,
// interaction prompt, tier selection, and return-from-dungeon tracking.

var CAVE_MOUTH_POS = { x: 0, z: 12 };      // Fixed world position (south of spawn)
var CAVE_MOUTH_INTERACT_RANGE = 3.0;         // Distance to show prompt / allow interaction

var _caveMouthMeshes = [];
var _caveMouthPromptVisible = false;
var _caveMouthTierSelectOpen = false;
var _dungeonLaunchedFromSurvival = false;

// ── Spawn / clear ─────────────────────────────────────────────────────────────

/**
 * Spawn the cave mouth structure and environmental decoration into the world.
 * Call when a new Survival world is created or an existing one is restored.
 */
function spawnCaveMouth() {
  clearCaveMouth();

  var cx = CAVE_MOUTH_POS.x;
  var cz = CAVE_MOUTH_POS.z;

  var obsidianMat = new THREE.MeshLambertMaterial({
    color: 0x1a0020,
    emissive: new THREE.Color(0x220033),
  });
  var darkStoneMat = new THREE.MeshLambertMaterial({ color: 0x282832 });
  var stoneMat     = new THREE.MeshLambertMaterial({ color: 0x505058 });
  var railMat      = new THREE.MeshLambertMaterial({ color: 0x888888 });
  var woodMat      = new THREE.MeshLambertMaterial({ color: 0x8b4513 });

  var blockGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

  function placeMesh(geo, mat, x, y, z) {
    var mesh = new THREE.Mesh(geo, mat.clone());
    mesh.position.set(x, y, z);
    mesh.name = 'cave_mouth';
    mesh.userData.isCaveMouth = true;
    mesh.userData.isBedrock = true; // non-minable
    worldGroup.add(mesh);
    _caveMouthMeshes.push(mesh);
    return mesh;
  }

  // Left pillar (2 blocks tall, obsidian)
  placeMesh(blockGeo, obsidianMat, cx - 1, 0.5, cz);
  placeMesh(blockGeo, obsidianMat, cx - 1, 1.5, cz);

  // Right pillar (2 blocks tall, obsidian)
  placeMesh(blockGeo, obsidianMat, cx + 1, 0.5, cz);
  placeMesh(blockGeo, obsidianMat, cx + 1, 1.5, cz);

  // Lintel across the top (3 dark stone blocks)
  placeMesh(blockGeo, darkStoneMat, cx - 1, 2.5, cz);
  placeMesh(blockGeo, darkStoneMat, cx,     2.5, cz);
  placeMesh(blockGeo, darkStoneMat, cx + 1, 2.5, cz);

  // Dark "void" fill in the opening (thin back-plane to suggest depth)
  var openingGeo = new THREE.BoxGeometry(BLOCK_SIZE * 0.95, BLOCK_SIZE * 1.95, BLOCK_SIZE * 0.08);
  var openingMat = new THREE.MeshBasicMaterial({ color: 0x040406 });
  placeMesh(openingGeo, openingMat, cx, 1.0, cz + 0.46);

  // Subtle purple glow spheres inside the arch
  var glowGeo = new THREE.SphereGeometry(0.12, 6, 6);
  var glowMat = new THREE.MeshBasicMaterial({ color: 0x9933ff, transparent: true, opacity: 0.65 });
  placeMesh(glowGeo, glowMat, cx - 0.3, 1.1, cz + 0.3);
  placeMesh(glowGeo, glowMat, cx + 0.25, 0.75, cz + 0.4);
  placeMesh(glowGeo, glowMat, cx,        1.6,  cz + 0.35);

  // Environmental decoration: minecart rail blocks leading into cave
  var railGeo = new THREE.BoxGeometry(BLOCK_SIZE * 0.7, BLOCK_SIZE * 0.08, BLOCK_SIZE);
  placeMesh(railGeo, railMat, cx, 1.04, cz + 1);
  placeMesh(railGeo, railMat, cx, 1.04, cz + 2);
  placeMesh(railGeo, railMat, cx, 1.04, cz + 3);

  // Torch beside the entrance (bright yellow-orange)
  var torchGeo = new THREE.BoxGeometry(0.18, 0.45, 0.18);
  var torchMat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
  placeMesh(torchGeo, torchMat, cx + 1.6, 0.72, cz + 1.2);

  // Signpost to the right of the cave mouth
  var postGeo = new THREE.BoxGeometry(0.12, 0.9, 0.12);
  placeMesh(postGeo, woodMat, cx + 2.2, 0.95, cz + 0.8);
  var signGeo = new THREE.BoxGeometry(1.0, 0.4, 0.1);
  placeMesh(signGeo, woodMat, cx + 2.2, 1.4, cz + 0.8);

  // Stone rubble blocks near the entrance (2–3 half-buried stones)
  var smallGeo = new THREE.BoxGeometry(BLOCK_SIZE * 0.6, BLOCK_SIZE * 0.5, BLOCK_SIZE * 0.6);
  placeMesh(smallGeo, stoneMat, cx - 1.8, 0.25, cz + 1.2);
  placeMesh(smallGeo, stoneMat, cx + 1.6, 0.25, cz + 2.0);
}

/** Remove all cave mouth and decoration meshes from the world. */
function clearCaveMouth() {
  _caveMouthMeshes.forEach(function (m) {
    if (worldGroup) worldGroup.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material && m.material.dispose) m.material.dispose();
  });
  _caveMouthMeshes = [];
}

// ── Proximity detection ───────────────────────────────────────────────────────

/**
 * Per-frame proximity check. Call from game-loop while survival + controls locked.
 * Shows/hides the interaction prompt based on player distance.
 */
function updateCaveMouthProximity() {
  if (!controls || !controls.isLocked) return;
  var pos = controls.getObject().position;
  var dx  = pos.x - CAVE_MOUTH_POS.x;
  var dz  = pos.z - CAVE_MOUTH_POS.z;
  var inRange = (dx * dx + dz * dz) <= CAVE_MOUTH_INTERACT_RANGE * CAVE_MOUTH_INTERACT_RANGE;

  if (inRange !== _caveMouthPromptVisible) {
    _caveMouthPromptVisible = inRange;
    var el = document.getElementById('cave-mouth-prompt');
    if (el) el.style.display = inRange ? 'flex' : 'none';
  }
}

/** Returns true when the player is within interaction range. */
function isCaveMouthNearby() {
  return _caveMouthPromptVisible;
}

// ── Tier selection overlay ────────────────────────────────────────────────────

/** Show the dungeon tier selection overlay. Releases pointer lock. */
function openCaveMouthTierSelect() {
  if (_caveMouthTierSelectOpen) return;
  _caveMouthTierSelectOpen = true;
  if (controls && controls.isLocked) controls.unlock();
  var el = document.getElementById('cave-mouth-tier-select');
  if (el) el.style.display = 'flex';
}

/** Hide the tier selection overlay without launching a dungeon. */
function closeCaveMouthTierSelect() {
  _caveMouthTierSelectOpen = false;
  var el = document.getElementById('cave-mouth-tier-select');
  if (el) el.style.display = 'none';
}

/**
 * Wire the tier-select overlay buttons. Call once from main init after DOM ready.
 */
function initCaveMouthUI() {
  var tierBtns = document.querySelectorAll('.cave-tier-btn');
  tierBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tierId = btn.getAttribute('data-tier');
      if (tierId) launchDungeonFromCaveMouth(tierId);
    });
  });

  var cancelBtn = document.getElementById('cave-mouth-tier-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      closeCaveMouthTierSelect();
      // Re-acquire pointer lock to return to game
      if (typeof requestPointerLock === 'function') requestPointerLock();
    });
  }
}

/** Dispatch dungeonLaunch with the chosen tier and mark as survival-origin. */
function launchDungeonFromCaveMouth(tierId) {
  _dungeonLaunchedFromSurvival = true;
  closeCaveMouthTierSelect();
  _caveMouthPromptVisible = false;
  var promptEl = document.getElementById('cave-mouth-prompt');
  if (promptEl) promptEl.style.display = 'none';
  document.dispatchEvent(new CustomEvent('dungeonLaunch', { detail: { dungeonId: tierId } }));
}

// ── Return-from-dungeon helpers ───────────────────────────────────────────────

/** True if the active dungeon was launched from the survival cave mouth. */
function isDungeonFromSurvival() {
  return _dungeonLaunchedFromSurvival;
}

/**
 * Show the "Return to Survival" button on the game-over screen.
 * No-ops if the dungeon was NOT launched from the cave mouth.
 */
function showReturnToSurvivalBtn() {
  if (!_dungeonLaunchedFromSurvival) return;
  var btn = document.getElementById('go-return-survival-btn');
  if (btn) btn.style.display = 'block';
}

/** Clear the cave-mouth-launch flag and hide the return button. */
function clearDungeonFromSurvival() {
  _dungeonLaunchedFromSurvival = false;
  _caveMouthPromptVisible = false;
  var promptEl = document.getElementById('cave-mouth-prompt');
  if (promptEl) promptEl.style.display = 'none';
  var btn = document.getElementById('go-return-survival-btn');
  if (btn) btn.style.display = 'none';
}

// Landing shadow/ghost preview for falling pieces.
// Requires: state.js (shadowsGroup, worldGroup, fallingPieces, gravityDirection),
//           config.js (BLOCK_SIZE, COLORS, SHADOW_APPEAR_DIST)

const _shadowRaycaster = new THREE.Raycaster();
const _shadowDownDir = new THREE.Vector3(0, -1, 0);
const _shadowWP = new THREE.Vector3();

/** Returns the cast direction vector for the current gravity mode. */
function _getShadowCastDir() {
  const _grav = (typeof gravityDirection !== 'undefined') ? gravityDirection : 'down';
  switch (_grav) {
    case 'up':    return new THREE.Vector3(0, +1, 0);
    case 'left':  return new THREE.Vector3(-1, 0, 0);
    case 'right': return new THREE.Vector3(+1, 0, 0);
    default:      return new THREE.Vector3(0, -1, 0);
  }
}

/**
 * Create flat semi-transparent ghost meshes for a newly spawned piece and
 * attach them to shadowsGroup.  Called once per piece at spawn time.
 * The thin axis of each ghost slab faces the gravity direction.
 *
 * Each shadow slot holds:
 *   - slot.fill  — translucent MeshBasicMaterial slab (normal mode)
 *   - slot.edges — EdgesGeometry LineSegments (high contrast mode)
 */
function createPieceShadow(piece) {
  const color = COLORS[piece.userData.colorIndex] || 0xffffff;
  const shadowGroup = new THREE.Group();
  const _grav = (typeof gravityDirection !== 'undefined') ? gravityDirection : 'down';
  const thin = BLOCK_SIZE * 0.08;
  const wide = BLOCK_SIZE * 0.9;

  // Build geometry with thin axis aligned to gravity direction
  let geoW, geoH, geoD;
  if (_grav === 'left' || _grav === 'right') {
    geoW = thin; geoH = wide; geoD = wide;  // thin on X axis
  } else {
    geoW = wide; geoH = thin; geoD = wide;  // thin on Y axis (default)
  }

  const _hc = (typeof highContrastEnabled !== 'undefined') && highContrastEnabled;

  piece.children.forEach(() => {
    const geo = new THREE.BoxGeometry(geoW, geoH, geoD);

    // Fill mesh (used in normal mode)
    const fillMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const fillMesh = new THREE.Mesh(geo, fillMat);
    fillMesh.visible = !_hc;

    // Edge outline (used in high contrast mode) — bright white dashed-style lines
    const edgesGeo = new THREE.EdgesGeometry(geo);
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const edgesMesh = new THREE.LineSegments(edgesGeo, edgesMat);
    edgesMesh.visible = _hc;

    // Group fill + edges together in one slot object
    const slot = new THREE.Group();
    slot.userData.isShadowSlot = true;
    slot.add(fillMesh);
    slot.add(edgesMesh);
    shadowGroup.add(slot);
  });

  shadowsGroup.add(shadowGroup);
  piece.userData.shadowGroup = shadowGroup;
}

/**
 * Update shadow positions every frame.  Called from updateFallingPieces()
 * after the piece has moved.  Casts in the active gravity direction.
 */
function updatePieceShadow(piece) {
  const shadowGroup = piece.userData.shadowGroup;
  if (!shadowGroup) return;

  const targets = worldGroup.children;
  const _grav = (typeof gravityDirection !== 'undefined') ? gravityDirection : 'down';
  const castDir = _getShadowCastDir();

  // Gather world positions and landing surface for each block in one pass.
  const blockData = piece.children.map((block) => {
    block.getWorldPosition(_shadowWP);
    const wp = _shadowWP.clone();
    _shadowRaycaster.set(wp, castDir);
    const hits = _shadowRaycaster.intersectObjects(targets, false);
    let surfaceVal;  // the coordinate of the landing surface along the gravity axis
    if (hits.length > 0) {
      switch (_grav) {
        case 'up':    surfaceVal = hits[0].point.y; break;
        case 'left':  surfaceVal = hits[0].point.x; break;
        case 'right': surfaceVal = hits[0].point.x; break;
        default:      surfaceVal = hits[0].point.y; break;
      }
    } else {
      // Default to hard boundary when no hit
      switch (_grav) {
        case 'up':    surfaceVal = GAME_OVER_HEIGHT; break;
        case 'left':  surfaceVal = -GAME_OVER_HEIGHT; break;
        case 'right': surfaceVal = GAME_OVER_HEIGHT; break;
        default:      surfaceVal = 0; break;
      }
    }
    return { wp, surfaceVal };
  });

  // Find the closest landing surface across all blocks (piece stops at first contact).
  // delta = signed shift needed to rest the block face against the surface.
  let landingDelta = -Infinity;
  blockData.forEach(({ wp, surfaceVal }) => {
    let delta;
    switch (_grav) {
      case 'up':    delta = surfaceVal - BLOCK_SIZE / 2 - wp.y; break;  // block top → surface
      case 'left':  delta = surfaceVal + BLOCK_SIZE / 2 - wp.x; break;  // block left → surface
      case 'right': delta = surfaceVal - BLOCK_SIZE / 2 - wp.x; break;  // block right → surface
      default:      delta = surfaceVal + BLOCK_SIZE / 2 - wp.y; break;  // block bottom → surface
    }
    if (delta > landingDelta) landingDelta = delta;
  });

  // distToLanding is always a positive "remaining distance to travel".
  const distToLanding = Math.abs(landingDelta);

  if (distToLanding > SHADOW_APPEAR_DIST || distToLanding <= 0.01) {
    shadowGroup.visible = false;
    return;
  }

  shadowGroup.visible = true;

  const t = 1 - distToLanding / SHADOW_APPEAR_DIST;
  const _opMax = (typeof mobileOverridesActive !== 'undefined' && mobileOverridesActive
    && typeof MOBILE_OVERRIDES !== 'undefined')
    ? MOBILE_OVERRIDES.ghostOpacityMax : 0.40;
  const opacity = 0.08 + t * (_opMax - 0.08);
  const _hc = (typeof highContrastEnabled !== 'undefined') && highContrastEnabled;
  // HC opacity is higher so the outline is clearly visible
  const hcOpacity = 0.3 + t * 0.7;

  blockData.forEach(({ wp, surfaceVal }, i) => {
    if (i >= shadowGroup.children.length) return;
    const slot = shadowGroup.children[i];
    if (!slot) return;
    const fillMesh  = slot.children[0];
    const edgesMesh = slot.children[1];

    // Place the slot flush against the landing surface.
    switch (_grav) {
      case 'up':    slot.position.set(wp.x, surfaceVal - 0.05, wp.z); break;
      case 'left':  slot.position.set(surfaceVal + 0.05, wp.y, wp.z); break;
      case 'right': slot.position.set(surfaceVal - 0.05, wp.y, wp.z); break;
      default:      slot.position.set(wp.x, surfaceVal + 0.05, wp.z); break;
    }

    // Toggle fill / edge visibility based on high contrast mode.
    if (fillMesh) {
      fillMesh.visible = !_hc;
      if (fillMesh.material) fillMesh.material.opacity = opacity;
    }
    if (edgesMesh) {
      edgesMesh.visible = _hc;
      if (edgesMesh.material) edgesMesh.material.opacity = hcOpacity;
    }
  });
}

/**
 * Remove and dispose shadow geometry when a piece lands.
 */
function removePieceShadow(piece) {
  const shadowGroup = piece.userData.shadowGroup;
  if (!shadowGroup) return;
  shadowsGroup.remove(shadowGroup);
  shadowGroup.children.forEach((slot) => {
    slot.children.forEach((m) => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    });
  });
  piece.userData.shadowGroup = null;
}

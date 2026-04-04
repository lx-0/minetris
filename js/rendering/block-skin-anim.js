// Animated block skin system
// Manages per-frame color animation for the 6 animated block skins.
// Blocks using animated skins are tracked in _animatedBlocks and updated
// each frame via updateAnimatedBlockSkins(elapsedTime).
//
// Requires: config.js (COLOR_TO_INDEX), state.js (activeBlockSkin, activePerPieceTypeSkins)

// ── Animated Skin Definitions ─────────────────────────────────────────────────
// Each skin: fps, frames (color arrays indexed 1-8 to match COLORS), emissiveFrames,
// edgeColor, and material property overrides applied at block creation.

const ANIMATED_BLOCK_SKIN_DEFS = {

  animated_lava: {
    fps: 6,
    edgeColor: 0x1a0000,
    material: { emissiveIntensity: 0.45, roughness: 0.75, metalness: 0.0 },
    frames: [
      [null, 0xcc3300, 0xff4400, 0xdd2200, 0xff5500, 0xbb2200, 0xff2200, 0xff6600, 0xffaa00],
      [null, 0xdd4400, 0xff6600, 0xff3300, 0xff6600, 0xcc3300, 0xff3300, 0xff8800, 0xffcc00],
      [null, 0xff5500, 0xff7700, 0xff5500, 0xff7700, 0xee4400, 0xff4400, 0xffaa00, 0xffee00],
      [null, 0xff7700, 0xff8800, 0xff7700, 0xff9900, 0xff5500, 0xff6600, 0xffcc00, 0xfff0aa],
      [null, 0xee5500, 0xff6600, 0xee4400, 0xff7700, 0xdd4400, 0xff5500, 0xffbb00, 0xffdd00],
      [null, 0xdd4400, 0xff5500, 0xdd3300, 0xff6600, 0xcc3300, 0xff3300, 0xff8800, 0xffcc00],
      [null, 0xcc3300, 0xff4400, 0xcc2200, 0xff5500, 0xbb2200, 0xff2200, 0xff7700, 0xffbb00],
      [null, 0xbb2200, 0xee3300, 0xbb1100, 0xee4400, 0xaa1100, 0xff1100, 0xff6600, 0xffaa00],
    ],
    emissiveFrames: [
      0x220500, 0x2a0800, 0x330a00, 0x3d0d00,
      0x2e0900, 0x260700, 0x1f0600, 0x180400,
    ],
    previewCss: '#ff5500',
  },

  animated_enchanted: {
    fps: 8,
    edgeColor: 0x110022,
    material: { emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.25 },
    frames: [
      [null, 0x330066, 0x5500aa, 0x7722cc, 0x4400bb, 0x220055, 0x9933ff, 0x6611aa, 0xaa44ff],
      [null, 0x4400aa, 0x6611cc, 0x8833ee, 0x5511cc, 0x330077, 0xaa44ff, 0x7722bb, 0xbb55ff],
      [null, 0x5511bb, 0x7722dd, 0x9944ff, 0x6622dd, 0x4400aa, 0xbb55ff, 0x8833cc, 0xcc66ff],
      [null, 0x6622cc, 0x8833ee, 0xaa55ff, 0x7733ee, 0x5511bb, 0xcc66ff, 0x9944dd, 0xdd77ff],
      [null, 0x7733dd, 0x9944ff, 0xbb66ff, 0x8844ff, 0x6622cc, 0xdd77ff, 0xaa55ee, 0xee88ff],
      [null, 0x6622cc, 0x8833ee, 0xaa55ff, 0x7733ee, 0x5511bb, 0xcc66ff, 0x9944dd, 0xdd77ff],
      [null, 0x5511bb, 0x7722dd, 0x9944ff, 0x6622dd, 0x4400aa, 0xbb55ff, 0x8833cc, 0xcc66ff],
      [null, 0x4400aa, 0x6611cc, 0x8833ee, 0x5511cc, 0x330077, 0xaa44ff, 0x7722bb, 0xbb55ff],
    ],
    emissiveFrames: [
      0x110022, 0x1a0033, 0x220044, 0x2b0055,
      0x330066, 0x2b0055, 0x220044, 0x1a0033,
    ],
    previewCss: '#7733dd',
  },

  animated_redstone: {
    fps: 6,
    edgeColor: 0x110000,
    material: { emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.05 },
    frames: [
      [null, 0x880000, 0xaa1100, 0xcc2200, 0x990000, 0x770000, 0xff1100, 0xbb1100, 0xdd3300],
      [null, 0xaa0000, 0xcc1100, 0xee2200, 0xbb1100, 0x990000, 0xff2200, 0xcc1100, 0xee3300],
      [null, 0xcc0000, 0xee1100, 0xff2200, 0xdd1100, 0xbb0000, 0xff3300, 0xdd1100, 0xff4400],
      [null, 0xff0000, 0xff2200, 0xff3300, 0xff2200, 0xdd0000, 0xff4400, 0xff2200, 0xff5500],
      [null, 0xcc0000, 0xee1100, 0xff2200, 0xdd1100, 0xbb0000, 0xff3300, 0xdd1100, 0xff4400],
      [null, 0xaa0000, 0xcc1100, 0xee2200, 0xbb1100, 0x990000, 0xff2200, 0xcc1100, 0xee3300],
      [null, 0x880000, 0xaa1100, 0xcc2200, 0x990000, 0x770000, 0xff1100, 0xbb1100, 0xdd3300],
      [null, 0x660000, 0x881100, 0xaa2200, 0x770000, 0x550000, 0xee0000, 0x991100, 0xbb2200],
    ],
    emissiveFrames: [
      0x110000, 0x1a0000, 0x220000, 0x2b0000,
      0x220000, 0x1a0000, 0x110000, 0x0a0000,
    ],
    previewCss: '#cc0000',
  },

  animated_diamond: {
    fps: 5,
    edgeColor: 0x003344,
    material: { emissiveIntensity: 0.3, roughness: 0.1, metalness: 0.6 },
    frames: [
      [null, 0x4488bb, 0x55aadd, 0x66bbee, 0x77ccff, 0x3377aa, 0x88ddff, 0x5599cc, 0xaaeeff],
      [null, 0x55aadd, 0x66bbee, 0x88ccff, 0x88ddff, 0x4488cc, 0x99eeff, 0x66aadd, 0xbbffff],
      [null, 0x77ccff, 0x88ddff, 0xaaeeff, 0xaaffff, 0x66aaee, 0xccffff, 0x88ccee, 0xdfffff],
      [null, 0xaaeeff, 0xbbffff, 0xccffff, 0xdfffff, 0x99ccff, 0xeeffff, 0xaaddff, 0xffffff],
      [null, 0x77ccff, 0x88ddff, 0xaaeeff, 0xaaffff, 0x66aaee, 0xccffff, 0x88ccee, 0xdfffff],
      [null, 0x55aadd, 0x66bbee, 0x88ccff, 0x88ddff, 0x4488cc, 0x99eeff, 0x66aadd, 0xbbffff],
    ],
    emissiveFrames: [
      0x002233, 0x002a3d, 0x003347, 0x004466,
      0x003347, 0x002a3d,
    ],
    previewCss: '#77ccff',
  },

  animated_prismarine: {
    fps: 4,
    edgeColor: 0x002222,
    material: { emissiveIntensity: 0.25, roughness: 0.4, metalness: 0.2 },
    frames: [
      [null, 0x00aa88, 0x22bbaa, 0x33ccbb, 0x44ddcc, 0x009977, 0x55eedd, 0x2299aa, 0x77ffee],
      [null, 0x22bbaa, 0x44ccbb, 0x55ddcc, 0x66eedd, 0x22aa88, 0x77ffee, 0x44aabb, 0x88ffff],
      [null, 0x44ccbb, 0x66ddcc, 0x77eedd, 0x88ffee, 0x44bb99, 0x99ffff, 0x66bbcc, 0x99ffff],
      [null, 0x66ddcc, 0x88eedd, 0x99ffee, 0xaaffff, 0x66ccaa, 0xaaffff, 0x88ccdd, 0xaaffff],
      [null, 0x44ccbb, 0x66ddcc, 0x77eedd, 0x88ffee, 0x44bb99, 0x99ffff, 0x66bbcc, 0x99ffff],
      [null, 0x22bbaa, 0x44ccbb, 0x55ddcc, 0x66eedd, 0x22aa88, 0x77ffee, 0x44aabb, 0x88ffff],
      [null, 0x00aa88, 0x22bbaa, 0x33ccbb, 0x44ddcc, 0x009977, 0x55eedd, 0x2299aa, 0x77ffee],
      [null, 0x008877, 0x00aaaa, 0x11bbbb, 0x22ccbb, 0x008866, 0x33ddcc, 0x1188aa, 0x55eedd],
    ],
    emissiveFrames: [
      0x001a15, 0x00221a, 0x002a20, 0x003328,
      0x002a20, 0x00221a, 0x001a15, 0x001210,
    ],
    previewCss: '#44ccbb',
  },

  animated_nether_star: {
    fps: 8,
    edgeColor: 0x222222,
    material: { emissiveIntensity: 0.85, roughness: 0.05, metalness: 0.9 },
    frames: [
      [null, 0xaaaaaa, 0xcccccc, 0xeeeeee, 0xffffff, 0x999999, 0xffffff, 0xdddddd, 0xffffff],
      [null, 0xbbbbbb, 0xdddddd, 0xffffff, 0xffffff, 0xaaaaaa, 0xffffff, 0xeeeeee, 0xffffff],
      [null, 0xdddddd, 0xffffff, 0xffffff, 0xffffff, 0xcccccc, 0xffffff, 0xffffff, 0xffffff],
      [null, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xeeeeee, 0xffffff, 0xffffff, 0xffffff],
      [null, 0xdddddd, 0xffffff, 0xffffff, 0xffffff, 0xcccccc, 0xffffff, 0xffffff, 0xffffff],
      [null, 0xbbbbbb, 0xdddddd, 0xffffff, 0xffffff, 0xaaaaaa, 0xffffff, 0xeeeeee, 0xffffff],
      [null, 0x999999, 0xbbbbbb, 0xdddddd, 0xeeeeee, 0x888888, 0xffffff, 0xcccccc, 0xffffff],
      [null, 0x777777, 0x999999, 0xbbbbbb, 0xcccccc, 0x666666, 0xeeeeee, 0xaaaaaa, 0xdddddd],
    ],
    emissiveFrames: [
      0x333333, 0x444444, 0x666666, 0x888888,
      0x666666, 0x444444, 0x333333, 0x222222,
    ],
    previewCss: '#dddddd',
  },

};

// ── Animated block registry ───────────────────────────────────────────────────

// All block meshes using an animated skin. Cleaned up automatically
// when blocks are removed from their parent (world culling / line clear).
const _animatedBlocks = new Set();

/** Register a block mesh for per-frame color animation. */
function registerAnimatedBlock(mesh) {
  _animatedBlocks.add(mesh);
}

/** Remove a block mesh from the animation registry (called by disposeBlock). */
function unregisterAnimatedBlock(mesh) {
  _animatedBlocks.delete(mesh);
}

/** Clear all tracked animated blocks (e.g. on game reset or skin change). */
function clearAnimatedBlocks() {
  _animatedBlocks.clear();
}

// ── Per-frame update ──────────────────────────────────────────────────────────

// Cache frame index per skin key per tick to avoid redundant Math.floor calls.
var _skinFrameCache = {};
var _skinFrameCacheTime = -1;

/**
 * Called each frame by game-loop.js.
 * Updates the material color + emissive of every animated block in sync.
 * @param {number} elapsedTime  Seconds from THREE.Clock.getElapsedTime()
 */
function updateAnimatedBlockSkins(elapsedTime) {
  if (_animatedBlocks.size === 0) return;

  // Rebuild frame cache once per tick (all blocks with the same skin get the same frame).
  if (_skinFrameCacheTime !== elapsedTime) {
    _skinFrameCache = {};
    _skinFrameCacheTime = elapsedTime;
  }

  _animatedBlocks.forEach(function(block) {
    // Auto-prune stale references (block removed from scene).
    if (!block.parent) {
      _animatedBlocks.delete(block);
      return;
    }

    var skinKey = block.userData.activeSkinKey;
    if (!skinKey) return;
    var def = ANIMATED_BLOCK_SKIN_DEFS[skinKey];
    if (!def) return;

    // Compute current frame index (cached per skin key).
    if (_skinFrameCache[skinKey] === undefined) {
      var frameDuration = 1.0 / def.fps;
      _skinFrameCache[skinKey] = Math.floor(elapsedTime / frameDuration) % def.frames.length;
    }
    var frameIdx = _skinFrameCache[skinKey];
    var frameColors = def.frames[frameIdx];

    var canonicalHex = block.userData.canonicalColor;
    var sIdx = (typeof COLOR_TO_INDEX !== 'undefined') ? COLOR_TO_INDEX[canonicalHex] : undefined;
    if (sIdx === undefined || sIdx === null || sIdx < 1 || sIdx > 8) return;

    var newColor = frameColors[sIdx];
    if (newColor === null || newColor === undefined) return;

    // Only set if changed — avoids unnecessary GPU state dirtying.
    if (block.material.color.getHex() !== newColor) {
      block.material.color.setHex(newColor);
    }

    if (def.emissiveFrames && block.material.emissive) {
      var newEmissive = def.emissiveFrames[frameIdx];
      if (block.material.emissive.getHex() !== newEmissive) {
        block.material.emissive.setHex(newEmissive);
      }
    }
  });
}

// ── Skin preview canvas renderer ─────────────────────────────────────────────

/**
 * Draw one animation frame of a skin onto a 2D canvas for the wardrobe preview.
 * @param {HTMLCanvasElement} canvas
 * @param {string}  skinKey    Key into ANIMATED_BLOCK_SKIN_DEFS
 * @param {number}  elapsedMs  Running time in milliseconds
 */
function drawSkinPreviewFrame(canvas, skinKey, elapsedMs) {
  var def = ANIMATED_BLOCK_SKIN_DEFS[skinKey];
  if (!def || !canvas) return;

  var ctx = canvas.getContext('2d');
  var w = canvas.width;
  var h = canvas.height;

  var frameDuration = 1000 / def.fps;
  var frameIdx = Math.floor(elapsedMs / frameDuration) % def.frames.length;
  var frameColors = def.frames[frameIdx];

  var cols = 4;
  var rows = 2;
  var bw = Math.floor(w / cols);
  var bh = Math.floor(h / rows);

  ctx.clearRect(0, 0, w, h);

  for (var row = 0; row < rows; row++) {
    for (var col = 0; col < cols; col++) {
      var idx = row * cols + col + 1; // indices 1-8
      if (idx > 8) break;
      var color = frameColors[idx];
      if (!color) continue;

      var hex = '#' + color.toString(16).padStart(6, '0');
      var x = col * bw;
      var y = row * bh;

      ctx.fillStyle = hex;
      ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);

      // Top-face highlight
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 1, y + 1, bw - 2, 3);
      // Bottom-face shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x + 1, y + bh - 4, bw - 2, 3);
    }
  }
}

// ── Per-piece-type skin helpers ───────────────────────────────────────────────

var SKIN_PER_PIECE_KEY = 'mineCtris_skinPerPieceType';

/** Load the per-piece-type skin map from localStorage. Returns {} if none saved. */
function loadPerPieceTypeSkins() {
  try {
    var raw = localStorage.getItem(SKIN_PER_PIECE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

/** Persist the per-piece-type skin map. */
function savePerPieceTypeSkins(map) {
  try {
    localStorage.setItem(SKIN_PER_PIECE_KEY, JSON.stringify(map));
  } catch (_) {}
}

/** Clear all per-piece-type skin assignments. */
function clearPerPieceTypeSkins() {
  try {
    localStorage.removeItem(SKIN_PER_PIECE_KEY);
  } catch (_) {}
  if (typeof activePerPieceTypeSkins !== 'undefined') {
    // Reset in-session state (will also be null at next game start)
    // activePerPieceTypeSkins is declared in state.js; clear it here if possible.
  }
}

/**
 * Check whether any per-piece-type skin assignment is currently active.
 */
function hasPerPieceTypeSkins() {
  var map = loadPerPieceTypeSkins();
  return map && Object.keys(map).length > 0;
}

/**
 * Return the display name of an animated skin.
 * @param {string} skinKey
 */
function getAnimatedSkinName(skinKey) {
  var names = {
    animated_lava:        'Flowing Lava',
    animated_enchanted:   'Enchanted Shimmer',
    animated_redstone:    'Redstone Pulse',
    animated_diamond:     'Diamond Sparkle',
    animated_prismarine:  'Prismarine Shift',
    animated_nether_star: 'Nether Star',
  };
  return names[skinKey] || skinKey;
}

// ── Settings-panel preview strip ─────────────────────────────────────────────

var _stripRafId = null;

/**
 * Populate #animated-skin-preview-strip in the settings panel with mini
 * animated preview cards for each skin.  Safe to call multiple times.
 */
function initAnimatedSkinStrip() {
  var strip = document.getElementById('animated-skin-preview-strip');
  if (!strip) return;

  // Build the card HTML once.
  var html = '';
  Object.keys(ANIMATED_BLOCK_SKIN_DEFS).forEach(function(skinKey) {
    var unlocked = false;
    if (typeof isCosmeticUnlocked === 'function') {
      var cosId = 'animated_block_skin_' + skinKey.replace('animated_', '');
      unlocked = isCosmeticUnlocked(cosId);
    }
    var name = getAnimatedSkinName(skinKey);
    var cls = 'anim-strip-card' + (unlocked ? '' : ' anim-strip-locked');
    html += '<div class="' + cls + '">';
    html += '<canvas class="skin-preview-canvas" data-animated-skin="' + skinKey +
      '" width="72" height="36"></canvas>';
    html += '<div class="anim-strip-card-name">' + name + '</div>';
    html += '</div>';
  });
  strip.innerHTML = html;

  // Animate all canvases in the strip.
  var startMs = performance.now();
  if (_stripRafId) cancelAnimationFrame(_stripRafId);
  function tick() {
    var elapsed = performance.now() - startMs;
    var canvases = strip.querySelectorAll('.skin-preview-canvas[data-animated-skin]');
    if (!canvases.length) { _stripRafId = null; return; }
    canvases.forEach(function(canvas) {
      drawSkinPreviewFrame(canvas, canvas.getAttribute('data-animated-skin'), elapsed);
    });
    _stripRafId = requestAnimationFrame(tick);
  }
  _stripRafId = requestAnimationFrame(tick);
}

// Wire the settings wardrobe link to open the profile page on the block_skin tab.
document.addEventListener('DOMContentLoaded', function() {
  var link = document.getElementById('settings-wardrobe-link');
  if (link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      // Close settings overlay and open profile page.
      var settingsOverlay = document.getElementById('settings-overlay');
      if (settingsOverlay) settingsOverlay.style.display = 'none';
      if (typeof _profileActiveTab !== 'undefined') _profileActiveTab = 'block_skin';
      if (typeof openProfilePage === 'function') openProfilePage();
    });
  }
});

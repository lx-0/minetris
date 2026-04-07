// boardskins.js — Board skins system.
// Unlockable visual styles for the game board grid overlay.
// Uses CSS/canvas styling only — no additional asset downloads.
//
// Skin components: grid line style/color, board tint, border accent, cell highlight
// Unlock paths: level milestones, puzzle completion, seasonal events, achievements
//
// Requires: leveling.js (getPlayerLevel), localStorage for persistence.

'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────

const BOARD_SKIN_KEY = 'mineCtris_activeBoardSkin';

// ── Skin catalog ───────────────────────────────────────────────────────────────
//
// Each skin drives:
//   overlayClass  — CSS class added to #board-skin-overlay
//   previewColors — [bgColor, gridColor, accentColor] for mini-board preview

const BOARD_SKINS = [
  {
    id: 'classic',
    name: 'Classic',
    icon: '\uD83D\uDFE9',
    desc: 'Clean default board. Always unlocked.',
    unlockLabel: 'Always unlocked',
    unlockType: 'always',
    overlayClass: 'board-skin--classic',
    previewColors: ['#0d1117', '#1a2e1a', '#4ade80'],
  },
  {
    id: 'wireframe',
    name: 'Wireframe',
    icon: '\uD83D\uDDB1\uFE0F',
    desc: 'Minimal glowing grid lines. Always unlocked.',
    unlockLabel: 'Always unlocked',
    unlockType: 'always',
    overlayClass: 'board-skin--wireframe',
    previewColors: ['#050508', '#00ff88', '#00ff88'],
  },
  {
    id: 'stone',
    name: 'Minecraft Stone',
    icon: '\u26AA',
    desc: 'Hewn stone brickwork behind every block.',
    unlockLabel: 'Reach Level 3',
    unlockType: 'level',
    unlockLevel: 3,
    overlayClass: 'board-skin--stone',
    previewColors: ['#666', '#444', '#aaa'],
  },
  {
    id: 'wooden',
    name: 'Wooden',
    icon: '\uD83E\uDEB5',
    desc: 'Oak planks and warm grain. Cozy underground.',
    unlockLabel: 'Reach Level 10',
    unlockType: 'level',
    unlockLevel: 10,
    overlayClass: 'board-skin--wooden',
    previewColors: ['#6b3a2a', '#4a2012', '#c8823c'],
  },
  {
    id: 'nether',
    name: 'Minecraft Nether',
    icon: '\uD83D\uDD25',
    desc: 'Nether brick and ember glow. Forge from chaos.',
    unlockLabel: 'Reach Level 15',
    unlockType: 'level',
    unlockLevel: 15,
    overlayClass: 'board-skin--nether',
    previewColors: ['#3a0a0a', '#1a0000', '#ff4400'],
  },
  {
    id: 'end',
    name: 'Minecraft End',
    icon: '\uD83C\uDF0C',
    desc: 'Endstone and void. Silence beyond the portal.',
    unlockLabel: 'Complete 10 puzzles',
    unlockType: 'puzzles',
    unlockPuzzles: 10,
    overlayClass: 'board-skin--end',
    previewColors: ['#1a1a2a', '#484430', '#ddd8a0'],
  },
  {
    id: 'glass',
    name: 'Glass',
    icon: '\u2728',
    desc: 'Transparent panes with crystal refractions.',
    unlockLabel: 'Reach Level 25',
    unlockType: 'level',
    unlockLevel: 25,
    overlayClass: 'board-skin--glass',
    previewColors: ['#0a1a2a', '#224466', '#88ccff'],
  },
  {
    id: 'pixel',
    name: 'Pixel Art',
    icon: '\uD83C\uDFA8',
    desc: 'Chunky 16-bit checkerboard retro grid.',
    unlockLabel: 'Reach Level 20',
    unlockType: 'level',
    unlockLevel: 20,
    overlayClass: 'board-skin--pixel',
    previewColors: ['#0d0d0d', '#222', '#0f0'],
  },
];

// ── Overlay element ────────────────────────────────────────────────────────────

function _getBoardSkinOverlay() {
  var el = document.getElementById('board-skin-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'board-skin-overlay';
    // Insert after renderer-container so it sits on top of the 3D scene
    var rc = document.getElementById('renderer-container');
    if (rc && rc.parentNode) {
      rc.parentNode.insertBefore(el, rc.nextSibling);
    } else {
      document.body.appendChild(el);
    }
  }
  return el;
}

// ── Unlock logic ───────────────────────────────────────────────────────────────

/**
 * Return true if the given board skin is available to the player.
 */
function isBoardSkinUnlocked(skinId) {
  var skin = BOARD_SKINS.find(function(s) { return s.id === skinId; });
  if (!skin) return false;
  if (skin.unlockType === 'always') return true;

  if (skin.unlockType === 'level') {
    var lvl = typeof getPlayerLevel === 'function' ? getPlayerLevel() : 1;
    return lvl >= skin.unlockLevel;
  }

  if (skin.unlockType === 'puzzles') {
    try {
      var raw = localStorage.getItem('mineCtris_puzzlesCompleted');
      var count = raw ? parseInt(raw, 10) : 0;
      return !isNaN(count) && count >= (skin.unlockPuzzles || 10);
    } catch (_) { return false; }
  }

  return false;
}

// ── Persistence ────────────────────────────────────────────────────────────────

/**
 * Return the active board skin id. Defaults to 'classic'.
 */
function getActiveBoardSkin() {
  try {
    var stored = localStorage.getItem(BOARD_SKIN_KEY);
    if (stored && BOARD_SKINS.some(function(s) { return s.id === stored; })) {
      return stored;
    }
  } catch (_) {}
  return 'classic';
}

function _saveActiveBoardSkin(skinId) {
  try { localStorage.setItem(BOARD_SKIN_KEY, skinId); } catch (_) {}
}

// ── Apply skin ────────────────────────────────────────────────────────────────

/**
 * Apply a board skin overlay immediately. Pass null/'classic' to reset.
 */
function applyBoardSkin(skinId) {
  var id = skinId || 'classic';
  var skin = BOARD_SKINS.find(function(s) { return s.id === id; });
  if (!skin) skin = BOARD_SKINS[0];

  var el = _getBoardSkinOverlay();

  // Remove all skin classes
  BOARD_SKINS.forEach(function(s) {
    el.classList.remove(s.overlayClass);
  });

  if (id !== 'classic') {
    el.classList.add(skin.overlayClass);
  }

  _saveActiveBoardSkin(id);
  _syncBoardSkinButtons();

  if (typeof metricsEvent === 'function') {
    metricsEvent('board_skin_applied', { skin: id });
  }
}

/**
 * Restore the persisted board skin on game load.
 */
function restoreBoardSkin() {
  var id = getActiveBoardSkin();
  if (!isBoardSkinUnlocked(id)) {
    id = 'classic';
    _saveActiveBoardSkin(id);
  }
  applyBoardSkin(id);
}

// ── Mini-board preview ─────────────────────────────────────────────────────────

/**
 * Draw a mini-board preview onto a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {object} skin  — entry from BOARD_SKINS
 */
function _drawBoardSkinPreview(canvas, skin) {
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width;
  var H = canvas.height;
  var cols = 5;
  var rows = 8;
  var cellW = W / cols;
  var cellH = H / rows;

  var bg = skin.previewColors[0] || '#111';
  var grid = skin.previewColors[1] || '#333';
  var accent = skin.previewColors[2] || '#0f0';

  // Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = grid;
  ctx.lineWidth = 0.5;
  for (var col = 0; col <= cols; col++) {
    ctx.beginPath();
    ctx.moveTo(col * cellW, 0);
    ctx.lineTo(col * cellW, H);
    ctx.stroke();
  }
  for (var row = 0; row <= rows; row++) {
    ctx.beginPath();
    ctx.moveTo(0, row * cellH);
    ctx.lineTo(W, row * cellH);
    ctx.stroke();
  }

  // Draw a few sample filled cells in accent
  var sampleCells = [[0,5],[1,5],[2,5],[3,5],[4,5],[2,4],[2,3],[1,3],[0,3],[0,4]];
  ctx.fillStyle = accent;
  sampleCells.forEach(function(rc) {
    ctx.fillRect(rc[0] * cellW + 1, rc[1] * cellH + 1, cellW - 2, cellH - 2);
  });

  // Border
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}

// ── Selector UI ────────────────────────────────────────────────────────────────

/**
 * Build and inject the board skin selector grid into #board-skin-selector.
 */
function initBoardSkinSelector() {
  var container = document.getElementById('board-skin-selector');
  if (!container) return;

  var html = '';
  BOARD_SKINS.forEach(function(skin) {
    var unlocked = isBoardSkinUnlocked(skin.id);
    var lockedClass = unlocked ? '' : ' board-skin-btn-locked';
    html += '<button id="board-skin-btn-' + skin.id + '"' +
      ' class="board-skin-btn' + lockedClass + '"' +
      ' data-skin-id="' + skin.id + '"' +
      ' title="' + skin.name + ': ' + skin.desc + '"' +
      (unlocked ? '' : ' disabled') + '>';
    // Mini-board preview canvas
    html += '<canvas class="board-skin-preview-canvas" width="50" height="64" aria-hidden="true"></canvas>';
    html += '<span class="board-skin-btn-name">' + skin.icon + ' ' + skin.name + '</span>';
    html += '<span class="board-skin-btn-sub' + (unlocked ? '' : ' board-skin-btn-hint') + '">';
    html += (unlocked ? '' : '\uD83D\uDD12 ') + skin.unlockLabel;
    html += '</span>';
    html += '</button>';
  });
  container.innerHTML = html;

  // Draw previews on canvases
  BOARD_SKINS.forEach(function(skin) {
    var btn = document.getElementById('board-skin-btn-' + skin.id);
    if (!btn) return;
    var canvas = btn.querySelector('.board-skin-preview-canvas');
    _drawBoardSkinPreview(canvas, skin);

    if (isBoardSkinUnlocked(skin.id)) {
      btn.addEventListener('click', function() {
        applyBoardSkin(skin.id);
      });
    }
  });

  _syncBoardSkinButtons();
}

/**
 * Sync selected state on all board skin buttons.
 */
function _syncBoardSkinButtons() {
  var activeId = getActiveBoardSkin();
  BOARD_SKINS.forEach(function(skin) {
    var btn = document.getElementById('board-skin-btn-' + skin.id);
    if (!btn) return;
    btn.classList.toggle('board-skin-btn-selected', skin.id === activeId);
  });
}

/**
 * Refresh the selector — call after level-up or achievement to unlock new buttons.
 */
function refreshBoardSkinSelector() {
  initBoardSkinSelector();
}

// js/avatar.js — Custom pixel art avatar creator (16×16 pixel editor)
// Provides: getCustomAvatarPixels, setCustomAvatarPixels, isUsingCustomAvatar,
//           setUseCustomAvatar, renderCustomAvatarToCanvas, customAvatarToDataURL,
//           openAvatarCreator, syncCustomAvatarToCloud
// Depends on: player-avatar.js (_AVATAR_DEFS, _drawFrame, getSelectedFrame, friendsGetMyCode)

const AVATAR_CUSTOM_KEY      = 'mineCtris_customAvatar';
const AVATAR_USE_CUSTOM_KEY  = 'mineCtris_useCustomAvatar';

// ── 32-colour Minecraft-themed palette ───────────────────────────────────────
// Row 1: earth tones, Row 2: greens, Row 3: stone/grays, Row 4: skin/wood,
// Row 5: blues/diamond, Row 6: gold/fire, Row 7: emerald/deep-green, Row 8: reds + mono
var AVATAR_PALETTE = [
  '#7B4F2E','#A0522D','#CD853F','#DEB887',
  '#4ade80','#22c55e','#6B8E23','#4a8c2c',
  '#AAAAAA','#888888','#555555','#222222',
  '#F3AD85','#D4A070','#8B4513','#3B1005',
  '#B9F2FF','#3a9fd4','#1E90FF','#1A0A2E',
  '#FFD700','#F5C518','#E07010','#B8860B',
  '#50C878','#228B22','#006400','#2A6B1A',
  '#FF4444','#C04010','#FFFFFF','#000000',
];

// ── Storage ──────────────────────────────────────────────────────────────────

function getCustomAvatarPixels() {
  try {
    var raw = localStorage.getItem(AVATAR_CUSTOM_KEY);
    if (!raw) return null;
    var d = JSON.parse(raw);
    if (Array.isArray(d.pixels) && d.pixels.length === 256) return d.pixels;
    return null;
  } catch (_) { return null; }
}

function setCustomAvatarPixels(pixels) {
  try { localStorage.setItem(AVATAR_CUSTOM_KEY, JSON.stringify({ pixels: pixels })); }
  catch (_) {}
  if (typeof onAutoSync === 'function') onAutoSync();
}

function isUsingCustomAvatar() {
  try { return localStorage.getItem(AVATAR_USE_CUSTOM_KEY) === '1'; } catch (_) { return false; }
}

function setUseCustomAvatar(val) {
  try { localStorage.setItem(AVATAR_USE_CUSTOM_KEY, val ? '1' : '0'); } catch (_) {}
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Draw the custom 16×16 pixel avatar (plus optional frame) onto a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {string[]|null} pixels  — length-256 array of hex colours or ''
 * @param {string} frameId
 */
function renderCustomAvatarToCanvas(canvas, pixels, frameId) {
  var size = canvas.width;
  var ctx  = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  // Checkerboard background (shows transparency)
  var cs = size / 16;
  for (var r = 0; r < 16; r++) {
    for (var c = 0; c < 16; c++) {
      ctx.fillStyle = ((r + c) % 2 === 0) ? '#1e2a1e' : '#162116';
      ctx.fillRect(c * cs, r * cs, cs, cs);
    }
  }

  if (pixels) {
    for (var i = 0; i < 256; i++) {
      var col = pixels[i];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect((i % 16) * cs, Math.floor(i / 16) * cs, cs, cs);
    }
  }

  if (frameId && frameId !== 'none' && typeof _drawFrame === 'function') {
    _drawFrame(ctx, size, frameId);
  }
}

/**
 * Return a PNG data URL of the custom avatar at the requested pixel size.
 */
function customAvatarToDataURL(pixels, size) {
  var c = document.createElement('canvas');
  c.width = c.height = (size || 64);
  renderCustomAvatarToCanvas(c, pixels, 'none');
  return c.toDataURL('image/png');
}

// ── Upscale 8×8 preset → 16×16 ───────────────────────────────────────────────

function _upscalePreset(def) {
  var pixels = new Array(256).fill('');
  var g = def.g, pal = def.p;
  for (var i = 0; i < 64; i++) {
    var ch    = g[i];
    var color = pal[ch];
    if (!color) continue;
    var srcCol = i % 8;
    var srcRow = Math.floor(i / 8);
    var dstCol = srcCol * 2;
    var dstRow = srcRow * 2;
    for (var dy = 0; dy < 2; dy++) {
      for (var dx = 0; dx < 2; dx++) {
        pixels[(dstRow + dy) * 16 + (dstCol + dx)] = color;
      }
    }
  }
  return pixels;
}

// ── Cloud sync ────────────────────────────────────────────────────────────────

function syncCustomAvatarToCloud(pixels) {
  if (!pixels) return;
  var code = typeof friendsGetMyCode === 'function' ? friendsGetMyCode() : null;
  if (!code) return;
  var base = typeof FRIENDS_WORKER_URL !== 'undefined'
    ? FRIENDS_WORKER_URL : 'https://minectris-leaderboard.workers.dev';
  var dataUrl = customAvatarToDataURL(pixels, 32);
  fetch(base + '/api/avatar/upload', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ code: code, avatar: dataUrl }),
  }).catch(function () {});
}

// ── Editor state ──────────────────────────────────────────────────────────────

var _edPixels    = null;
var _edHistory   = [];
var _edRedo      = [];
var _edTool      = 'pencil';
var _edColor     = AVATAR_PALETTE[12]; // skin-tone default
var _edMouseDown = false;
var _edLastIdx   = -1;

var _ED_CELL = 16;  // px per cell on editor canvas
var _ED_GRID = 16;  // grid dimension

// ── Editor canvas drawing ─────────────────────────────────────────────────────

function _edDrawCanvas(canvas) {
  var ctx  = canvas.getContext('2d');
  var N = _ED_GRID, C = _ED_CELL;
  var sz = N * C;
  ctx.clearRect(0, 0, sz, sz);

  // Checkerboard bg
  for (var r = 0; r < N; r++) {
    for (var c = 0; c < N; c++) {
      ctx.fillStyle = ((r + c) % 2 === 0) ? '#2a2a2a' : '#222222';
      ctx.fillRect(c * C, r * C, C, C);
    }
  }

  // Pixels
  for (var i = 0; i < N * N; i++) {
    var col = _edPixels[i];
    if (!col) continue;
    ctx.fillStyle = col;
    ctx.fillRect((i % N) * C, Math.floor(i / N) * C, C, C);
  }

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth   = 0.5;
  for (var x = 0; x <= N; x++) {
    ctx.beginPath();
    ctx.moveTo(x * C + 0.5, 0);
    ctx.lineTo(x * C + 0.5, sz);
    ctx.stroke();
  }
  for (var y = 0; y <= N; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * C + 0.5);
    ctx.lineTo(sz, y * C + 0.5);
    ctx.stroke();
  }
}

function _edGetCellIdx(canvas, evt) {
  var rect = canvas.getBoundingClientRect();
  var cx, cy;
  if (evt.touches && evt.touches.length > 0) {
    cx = evt.touches[0].clientX;
    cy = evt.touches[0].clientY;
  } else {
    cx = evt.clientX;
    cy = evt.clientY;
  }
  var scaleX = canvas.width  / rect.width;
  var scaleY = canvas.height / rect.height;
  var col = Math.floor((cx - rect.left) * scaleX / _ED_CELL);
  var row = Math.floor((cy - rect.top)  * scaleY / _ED_CELL);
  if (col < 0 || col >= _ED_GRID || row < 0 || row >= _ED_GRID) return -1;
  return row * _ED_GRID + col;
}

// ── History ───────────────────────────────────────────────────────────────────

function _edSaveHistory() {
  _edHistory.push(_edPixels.slice());
  if (_edHistory.length > 50) _edHistory.shift();
  _edRedo = [];
}

function _edUndoAction() {
  if (_edHistory.length === 0) return;
  _edRedo.push(_edPixels.slice());
  _edPixels = _edHistory.pop();
}

function _edRedoAction() {
  if (_edRedo.length === 0) return;
  _edHistory.push(_edPixels.slice());
  _edPixels = _edRedo.pop();
}

// ── Tools ─────────────────────────────────────────────────────────────────────

function _edApplyTool(idx, canvas) {
  if (idx < 0 || idx === _edLastIdx) return;
  _edLastIdx = idx;

  switch (_edTool) {
    case 'pencil':
      _edPixels[idx] = _edColor;
      break;
    case 'eraser':
      _edPixels[idx] = '';
      break;
    case 'eyedropper': {
      var picked = _edPixels[idx];
      if (picked) {
        _edColor = picked;
        _edTool  = 'pencil';
        _edUpdateToolUI();
        _edUpdateColorIndicator();
      }
      return; // no pixel changed
    }
    case 'fill':
      _edFloodFill(idx, _edPixels[idx], _edColor);
      break;
  }
  _edDrawCanvas(canvas);
  _edUpdatePreview();
}

function _edFloodFill(startIdx, targetColor, fillColor) {
  if (targetColor === fillColor) return;
  var visited = new Uint8Array(256);
  var queue   = [startIdx];
  visited[startIdx] = 1;
  while (queue.length > 0) {
    var cur = queue.shift();
    _edPixels[cur] = fillColor;
    var col = cur % _ED_GRID;
    var row = Math.floor(cur / _ED_GRID);
    var neighbors = [
      row > 0            ? cur - _ED_GRID : -1,
      row < _ED_GRID - 1 ? cur + _ED_GRID : -1,
      col > 0            ? cur - 1         : -1,
      col < _ED_GRID - 1 ? cur + 1         : -1,
    ];
    for (var i = 0; i < 4; i++) {
      var n = neighbors[i];
      if (n >= 0 && !visited[n] && _edPixels[n] === targetColor) {
        visited[n] = 1;
        queue.push(n);
      }
    }
  }
}

// ── Build overlay HTML ────────────────────────────────────────────────────────

function _edBuildOverlayHtml() {
  var sz = _ED_GRID * _ED_CELL;
  var presetSkins = [
    'steve','alex','creeper','enderman','skeleton','zombie',
    'blaze','ghast','iron_golem','villager','wither','ender_dragon',
  ];
  var presetHtml = '';
  for (var j = 0; j < presetSkins.length; j++) {
    var sk = presetSkins[j];
    var label = sk.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    presetHtml +=
      '<canvas class="aed-preset-thumb" data-preset="' + sk + '" ' +
      'width="32" height="32" title="' + label + '"></canvas>';
  }
  var palHtml = '';
  for (var i = 0; i < AVATAR_PALETTE.length; i++) {
    var c = AVATAR_PALETTE[i];
    palHtml += '<div class="aed-color" data-color="' + c + '" style="background:' + c + '" title="' + c + '"></div>';
  }

  return '<div id="avatar-editor-overlay" role="dialog" aria-modal="true" aria-label="Avatar Creator">' +
    '<div id="avatar-editor-modal">' +
      '<div id="avatar-editor-header">' +
        '<span class="aed-title">&#9998; CUSTOM AVATAR</span>' +
        '<button id="aed-close-btn" aria-label="Close editor">&#10005;</button>' +
      '</div>' +
      '<div id="avatar-editor-body">' +

        // ── LEFT: tools + canvas + palette ──
        '<div id="aed-left">' +
          '<div id="aed-tools">' +
            '<button class="aed-tool-btn aed-tool-active" data-tool="pencil" title="Pencil (P)">&#9998;</button>' +
            '<button class="aed-tool-btn" data-tool="eraser"     title="Eraser (E)">&#9711;</button>' +
            '<button class="aed-tool-btn" data-tool="fill"       title="Fill bucket (F)">&#9724;</button>' +
            '<button class="aed-tool-btn" data-tool="eyedropper" title="Eyedropper (I)">&#128139;</button>' +
            '<span class="aed-sep"></span>' +
            '<button class="aed-tool-btn" id="aed-undo-btn" title="Undo (Ctrl+Z)">&#10226;</button>' +
            '<button class="aed-tool-btn" id="aed-redo-btn" title="Redo (Ctrl+Y)">&#10227;</button>' +
            '<span class="aed-sep"></span>' +
            '<button class="aed-tool-btn" id="aed-clear-btn" title="Clear canvas">&#128465;</button>' +
          '</div>' +
          '<canvas id="aed-canvas" width="' + sz + '" height="' + sz + '" tabindex="0"></canvas>' +
          '<div id="aed-palette">' + palHtml + '</div>' +
          '<div id="aed-color-row">' +
            '<div id="aed-cur-color"></div>' +
            '<input type="color" id="aed-custom-color" value="' + _edColor + '" title="Custom colour">' +
            '<span class="aed-color-label">Active colour</span>' +
          '</div>' +
        '</div>' +

        // ── RIGHT: preview + presets + actions ──
        '<div id="aed-right">' +
          '<div class="aed-section-label">PREVIEW</div>' +
          '<div id="aed-previews">' +
            '<div class="aed-preview-item"><canvas id="aed-prev-32"  width="32"  height="32" ></canvas><span>32px</span></div>' +
            '<div class="aed-preview-item"><canvas id="aed-prev-64"  width="64"  height="64" ></canvas><span>64px</span></div>' +
            '<div class="aed-preview-item"><canvas id="aed-prev-128" width="128" height="128"></canvas><span>128px</span></div>' +
          '</div>' +
          '<div class="aed-section-label">PRESETS (click to load)</div>' +
          '<div id="aed-presets">' + presetHtml + '</div>' +
          '<div class="aed-section-label">ACTIONS</div>' +
          '<div id="aed-actions">' +
            '<button id="aed-save-btn"   class="aed-action-btn aed-save-btn">&#128190; Use This Avatar</button>' +
            '<button id="aed-export-btn" class="aed-action-btn">&#8659; Export PNG</button>' +
            '<label  id="aed-import-label" class="aed-action-btn">&#8657; Import PNG' +
              '<input type="file" id="aed-import-input" accept="image/png,image/jpeg,image/gif" style="display:none">' +
            '</label>' +
          '</div>' +
        '</div>' +

      '</div>' +
    '</div>' +
  '</div>';
}

// ── Inject styles (once) ──────────────────────────────────────────────────────

var _aedStylesInjected = false;
function _edInjectStyles() {
  if (_aedStylesInjected) return;
  _aedStylesInjected = true;
  var style = document.createElement('style');
  style.textContent = [
    '#avatar-editor-overlay{',
      'position:fixed;inset:0;z-index:99990;',
      'background:rgba(0,0,0,0.82);',
      'display:flex;align-items:center;justify-content:center;',
      'overflow-y:auto;padding:12px;box-sizing:border-box;',
    '}',
    '#avatar-editor-modal{',
      'background:#0d1a0d;border:2px solid rgba(74,222,128,0.4);border-radius:8px;',
      'max-width:720px;width:100%;max-height:calc(100vh - 24px);overflow-y:auto;',
      'box-shadow:0 0 40px rgba(74,222,128,0.15);',
    '}',
    '#avatar-editor-header{',
      'display:flex;align-items:center;justify-content:space-between;',
      'padding:10px 14px;border-bottom:1px solid rgba(74,222,128,0.2);',
    '}',
    '.aed-title{',
      'font-family:"Press Start 2P",monospace;font-size:11px;',
      'color:#4ade80;letter-spacing:1px;',
    '}',
    '#aed-close-btn{',
      'background:none;border:1px solid rgba(255,255,255,0.2);border-radius:4px;',
      'color:#ccc;cursor:pointer;font-size:14px;padding:4px 8px;',
    '}',
    '#aed-close-btn:hover{border-color:#ff4444;color:#ff4444;}',
    '#avatar-editor-body{',
      'display:flex;gap:16px;padding:14px;flex-wrap:wrap;',
    '}',
    '#aed-left{',
      'display:flex;flex-direction:column;gap:8px;flex:0 0 auto;',
    '}',
    '#aed-tools{',
      'display:flex;flex-wrap:wrap;gap:4px;',
    '}',
    '.aed-tool-btn{',
      'background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:4px;',
      'color:#ccc;cursor:pointer;font-size:15px;padding:5px 8px;line-height:1;',
      'transition:border-color 0.15s,background 0.15s;',
    '}',
    '.aed-tool-btn:hover{border-color:rgba(74,222,128,0.5);}',
    '.aed-tool-btn.aed-tool-active{',
      'border-color:#4ade80;background:rgba(74,222,128,0.15);color:#4ade80;',
    '}',
    '.aed-sep{display:inline-block;width:1px;background:rgba(255,255,255,0.15);margin:0 2px;}',
    '#aed-canvas{',
      'image-rendering:pixelated;image-rendering:crisp-edges;',
      'cursor:crosshair;touch-action:none;',
      'border:1px solid rgba(74,222,128,0.25);border-radius:2px;',
      'max-width:100%;',
    '}',
    '#aed-palette{',
      'display:grid;grid-template-columns:repeat(8,1fr);gap:3px;',
    '}',
    '.aed-color{',
      'width:18px;height:18px;border-radius:2px;cursor:pointer;',
      'border:2px solid transparent;box-sizing:border-box;',
      'transition:transform 0.1s,border-color 0.1s;',
    '}',
    '.aed-color:hover{transform:scale(1.25);border-color:rgba(255,255,255,0.6);}',
    '#aed-color-row{',
      'display:flex;align-items:center;gap:8px;',
    '}',
    '#aed-cur-color{',
      'width:28px;height:28px;border-radius:4px;',
      'border:2px solid rgba(255,255,255,0.3);flex-shrink:0;',
    '}',
    '#aed-custom-color{',
      'width:32px;height:28px;border:none;padding:0;cursor:pointer;',
      'border-radius:4px;background:none;',
    '}',
    '.aed-color-label{font-size:8px;color:#888;font-family:"Press Start 2P",monospace;}',
    '#aed-right{',
      'display:flex;flex-direction:column;gap:10px;flex:1;min-width:160px;',
    '}',
    '.aed-section-label{',
      'font-family:"Press Start 2P",monospace;font-size:7px;',
      'color:#4ade80;letter-spacing:1px;',
    '}',
    '#aed-previews{',
      'display:flex;align-items:flex-end;gap:8px;',
    '}',
    '.aed-preview-item{',
      'display:flex;flex-direction:column;align-items:center;gap:3px;',
    '}',
    '.aed-preview-item canvas{',
      'image-rendering:pixelated;image-rendering:crisp-edges;',
      'border:1px solid rgba(74,222,128,0.25);border-radius:2px;',
    '}',
    '.aed-preview-item span{font-size:7px;color:#666;font-family:monospace;}',
    '#aed-presets{',
      'display:flex;flex-wrap:wrap;gap:4px;',
    '}',
    '.aed-preset-thumb{',
      'image-rendering:pixelated;image-rendering:crisp-edges;',
      'border:2px solid rgba(255,255,255,0.12);border-radius:3px;',
      'cursor:pointer;transition:border-color 0.15s,transform 0.1s;',
    '}',
    '.aed-preset-thumb:hover{border-color:rgba(74,222,128,0.6);transform:scale(1.1);}',
    '#aed-actions{display:flex;flex-direction:column;gap:6px;}',
    '.aed-action-btn{',
      'background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.25);border-radius:4px;',
      'color:#ccc;cursor:pointer;font-family:"Press Start 2P",monospace;font-size:8px;',
      'padding:8px 10px;text-align:center;transition:border-color 0.15s;',
    '}',
    '.aed-action-btn:hover{border-color:rgba(74,222,128,0.5);}',
    '.aed-save-btn{border-color:rgba(74,222,128,0.5);color:#4ade80;}',
    '.aed-save-btn:hover{background:rgba(74,222,128,0.15);}',
    // Custom avatar "Edit" button in the skin selector
    '.av-edit-custom-btn{',
      'margin-top:6px;padding:6px 10px;width:100%;',
      'background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.4);',
      'border-radius:4px;color:#4ade80;cursor:pointer;',
      'font-family:"Press Start 2P",monospace;font-size:7px;',
    '}',
    '.av-edit-custom-btn:hover{background:rgba(74,222,128,0.18);}',
    // Mini avatar in friends list
    '.friends-avatar-thumb{',
      'image-rendering:pixelated;image-rendering:crisp-edges;',
      'border-radius:2px;flex-shrink:0;',
    '}',
    '@media(max-width:520px){',
      '#avatar-editor-body{flex-direction:column;}',
      '#aed-canvas{max-width:256px;align-self:center;}',
    '}',
  ].join('');
  document.head.appendChild(style);
}

// ── Update UI helpers ─────────────────────────────────────────────────────────

function _edUpdatePreview() {
  var ids = ['aed-prev-32','aed-prev-64','aed-prev-128'];
  for (var i = 0; i < ids.length; i++) {
    var c = document.getElementById(ids[i]);
    if (c) renderCustomAvatarToCanvas(c, _edPixels, 'none');
  }
}

function _edUpdateToolUI() {
  var btns = document.querySelectorAll('#avatar-editor-overlay .aed-tool-btn[data-tool]');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('aed-tool-active', btns[i].getAttribute('data-tool') === _edTool);
  }
}

function _edUpdateColorIndicator() {
  var el = document.getElementById('aed-cur-color');
  if (el) el.style.background = _edColor;
  var inp = document.getElementById('aed-custom-color');
  if (inp) { try { inp.value = _edColor; } catch (_) {} }
}

function _edRenderPresets() {
  var thumbs = document.querySelectorAll('#avatar-editor-overlay .aed-preset-thumb');
  for (var i = 0; i < thumbs.length; i++) {
    var thumb = thumbs[i];
    var pid   = thumb.getAttribute('data-preset');
    if (typeof _AVATAR_DEFS !== 'undefined' && _AVATAR_DEFS[pid]) {
      renderCustomAvatarToCanvas(thumb, _upscalePreset(_AVATAR_DEFS[pid]), 'none');
    }
  }
}

function _edRefreshAllAvatarDisplays() {
  if (!isUsingCustomAvatar()) return;
  var px = getCustomAvatarPixels();
  var frameId = typeof getSelectedFrame === 'function' ? getSelectedFrame() : 'none';

  // Profile header
  var hdr = document.getElementById('profile-header-avatar');
  if (hdr) renderCustomAvatarToCanvas(hdr, px, frameId);

  // Avatar selector preview
  var prev = document.getElementById('av-preview-canvas');
  if (prev) renderCustomAvatarToCanvas(prev, px, frameId);

  // Leaderboard thumb
  var lb = document.querySelector('.lb-avatar-thumb');
  if (lb) renderCustomAvatarToCanvas(lb, px, frameId);
}

// ── Open the editor ───────────────────────────────────────────────────────────

function openAvatarCreator() {
  _edInjectStyles();

  // Remove any existing overlay
  var existing = document.getElementById('avatar-editor-overlay');
  if (existing) existing.remove();

  // Initialise working state
  var saved   = getCustomAvatarPixels();
  _edPixels   = saved ? saved.slice() : new Array(256).fill('');
  _edHistory  = [];
  _edRedo     = [];
  _edTool     = 'pencil';
  _edMouseDown = false;
  _edLastIdx  = -1;

  document.body.insertAdjacentHTML('beforeend', _edBuildOverlayHtml());

  var overlay = document.getElementById('avatar-editor-overlay');
  var canvas  = document.getElementById('aed-canvas');

  _edDrawCanvas(canvas);
  _edUpdatePreview();
  _edRenderPresets();
  _edUpdateColorIndicator();

  // ── Close ────────────────────────────────────────────────────────────────────
  document.getElementById('aed-close-btn').addEventListener('click', function () {
    overlay.remove();
  });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.remove();
  });

  // ── Tool buttons ─────────────────────────────────────────────────────────────
  var toolBtns = overlay.querySelectorAll('.aed-tool-btn[data-tool]');
  for (var ti = 0; ti < toolBtns.length; ti++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        _edTool = btn.getAttribute('data-tool');
        _edUpdateToolUI();
      });
    })(toolBtns[ti]);
  }

  // ── Undo / redo / clear ───────────────────────────────────────────────────────
  document.getElementById('aed-undo-btn').addEventListener('click', function () {
    _edUndoAction(); _edDrawCanvas(canvas); _edUpdatePreview();
  });
  document.getElementById('aed-redo-btn').addEventListener('click', function () {
    _edRedoAction(); _edDrawCanvas(canvas); _edUpdatePreview();
  });
  document.getElementById('aed-clear-btn').addEventListener('click', function () {
    if (!confirm('Clear the canvas?')) return;
    _edSaveHistory();
    _edPixels = new Array(256).fill('');
    _edDrawCanvas(canvas); _edUpdatePreview();
  });

  // ── Palette ───────────────────────────────────────────────────────────────────
  var colorDivs = overlay.querySelectorAll('.aed-color');
  for (var ci = 0; ci < colorDivs.length; ci++) {
    (function (div) {
      div.addEventListener('click', function () {
        _edColor = div.getAttribute('data-color');
        if (_edTool === 'eraser' || _edTool === 'eyedropper') _edTool = 'pencil';
        _edUpdateColorIndicator();
        _edUpdateToolUI();
      });
    })(colorDivs[ci]);
  }
  document.getElementById('aed-custom-color').addEventListener('input', function (e) {
    _edColor = e.target.value;
    if (_edTool === 'eraser' || _edTool === 'eyedropper') _edTool = 'pencil';
    _edUpdateColorIndicator();
    _edUpdateToolUI();
  });

  // ── Canvas mouse ─────────────────────────────────────────────────────────────
  canvas.addEventListener('mousedown', function (e) {
    e.preventDefault();
    _edMouseDown = true;
    _edLastIdx   = -1;
    if (_edTool !== 'eyedropper') _edSaveHistory();
    var idx = _edGetCellIdx(canvas, e);
    if (_edTool === 'fill') {
      _edApplyTool(idx, canvas);
    } else {
      _edApplyTool(idx, canvas);
    }
  });
  canvas.addEventListener('mousemove', function (e) {
    if (!_edMouseDown) return;
    e.preventDefault();
    _edApplyTool(_edGetCellIdx(canvas, e), canvas);
  });
  function _edEndDrag() { _edMouseDown = false; }
  canvas.addEventListener('mouseup',    _edEndDrag);
  canvas.addEventListener('mouseleave', _edEndDrag);

  // ── Canvas touch ─────────────────────────────────────────────────────────────
  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    _edMouseDown = true;
    _edLastIdx   = -1;
    if (_edTool !== 'eyedropper') _edSaveHistory();
    _edApplyTool(_edGetCellIdx(canvas, e), canvas);
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    if (!_edMouseDown) return;
    e.preventDefault();
    _edApplyTool(_edGetCellIdx(canvas, e), canvas);
  }, { passive: false });
  canvas.addEventListener('touchend', function () { _edMouseDown = false; });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  function _edKeydown(e) {
    if (!document.getElementById('avatar-editor-overlay')) {
      document.removeEventListener('keydown', _edKeydown);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault(); _edUndoAction(); _edDrawCanvas(canvas); _edUpdatePreview();
    } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault(); _edRedoAction(); _edDrawCanvas(canvas); _edUpdatePreview();
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'p': _edTool = 'pencil';     _edUpdateToolUI(); break;
        case 'e': _edTool = 'eraser';     _edUpdateToolUI(); break;
        case 'f': _edTool = 'fill';       _edUpdateToolUI(); break;
        case 'i': _edTool = 'eyedropper'; _edUpdateToolUI(); break;
      }
    }
  }
  document.addEventListener('keydown', _edKeydown);

  // ── Presets ───────────────────────────────────────────────────────────────────
  var presetThumbs = overlay.querySelectorAll('.aed-preset-thumb');
  for (var pi = 0; pi < presetThumbs.length; pi++) {
    (function (thumb) {
      thumb.addEventListener('click', function () {
        var pid = thumb.getAttribute('data-preset');
        if (typeof _AVATAR_DEFS !== 'undefined' && _AVATAR_DEFS[pid]) {
          _edSaveHistory();
          _edPixels = _upscalePreset(_AVATAR_DEFS[pid]);
          _edDrawCanvas(canvas); _edUpdatePreview();
        }
      });
    })(presetThumbs[pi]);
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  document.getElementById('aed-save-btn').addEventListener('click', function () {
    setCustomAvatarPixels(_edPixels);
    setUseCustomAvatar(true);
    if (typeof setSelectedAvatar === 'function') setSelectedAvatar('custom');
    syncCustomAvatarToCloud(_edPixels);
    document.removeEventListener('keydown', _edKeydown);
    overlay.remove();
    _edRefreshAllAvatarDisplays();
    // Re-mount avatar selector if it's open in the profile
    var avSection = document.querySelector('.av-section');
    if (avSection && typeof renderAvatarSelectorHtml === 'function' && typeof mountAvatarSelector === 'function') {
      var wc = document.getElementById('profile-wardrobe-content');
      if (wc) {
        wc.innerHTML = renderAvatarSelectorHtml();
        mountAvatarSelector(wc);
      }
    }
  });

  // ── Export ────────────────────────────────────────────────────────────────────
  document.getElementById('aed-export-btn').addEventListener('click', function () {
    var dataUrl = customAvatarToDataURL(_edPixels, 64);
    var a = document.createElement('a');
    a.href     = dataUrl;
    a.download = 'minetris-avatar.png';
    a.click();
  });

  // ── Import ────────────────────────────────────────────────────────────────────
  document.getElementById('aed-import-input').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var img = new Image();
    img.onload = function () {
      var c   = document.createElement('canvas');
      c.width = c.height = 16;
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, 16, 16);
      var data      = ctx.getImageData(0, 0, 16, 16);
      var newPixels = new Array(256).fill('');
      for (var i = 0; i < 256; i++) {
        var ri = data.data[i * 4];
        var gi = data.data[i * 4 + 1];
        var bi = data.data[i * 4 + 2];
        var ai = data.data[i * 4 + 3];
        if (ai > 10) newPixels[i] = '#' + _hexByte(ri) + _hexByte(gi) + _hexByte(bi);
      }
      _edSaveHistory();
      _edPixels = newPixels;
      _edDrawCanvas(canvas); _edUpdatePreview();
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  });
}

function _hexByte(n) {
  return ('0' + Math.max(0, Math.min(255, n | 0)).toString(16)).slice(-2);
}

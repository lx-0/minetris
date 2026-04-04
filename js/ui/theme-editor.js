// Custom Theme Creator — player-designed color palettes.
// Unlock gate: level 10.  Up to 5 custom themes stored in localStorage.
//
// Depends on: config.js (COLORS, COLOR_TO_INDEX), settings.js (applyTheme, activeTheme),
//             leveling.js (getPlayerLevel)

const CUSTOM_THEMES_KEY  = 'mineCtris_customThemes';
const CUSTOM_THEME_MAX   = 5;

// The 8 main block-type slots a player can colour (indices match COLORS array).
const THEME_EDITOR_SLOTS = [
  { idx: 1, name: 'Dirt',    defaultHex: '#8b4513' },
  { idx: 2, name: 'Stone',   defaultHex: '#808080' },
  { idx: 3, name: 'Gold',    defaultHex: '#ffff00' },
  { idx: 4, name: 'Ice',     defaultHex: '#00ffff' },
  { idx: 5, name: 'Moss',    defaultHex: '#008000' },
  { idx: 6, name: 'Lava',    defaultHex: '#ff0000' },
  { idx: 7, name: 'Crystal', defaultHex: '#800080' },
  { idx: 8, name: 'Diamond', defaultHex: '#1a237e' },
];

// ── Storage ─────────────────────────────────────────────────────────────────────

function _loadCustomThemes() {
  try {
    var raw = localStorage.getItem(CUSTOM_THEMES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

function _saveCustomThemes(themes) {
  try { localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes)); } catch (_) {}
}

function getCustomTheme(id) {
  var themes = _loadCustomThemes();
  for (var i = 0; i < themes.length; i++) {
    if (themes[i].id === id) return themes[i];
  }
  return null;
}

// ── Palette builder ─────────────────────────────────────────────────────────────

/**
 * Build a 16-entry palette array (hex integers, matching COLORS layout) for
 * a saved custom theme.  Hazard slots (9-15) keep their canonical values.
 * @param {string} id  e.g. "custom_0"
 * @returns {Array|null}
 */
function getCustomThemePalette(id) {
  var theme = getCustomTheme(id);
  if (!theme) return null;
  var palette = new Array(16).fill(null);
  for (var i = 0; i < THEME_EDITOR_SLOTS.length; i++) {
    var slot = THEME_EDITOR_SLOTS[i];
    var hexStr = (theme.colors && theme.colors[i]) || slot.defaultHex;
    palette[slot.idx] = parseInt(hexStr.replace('#', ''), 16);
  }
  // Preserve canonical hazard/special colours for indices 9-15.
  for (var j = 9; j <= 15; j++) {
    if (typeof COLORS !== 'undefined' && COLORS[j] !== undefined) {
      palette[j] = COLORS[j];
    }
  }
  return palette;
}

// ── Unlock gate ─────────────────────────────────────────────────────────────────

function isThemeEditorUnlocked() {
  if (typeof getPlayerLevel === 'function') return getPlayerLevel() >= 10;
  return false;
}

// ── Editor state ────────────────────────────────────────────────────────────────

var _editorColors      = THEME_EDITOR_SLOTS.map(function(s) { return s.defaultHex; });
var _editorName        = 'My Theme';
var _editorBgColor     = '#111111';
var _editorGridEnabled = false;
var _editorGridColor   = '#333333';
var _editorGridOpacity = 0.4;
var _editorEditingId   = null; // null = new theme

// ── Open / close ────────────────────────────────────────────────────────────────

function openThemeEditor(existingId) {
  var overlay = document.getElementById('theme-editor-overlay');
  if (!overlay) return;

  if (existingId) {
    var theme = getCustomTheme(existingId);
    if (theme) {
      _editorEditingId   = existingId;
      _editorName        = theme.name || 'My Theme';
      _editorColors      = (theme.colors || []).slice();
      // Pad to correct length with defaults
      for (var i = _editorColors.length; i < THEME_EDITOR_SLOTS.length; i++) {
        _editorColors[i] = THEME_EDITOR_SLOTS[i].defaultHex;
      }
      _editorBgColor     = theme.bgColor || '#111111';
      _editorGridEnabled = !!theme.gridEnabled;
      _editorGridColor   = theme.gridColor || '#333333';
      _editorGridOpacity = (theme.gridOpacity !== undefined) ? theme.gridOpacity : 0.4;
    }
  } else {
    _editorEditingId   = null;
    _editorName        = 'My Theme';
    _editorColors      = THEME_EDITOR_SLOTS.map(function(s) { return s.defaultHex; });
    _editorBgColor     = '#111111';
    _editorGridEnabled = false;
    _editorGridColor   = '#333333';
    _editorGridOpacity = 0.4;
  }

  _renderThemeEditorUI();
  overlay.style.display = 'flex';
}

function closeThemeEditor() {
  var overlay = document.getElementById('theme-editor-overlay');
  if (overlay) overlay.style.display = 'none';
  // Clear export field
  var shareOut = document.getElementById('te-share-output');
  if (shareOut) { shareOut.value = ''; shareOut.style.display = 'none'; }
}

// ── UI sync ─────────────────────────────────────────────────────────────────────

function _renderThemeEditorUI() {
  var nameInput = document.getElementById('te-name-input');
  if (nameInput) nameInput.value = _editorName;

  var bgInput = document.getElementById('te-bg-color');
  if (bgInput) bgInput.value = _editorBgColor;

  var gridToggle = document.getElementById('te-grid-toggle');
  if (gridToggle) gridToggle.checked = _editorGridEnabled;
  _syncGridControls();

  var gridColorInput = document.getElementById('te-grid-color');
  if (gridColorInput) gridColorInput.value = _editorGridColor;

  var opacityVal = Math.round(_editorGridOpacity * 100);
  var gridOpacityInput = document.getElementById('te-grid-opacity');
  if (gridOpacityInput) gridOpacityInput.value = opacityVal;
  var gridOpacityLabel = document.getElementById('te-grid-opacity-val');
  if (gridOpacityLabel) gridOpacityLabel.textContent = opacityVal + '%';

  for (var i = 0; i < THEME_EDITOR_SLOTS.length; i++) {
    var colorInput = document.getElementById('te-color-' + i);
    var swatch     = document.getElementById('te-swatch-' + i);
    var hex = _editorColors[i] || THEME_EDITOR_SLOTS[i].defaultHex;
    if (colorInput) colorInput.value = hex;
    if (swatch)     swatch.style.backgroundColor = hex;
  }

  // Save button state
  var saveBtn = document.getElementById('te-save-btn');
  if (saveBtn) {
    var themes = _loadCustomThemes();
    var atMax = !_editorEditingId && themes.length >= CUSTOM_THEME_MAX;
    saveBtn.disabled = atMax;
    saveBtn.title = atMax ? 'Maximum 5 custom themes reached' : '';
  }

  // Heading
  var heading = document.getElementById('te-heading');
  if (heading) heading.textContent = _editorEditingId ? 'Edit Theme' : 'Create Theme';

  _updatePreview();
}

function _syncGridControls() {
  var controls = document.getElementById('te-grid-controls');
  if (controls) controls.style.display = _editorGridEnabled ? '' : 'none';
}

// ── Live preview ────────────────────────────────────────────────────────────────

function _updatePreview() {
  var canvas = document.getElementById('te-preview-canvas');
  if (!canvas) return;
  var ctx  = canvas.getContext('2d');
  var W    = canvas.width;
  var H    = canvas.height;
  var cols = THEME_EDITOR_SLOTS.length; // 8
  var rows = 3;
  var padX = 4;
  var padY = 4;
  var cellW = (W - padX * 2) / cols;
  var cellH = (H - padY * 2) / rows;

  // Background
  ctx.fillStyle = _editorBgColor;
  ctx.fillRect(0, 0, W, H);

  // Draw coloured block samples — each column = one block type, 3 rows
  for (var row = 0; row < rows; row++) {
    for (var col = 0; col < cols; col++) {
      var hex = _editorColors[col] || THEME_EDITOR_SLOTS[col].defaultHex;
      var x = padX + col * cellW;
      var y = padY + row * cellH;

      // Block face
      ctx.fillStyle = hex;
      ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

      // Highlight top-left edge (retro pixel-art feel)
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 1, y + 1, cellW - 2, 2);
      ctx.fillRect(x + 1, y + 1, 2, cellH - 2);

      // Shadow bottom-right edge
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x + 1, y + cellH - 3, cellW - 2, 2);
      ctx.fillRect(x + cellW - 3, y + 1, 2, cellH - 2);
    }
  }

  // Optional grid overlay
  if (_editorGridEnabled) {
    ctx.strokeStyle = _editorGridColor;
    ctx.globalAlpha = _editorGridOpacity;
    ctx.lineWidth = 1;
    for (var cx = 0; cx <= cols; cx++) {
      var lx = padX + cx * cellW;
      ctx.beginPath(); ctx.moveTo(lx, padY); ctx.lineTo(lx, H - padY); ctx.stroke();
    }
    for (var ry = 0; ry <= rows; ry++) {
      var ly = padY + ry * cellH;
      ctx.beginPath(); ctx.moveTo(padX, ly); ctx.lineTo(W - padX, ly); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Block type labels below the preview (first row)
  ctx.fillStyle = '#888';
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  for (var li = 0; li < THEME_EDITOR_SLOTS.length; li++) {
    var lx2 = padX + li * cellW + cellW / 2;
    var ly2 = H - 1;
    ctx.fillText(THEME_EDITOR_SLOTS[li].name.slice(0, 3), lx2, ly2);
  }
}

// ── Save / delete ────────────────────────────────────────────────────────────────

function saveCustomTheme() {
  var nameInput = document.getElementById('te-name-input');
  var name = nameInput ? nameInput.value.trim() : 'My Theme';
  if (!name) name = 'My Theme';

  var themes = _loadCustomThemes();

  if (_editorEditingId) {
    var idx = -1;
    for (var i = 0; i < themes.length; i++) {
      if (themes[i].id === _editorEditingId) { idx = i; break; }
    }
    if (idx >= 0) {
      themes[idx] = _buildThemeObject(_editorEditingId, name);
    }
  } else {
    if (themes.length >= CUSTOM_THEME_MAX) return;
    var newId = 'custom_' + themes.length;
    themes.push(_buildThemeObject(newId, name));
  }

  _saveCustomThemes(themes);
  closeThemeEditor();
  _syncCustomThemeButtons();

  // If the active theme was the one we just edited, re-apply to refresh colours.
  if (_editorEditingId && typeof activeTheme !== 'undefined' && activeTheme === _editorEditingId) {
    if (typeof applyTheme === 'function') applyTheme(_editorEditingId);
  }
}

function _buildThemeObject(id, name) {
  return {
    id:          id,
    name:        name,
    colors:      _editorColors.slice(),
    bgColor:     _editorBgColor,
    gridEnabled: _editorGridEnabled,
    gridColor:   _editorGridColor,
    gridOpacity: _editorGridOpacity,
  };
}

function deleteCustomTheme(id) {
  var themes = _loadCustomThemes().filter(function(t) { return t.id !== id; });
  // Re-number IDs so slots stay 0-based consecutive.
  for (var i = 0; i < themes.length; i++) {
    themes[i].id = 'custom_' + i;
  }
  _saveCustomThemes(themes);

  // Revert to classic if this theme was active.
  if (typeof activeTheme !== 'undefined' && activeTheme === id) {
    if (typeof applyTheme === 'function') applyTheme('classic');
  }

  _syncCustomThemeButtons();
}

// ── Export / import ──────────────────────────────────────────────────────────────

function exportCustomThemeString(id) {
  var theme = getCustomTheme(id);
  if (!theme) return '';
  var exportObj = {
    name:        theme.name,
    colors:      theme.colors,
    bgColor:     theme.bgColor,
    gridEnabled: theme.gridEnabled,
    gridColor:   theme.gridColor,
    gridOpacity: theme.gridOpacity,
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(exportObj))));
}

function importCustomThemeString(str) {
  try {
    var json = decodeURIComponent(escape(atob(str.trim())));
    var theme = JSON.parse(json);
    if (!theme || typeof theme !== 'object') return false;
    if (!Array.isArray(theme.colors) || theme.colors.length < THEME_EDITOR_SLOTS.length) return false;

    var themes = _loadCustomThemes();
    if (themes.length >= CUSTOM_THEME_MAX) return false;

    theme.id = 'custom_' + themes.length;
    themes.push(theme);
    _saveCustomThemes(themes);
    _syncCustomThemeButtons();
    return true;
  } catch (_) { return false; }
}

// ── Custom theme buttons in settings ────────────────────────────────────────────

function _syncCustomThemeButtons() {
  var container = document.getElementById('custom-theme-selector');
  if (!container) return;
  container.innerHTML = '';

  var themes   = _loadCustomThemes();
  var unlocked = isThemeEditorUnlocked();

  for (var ti = 0; ti < themes.length; ti++) {
    (function(theme) {
      var item = document.createElement('div');
      item.className = 'custom-theme-item' +
        (typeof activeTheme !== 'undefined' && activeTheme === theme.id ? ' custom-theme-item-selected' : '');

      // Colour swatch strip
      var swatchRow = document.createElement('div');
      swatchRow.className = 'custom-theme-swatches';
      for (var si = 0; si < 6 && si < theme.colors.length; si++) {
        var sw = document.createElement('div');
        sw.className = 'custom-theme-swatch';
        sw.style.backgroundColor = theme.colors[si] || THEME_EDITOR_SLOTS[si].defaultHex;
        swatchRow.appendChild(sw);
      }

      var nameEl = document.createElement('div');
      nameEl.className = 'custom-theme-name';
      nameEl.textContent = theme.name;

      var actions = document.createElement('div');
      actions.className = 'custom-theme-actions';

      var isActive = typeof activeTheme !== 'undefined' && activeTheme === theme.id;

      var applyBtn = document.createElement('button');
      applyBtn.className = 'custom-theme-apply-btn';
      applyBtn.textContent = isActive ? 'Active' : 'Apply';
      applyBtn.disabled = isActive;
      applyBtn.addEventListener('click', function() {
        if (typeof applyTheme === 'function') applyTheme(theme.id);
      });

      var editBtn = document.createElement('button');
      editBtn.className = 'custom-theme-edit-btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', function() {
        openThemeEditor(theme.id);
      });

      var delBtn = document.createElement('button');
      delBtn.className = 'custom-theme-del-btn';
      delBtn.textContent = 'Del';
      delBtn.title = 'Delete theme';
      delBtn.addEventListener('click', function() {
        deleteCustomTheme(theme.id);
      });

      actions.appendChild(applyBtn);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      item.appendChild(swatchRow);
      item.appendChild(nameEl);
      item.appendChild(actions);
      container.appendChild(item);
    })(themes[ti]);
  }

  // Sync the "Create" button state
  var openBtn = document.getElementById('theme-editor-open-btn');
  if (openBtn) {
    if (!unlocked) {
      openBtn.disabled = true;
      openBtn.title = 'Reach Level 10 to unlock the Theme Creator';
    } else if (themes.length >= CUSTOM_THEME_MAX) {
      openBtn.disabled = true;
      openBtn.title = 'Maximum 5 custom themes — delete one to create more';
    } else {
      openBtn.disabled = false;
      openBtn.title = '';
    }
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────────

function initThemeEditor() {
  // Close button
  var closeBtn = document.getElementById('te-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeThemeEditor);

  // Theme name
  var nameInput = document.getElementById('te-name-input');
  if (nameInput) {
    nameInput.addEventListener('input', function() { _editorName = this.value; });
  }

  // Background colour
  var bgInput = document.getElementById('te-bg-color');
  if (bgInput) {
    bgInput.addEventListener('input', function() {
      _editorBgColor = this.value;
      _updatePreview();
    });
  }

  // Grid toggle
  var gridToggle = document.getElementById('te-grid-toggle');
  if (gridToggle) {
    gridToggle.addEventListener('change', function() {
      _editorGridEnabled = this.checked;
      _syncGridControls();
      _updatePreview();
    });
  }

  // Grid colour
  var gridColorInput = document.getElementById('te-grid-color');
  if (gridColorInput) {
    gridColorInput.addEventListener('input', function() {
      _editorGridColor = this.value;
      _updatePreview();
    });
  }

  // Grid opacity
  var gridOpacityInput = document.getElementById('te-grid-opacity');
  if (gridOpacityInput) {
    gridOpacityInput.addEventListener('input', function() {
      _editorGridOpacity = parseInt(this.value, 10) / 100;
      var label = document.getElementById('te-grid-opacity-val');
      if (label) label.textContent = this.value + '%';
      _updatePreview();
    });
  }

  // Per-block colour pickers
  for (var i = 0; i < THEME_EDITOR_SLOTS.length; i++) {
    (function(idx) {
      var colorInput = document.getElementById('te-color-' + idx);
      if (colorInput) {
        colorInput.addEventListener('input', function() {
          _editorColors[idx] = this.value;
          var swatch = document.getElementById('te-swatch-' + idx);
          if (swatch) swatch.style.backgroundColor = this.value;
          _updatePreview();
        });
      }
    })(i);
  }

  // Save
  var saveBtn = document.getElementById('te-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveCustomTheme);

  // Export current editor state
  var exportEditorBtn = document.getElementById('te-export-btn');
  if (exportEditorBtn) {
    exportEditorBtn.addEventListener('click', function() {
      var theme = _buildThemeObject(_editorEditingId || 'tmp', _editorName);
      var exportObj = {
        name:        theme.name,
        colors:      theme.colors,
        bgColor:     theme.bgColor,
        gridEnabled: theme.gridEnabled,
        gridColor:   theme.gridColor,
        gridOpacity: theme.gridOpacity,
      };
      var str = btoa(unescape(encodeURIComponent(JSON.stringify(exportObj))));
      var shareOut = document.getElementById('te-share-output');
      if (shareOut) {
        shareOut.value = str;
        shareOut.style.display = '';
        shareOut.select();
        try { document.execCommand('copy'); } catch (_) {}
      }
      var fb = document.getElementById('te-export-feedback');
      if (fb) {
        fb.textContent = 'Copied to clipboard!';
        fb.style.color = '#0f0';
        fb.style.display = '';
        clearTimeout(fb._t);
        fb._t = setTimeout(function() { fb.style.display = 'none'; }, 2500);
      }
    });
  }

  // Import
  var importBtn   = document.getElementById('te-import-btn');
  var importInput = document.getElementById('te-import-input');
  if (importBtn && importInput) {
    importBtn.addEventListener('click', function() {
      var str = importInput.value.trim();
      if (!str) return;
      var ok = importCustomThemeString(str);
      var fb = document.getElementById('te-import-feedback');
      if (fb) {
        fb.textContent = ok ? 'Theme imported!' : 'Invalid theme string.';
        fb.style.color  = ok ? '#0f0' : '#f55';
        fb.style.display = '';
        clearTimeout(fb._t);
        fb._t = setTimeout(function() { fb.style.display = 'none'; }, 2500);
      }
      if (ok) {
        importInput.value = '';
        closeThemeEditor();
      }
    });
  }

  // "Create Theme" button in settings panel
  var openBtn = document.getElementById('theme-editor-open-btn');
  if (openBtn) {
    openBtn.addEventListener('click', function() {
      if (!isThemeEditorUnlocked()) return;
      openThemeEditor(null);
    });
  }

  // Escape closes the editor overlay
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    var overlay = document.getElementById('theme-editor-overlay');
    if (overlay && overlay.style.display !== 'none') {
      e.preventDefault();
      closeThemeEditor();
    }
  });

  _syncCustomThemeButtons();
}

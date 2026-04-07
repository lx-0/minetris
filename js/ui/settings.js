// Audio + accessibility settings panel — persists to localStorage.
// Requires: audio.js (applyAudioSettings), state.js (colorblindMode, activeTheme),
//           world.js (createBlockMesh), shaders.js (createBlockMaterialColorblind),
//           achievements.js (loadAchievements)

// ── Focus trap utility ───────────────────────────────────────────────────────
// Traps keyboard focus inside a dialog element until releaseFocusTrap() is called.
// Supports nested traps: each call pushes onto a stack; release pops the top.
(function () {
  var _trapStack = [];
  var _trapHandlers = [];

  var FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function _getFocusable(el) {
    return Array.prototype.slice.call(el.querySelectorAll(FOCUSABLE)).filter(function (n) {
      return !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length);
    });
  }

  window.trapFocus = function (el, onEscape) {
    var handler = function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (typeof onEscape === 'function') { e.preventDefault(); onEscape(); }
        return;
      }
      if (e.key !== 'Tab' && e.keyCode !== 9) return;
      var focusable = _getFocusable(el);
      if (!focusable.length) { e.preventDefault(); return; }
      var first = focusable[0];
      var last  = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    _trapStack.push(el);
    _trapHandlers.push(handler);
    // Focus first focusable element inside the dialog.
    var focusable = _getFocusable(el);
    if (focusable.length) focusable[0].focus();
  };

  window.releaseFocusTrap = function () {
    if (!_trapStack.length) return;
    var handler = _trapHandlers.pop();
    _trapStack.pop();
    document.removeEventListener('keydown', handler);
  };
}());

// GAME_VERSION is defined in config.js
const TRANSFER_LAST_EXPORT_KEY = "mineCtris_lastExportTime";

const AUDIO_SETTINGS_KEY    = "mineCtris_audioSettings";
const COLORBLIND_KEY        = "mineCtris_colorblindMode";
const REDUCED_MOTION_KEY    = "mineCtris_reducedMotion";
const HIGH_CONTRAST_KEY     = "mineCtris_highContrast";
const THEME_STORAGE_KEY          = "mineCtris_theme";
const THEME_SCORE_UNLOCKS_KEY    = "mineCtris_themeScoreUnlocks";
const MOBILE_DIFFICULTY_KEY = "mineCtris_mobileDifficulty";
const DYNAMIC_MUSIC_KEY     = "mineCtris_dynamicMusic";
const SFX_MUTE_KEY          = "mineCtris_sfxMute";
const MUSIC_MUTE_KEY        = "mineCtris_musicMute";
const FONT_SIZE_KEY         = "mineCtris_uiFontSize";
const GLOW_INTENSITY_KEY    = "mineCtris_glowIntensity";
const PARTICLE_INTENSITY_KEY = "mineCtris_particleIntensity";
const LOCK_DELAY_KEY        = "mineCtris_lockDelay";
const BOARD_SIZE_KEY        = "mineCtris_boardSize";
const NEXT_PIECE_COUNT_KEY  = "mineCtris_nextPieceCount";
const GHOST_OPACITY_KEY     = "mineCtris_ghostOpacity";
const HOLD_VISIBLE_KEY      = "mineCtris_holdVisible";
const PREVIEW_SIDE_KEY      = "mineCtris_previewSide";

// Piece preview settings
// Next piece count: 1–6, default 5.
let playerNextPieceCount = 5;
// Ghost piece opacity: 0–100 (%), default 30.
let playerGhostOpacity = 30;
// Hold piece panel visible: default true.
let playerHoldVisible = true;
// Preview panel side: 'right' (default) or 'left'.
let playerPreviewSide = 'right';

// Lock delay in milliseconds: 200 (fast), 500 (standard), 800 (relaxed). Default 500.
let playerLockDelayMs = 500;

// Board size: 'classic' (10×20), 'wide' (12×20), 'tall' (10×24). Default 'classic'.
let playerBoardSize = 'classic';

const BOARD_SIZE_PRESETS = {
  classic: { cols: 10, rows: 20 },
  wide:    { cols: 12, rows: 20 },
  tall:    { cols: 10, rows: 24 },
};

function getBoardCols() {
  return (BOARD_SIZE_PRESETS[playerBoardSize] || BOARD_SIZE_PRESETS.classic).cols;
}

function getBoardRows() {
  return (BOARD_SIZE_PRESETS[playerBoardSize] || BOARD_SIZE_PRESETS.classic).rows;
}

// Global: true = apply 20% speed reduction on mobile. Default ON for touch devices.
let mobileDifficultyEnabled = false;

let _audioSettings = { master: 80, sfx: 100, music: 60 };
let _settingsCloseCallback = null;

function _loadAudioSettings() {
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      _audioSettings = {
        master: typeof p.master === "number" ? p.master : 80,
        sfx:    typeof p.sfx   === "number" ? p.sfx   : 100,
        music:  typeof p.music === "number" ? p.music :  60,
      };
    }
  } catch (_) {}
}

function _saveAudioSettings() {
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(_audioSettings));
  } catch (_) {}
  if (typeof onAutoSync === 'function') onAutoSync();
}

function _syncSliders() {
  const ids = [
    ["vol-master", "vol-master-val", "master"],
    ["vol-sfx",    "vol-sfx-val",    "sfx"],
    ["vol-music",  "vol-music-val",  "music"],
  ];
  for (const [sliderId, valId, key] of ids) {
    const slider = document.getElementById(sliderId);
    const label  = document.getElementById(valId);
    if (slider) slider.value = _audioSettings[key];
    if (label)  label.textContent = _audioSettings[key];
  }
}

// ── Dynamic music toggle ──────────────────────────────────────────────────────

function _loadDynamicMusic() {
  try {
    const raw = localStorage.getItem(DYNAMIC_MUSIC_KEY);
    // Default ON; only false if explicitly saved as "false"
    const enabled = raw !== "false";
    if (typeof setDynamicMusicEnabled === 'function') setDynamicMusicEnabled(enabled);
    const toggle = document.getElementById("dynamic-music-toggle");
    if (toggle) toggle.checked = enabled;
  } catch (_) {}
}

function _saveDynamicMusic(enabled) {
  try {
    localStorage.setItem(DYNAMIC_MUSIC_KEY, String(enabled));
  } catch (_) {}
}

// ── SFX mute toggle ───────────────────────────────────────────────────────────

function _loadSfxMute() {
  try {
    const raw = localStorage.getItem(SFX_MUTE_KEY);
    const muted = raw === "true";
    if (typeof setSfxMuted === 'function') setSfxMuted(muted);
    const toggle = document.getElementById("sfx-mute-toggle");
    if (toggle) toggle.checked = muted;
  } catch (_) {}
}

function _saveSfxMute(muted) {
  try {
    localStorage.setItem(SFX_MUTE_KEY, String(muted));
  } catch (_) {}
}

// ── Music mute toggle ─────────────────────────────────────────────────────────

function _loadMusicMute() {
  try {
    const raw = localStorage.getItem(MUSIC_MUTE_KEY);
    const muted = raw === "true";
    if (typeof setMusicMuted === 'function') setMusicMuted(muted);
    const toggle = document.getElementById("music-mute-toggle");
    if (toggle) toggle.checked = muted;
  } catch (_) {}
}

function _saveMusicMute(muted) {
  try {
    localStorage.setItem(MUSIC_MUTE_KEY, String(muted));
  } catch (_) {}
}

// ── Reduced motion ────────────────────────────────────────────────────────────

function _loadReducedMotion() {
  try {
    const raw = localStorage.getItem(REDUCED_MOTION_KEY);
    if (raw !== null) reducedMotionEnabled = (raw === 'true');
  } catch (_) {}
}

function applyReducedMotion(enabled) {
  reducedMotionEnabled = enabled;
  try {
    localStorage.setItem(REDUCED_MOTION_KEY, String(enabled));
  } catch (_) {}
}

// ── Board edge glow intensity ─────────────────────────────────────────────────
// Values: 'off'=0, 'low'=0.5, 'medium'=1.0, 'high'=1.5. Default: 'medium'.
// Global boardGlowIntensity is defined in lineclear.js.

function _glowLabelToIntensity(label) {
  return label === 'off' ? 0 : label === 'low' ? 0.5 : label === 'high' ? 1.5 : 1.0;
}

function _loadGlowIntensity() {
  try {
    const raw = localStorage.getItem(GLOW_INTENSITY_KEY);
    const label = (raw === 'off' || raw === 'low' || raw === 'medium' || raw === 'high') ? raw : 'medium';
    if (typeof boardGlowIntensity !== 'undefined') {
      boardGlowIntensity = _glowLabelToIntensity(label);
    }
    // Reflect off-state on body for CSS hide rule
    document.body.classList.toggle('board-glow-off', label === 'off');
    // Sync OS prefers-reduced-motion: if user hasn't saved a pref, default off
    if (raw === null) {
      try {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          if (typeof boardGlowIntensity !== 'undefined') boardGlowIntensity = 0;
          document.body.classList.add('board-glow-off');
        }
      } catch (_) {}
    }
  } catch (_) {}
}

function applyGlowIntensity(label) {
  if (typeof boardGlowIntensity !== 'undefined') {
    boardGlowIntensity = _glowLabelToIntensity(label);
  }
  document.body.classList.toggle('board-glow-off', label === 'off');
  try {
    localStorage.setItem(GLOW_INTENSITY_KEY, label);
  } catch (_) {}
}

// ── Particle intensity ────────────────────────────────────────────────────────
// Values: 'off' | 'low' | 'medium' | 'high'. Default: 'medium'.

function _loadParticleIntensity() {
  try {
    const raw = localStorage.getItem(PARTICLE_INTENSITY_KEY);
    const label = (raw === 'off' || raw === 'low' || raw === 'medium' || raw === 'high') ? raw : 'medium';
    if (typeof particleIntensityLevel !== 'undefined') particleIntensityLevel = label;
  } catch (_) {}
}

function applyParticleIntensity(label) {
  if (typeof particleIntensityLevel !== 'undefined') particleIntensityLevel = label;
  try {
    localStorage.setItem(PARTICLE_INTENSITY_KEY, label);
  } catch (_) {}
}

// ── Lock delay ────────────────────────────────────────────────────────────────

function _loadLockDelay() {
  try {
    const raw = localStorage.getItem(LOCK_DELAY_KEY);
    const v = parseInt(raw, 10);
    if (v === 200 || v === 500 || v === 800) playerLockDelayMs = v;
  } catch (_) {}
}

function _saveLockDelay(ms) {
  playerLockDelayMs = ms;
  try {
    localStorage.setItem(LOCK_DELAY_KEY, String(ms));
  } catch (_) {}
}

// ── Board size ────────────────────────────────────────────────────────────────

function _loadBoardSize() {
  try {
    const raw = localStorage.getItem(BOARD_SIZE_KEY);
    if (raw === 'classic' || raw === 'wide' || raw === 'tall') playerBoardSize = raw;
  } catch (_) {}
}

function _saveBoardSize(size) {
  playerBoardSize = size;
  try {
    localStorage.setItem(BOARD_SIZE_KEY, size);
  } catch (_) {}
}

// ── Piece preview settings ────────────────────────────────────────────────────

function _loadNextPieceCount() {
  try {
    const v = parseInt(localStorage.getItem(NEXT_PIECE_COUNT_KEY), 10);
    if (v >= 1 && v <= 6) playerNextPieceCount = v;
  } catch (_) {}
}

function _saveNextPieceCount(n) {
  playerNextPieceCount = n;
  try { localStorage.setItem(NEXT_PIECE_COUNT_KEY, String(n)); } catch (_) {}
  if (typeof updateNextPiecesHUD === 'function') updateNextPiecesHUD();
}

function _loadGhostOpacity() {
  try {
    const v = parseInt(localStorage.getItem(GHOST_OPACITY_KEY), 10);
    if (!isNaN(v) && v >= 0 && v <= 100) playerGhostOpacity = v;
  } catch (_) {}
}

function _saveGhostOpacity(pct) {
  playerGhostOpacity = pct;
  try { localStorage.setItem(GHOST_OPACITY_KEY, String(pct)); } catch (_) {}
}

function _loadHoldVisible() {
  try {
    const raw = localStorage.getItem(HOLD_VISIBLE_KEY);
    if (raw !== null) playerHoldVisible = (raw !== 'false');
  } catch (_) {}
}

function applyHoldVisible(visible) {
  playerHoldVisible = visible;
  try { localStorage.setItem(HOLD_VISIBLE_KEY, String(visible)); } catch (_) {}
  const panel = document.getElementById('hold-piece-panel');
  if (!panel) return;
  // Only hide if game is running (panel has content); if it was already hidden by game logic, leave it.
  if (!visible) {
    panel.style.display = 'none';
  } else {
    // Restore — game code (updateHoldPanelHUD) will set actual display when needed.
    if (typeof updateHoldPanelHUD === 'function') updateHoldPanelHUD();
  }
}

function _loadPreviewSide() {
  try {
    const raw = localStorage.getItem(PREVIEW_SIDE_KEY);
    if (raw === 'left' || raw === 'right') playerPreviewSide = raw;
  } catch (_) {}
}

function applyPreviewSide(side) {
  playerPreviewSide = (side === 'left') ? 'left' : 'right';
  try { localStorage.setItem(PREVIEW_SIDE_KEY, playerPreviewSide); } catch (_) {}
  document.body.classList.toggle('preview-panel-left', playerPreviewSide === 'left');
}

// ── High contrast mode ────────────────────────────────────────────────────────

function _loadHighContrast() {
  try {
    const raw = localStorage.getItem(HIGH_CONTRAST_KEY);
    if (raw !== null) highContrastEnabled = (raw === 'true');
  } catch (_) {}
  _applyHighContrastClass();
}

function applyHighContrast(enabled) {
  highContrastEnabled = enabled;
  _applyHighContrastClass();
  _applyHighContrast3D(enabled);
  try {
    localStorage.setItem(HIGH_CONTRAST_KEY, String(enabled));
  } catch (_) {}
}

function _applyHighContrastClass() {
  if (highContrastEnabled) {
    document.body.classList.add('hc-mode');
  } else {
    document.body.classList.remove('hc-mode');
  }
}

/**
 * Apply or remove 3D high-contrast effects on existing block meshes:
 * - White block edge outlines on all landed blocks
 * - Bright emissive boost on the active falling piece(s)
 */
function _applyHighContrast3D(enabled) {
  // Update edge mesh color on all existing landed blocks.
  if (typeof worldGroup !== 'undefined' && worldGroup) {
    worldGroup.traverse(function(obj) {
      if (!obj.userData || !obj.userData.isBlock) return;
      obj.children.forEach(function(child) {
        if (child.isLineSegments && child.material) {
          child.material.color.setHex(enabled ? 0xffffff : 0x000000);
          child.material.needsUpdate = true;
        }
      });
    });
  }
  // Boost emissive on active falling pieces to make them clearly stand out.
  if (typeof fallingPiecesGroup !== 'undefined' && fallingPiecesGroup) {
    fallingPiecesGroup.traverse(function(obj) {
      if (!obj.userData || !obj.userData.isBlock) return;
      if (obj.material && obj.material.emissive) {
        if (enabled) {
          obj.userData._hcSavedEmissive = obj.material.emissive.clone();
          obj.userData._hcSavedEmissiveIntensity = obj.material.emissiveIntensity || 1.0;
          obj.material.emissive.setRGB(0.5, 0.5, 0.5);
          obj.material.emissiveIntensity = 1.5;
        } else {
          if (obj.userData._hcSavedEmissive) {
            obj.material.emissive.copy(obj.userData._hcSavedEmissive);
            obj.material.emissiveIntensity = obj.userData._hcSavedEmissiveIntensity || 1.0;
          } else {
            obj.material.emissive.setRGB(0, 0, 0);
            obj.material.emissiveIntensity = 1.0;
          }
        }
        obj.material.needsUpdate = true;
      }
    });
  }
}

// ── Screen reader announcer ───────────────────────────────────────────────────

/**
 * Announce a message to assistive technologies via the SR live region.
 * @param {string} msg - The message to read aloud.
 * @param {'polite'|'assertive'} [priority='polite'] - Interruption level.
 */
function announceToScreenReader(msg, priority) {
  const el = document.getElementById('sr-announcer');
  if (!el) return;
  // Swap politeness if needed
  const p = priority === 'assertive' ? 'assertive' : 'polite';
  el.setAttribute('aria-live', p);
  // Clear then set forces re-announcement even if text is the same
  el.textContent = '';
  requestAnimationFrame(function() { el.textContent = msg; });
}

// ── UI Font Size ──────────────────────────────────────────────────────────────

function _loadFontSize() {
  try {
    const raw = localStorage.getItem(FONT_SIZE_KEY);
    if (raw === 'small' || raw === 'medium' || raw === 'large') {
      applyFontSize(raw);
    }
  } catch (_) {}
}

/**
 * Apply a UI font size: adds a body class that zooms key overlay and HUD panels.
 * @param {'small'|'medium'|'large'} size
 */
function applyFontSize(size) {
  document.body.classList.remove('ui-font-sm', 'ui-font-lg');
  if (size === 'small')  document.body.classList.add('ui-font-sm');
  if (size === 'large')  document.body.classList.add('ui-font-lg');
  try { localStorage.setItem(FONT_SIZE_KEY, size); } catch (_) {}
  _syncFontSizeButtons(size);
}

function _syncFontSizeButtons(size) {
  if (!size) {
    try { size = localStorage.getItem(FONT_SIZE_KEY) || 'medium'; } catch (_) { size = 'medium'; }
  }
  ['small', 'medium', 'large'].forEach(function(s) {
    const btn = document.getElementById('font-size-btn-' + s);
    if (btn) btn.classList.toggle('font-size-btn-selected', s === size);
  });
}

// ── Colorblind mode ───────────────────────────────────────────────────────────

function _loadColorblindMode() {
  try {
    const raw = localStorage.getItem(COLORBLIND_KEY);
    if (raw === null) return;
    // Backward compat: old saves stored "true"/"false" booleans → treat "true" as deuteranopia.
    if (raw === 'true')  { colorblindPreset = 'deuteranopia'; colorblindMode = true; return; }
    if (raw === 'false') { colorblindPreset = 'off';          colorblindMode = false; return; }
    if (raw === 'deuteranopia' || raw === 'protanopia' || raw === 'tritanopia') {
      colorblindPreset = raw;
      colorblindMode = true;
    } else if (raw === 'off') {
      colorblindPreset = 'off';
      colorblindMode = false;
    }
  } catch (_) {}
}

function _saveColorblindMode() {
  try {
    localStorage.setItem(COLORBLIND_KEY, colorblindPreset);
  } catch (_) {}
}

/**
 * Apply colorblind mode globally: swap materials on all existing block meshes
 * and refresh the next-piece preview.
 * @param {string} preset - 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia'
 */
function applyColorblindMode(preset) {
  colorblindPreset = (preset === 'deuteranopia' || preset === 'protanopia' || preset === 'tritanopia')
    ? preset : 'off';
  colorblindMode = (colorblindPreset !== 'off');
  _saveColorblindMode();

  const enabled = colorblindMode;

  // Update all existing block meshes in the world and falling groups.
  [worldGroup, fallingPiecesGroup].forEach(function(group) {
    if (!group) return;
    group.traverse(function(obj) {
      if (!obj.userData || !obj.userData.isBlock) return;
      const canonHex = obj.userData.canonicalColor;
      if (canonHex === undefined) return;

      let newMat;
      if (enabled) {
        const cbIdx = COLOR_TO_INDEX[canonHex];
        const cbColor = getCBColors(cbIdx);
        if (cbIdx !== undefined && cbColor !== null && cbColor !== undefined) {
          newMat = createBlockMaterialColorblind(cbColor, getCBPatterns(cbIdx));
        } else {
          newMat = createBlockMaterial(canonHex);
        }
      } else {
        newMat = createBlockMaterial(canonHex);
        // Re-apply lava emissive for standard mode.
        const matName = COLOR_TO_MATERIAL[canonHex];
        if (matName && BLOCK_TYPES[matName] && BLOCK_TYPES[matName].effect === "lava_glow") {
          const lavaEmissive = new THREE.Color(0x220800);
          newMat.emissive = lavaEmissive;
          newMat.needsUpdate = true;
          obj.userData.defaultEmissive = lavaEmissive.clone();
        }
      }

      obj.material = newMat;
      // Update originalColor so mining damage tinting reflects the new display color.
      obj.userData.originalColor = newMat.color.clone();
    });
  });

  // Refresh next-pieces HUD colors.
  if (typeof updateNextPiecesHUD === 'function') updateNextPiecesHUD();

  // Sync select element visual state.
  const sel = document.getElementById("cb-mode-select");
  if (sel) sel.value = colorblindPreset;
}

// ── Theme system ───────────────────────────────────────────────────────────────

const _ALL_THEMES = ["classic", "nether", "ocean", "candy", "fossil", "storm", "void", "legendary", "ender", "diamond"];

// Score milestones for the five core themes (persist in localStorage once reached).
const THEME_SCORE_MILESTONES = {
  nether:  10000,
  ocean:   25000,
  ender:   50000,
  diamond: 100000,
};

/** Load the set of score-unlocked themes from localStorage. */
function loadScoreUnlockedThemes() {
  try {
    const raw = localStorage.getItem(THEME_SCORE_UNLOCKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

/** Persist a newly unlocked score-gated theme. */
function _saveScoreUnlockedTheme(themeKey) {
  try {
    const unlocked = loadScoreUnlockedThemes();
    if (!unlocked.includes(themeKey)) {
      unlocked.push(themeKey);
      localStorage.setItem(THEME_SCORE_UNLOCKS_KEY, JSON.stringify(unlocked));
    }
  } catch (_) {}
}

/**
 * Check current score against score milestones; unlock and notify for any newly reached.
 * Call this from addScore() every time the score changes.
 */
function checkScoreThemeUnlocks(currentScore) {
  const unlocked = loadScoreUnlockedThemes();
  let anyNew = false;
  for (const [themeKey, milestone] of Object.entries(THEME_SCORE_MILESTONES)) {
    if (!unlocked.includes(themeKey) && currentScore >= milestone) {
      _saveScoreUnlockedTheme(themeKey);
      anyNew = true;
      const label = themeKey.charAt(0).toUpperCase() + themeKey.slice(1);
      if (typeof announceToScreenReader === 'function') {
        announceToScreenReader(label + ' theme unlocked!');
      }
      if (typeof showCraftedBanner === 'function') {
        showCraftedBanner('\uD83C\uDF1F ' + label + ' theme unlocked!');
      }
    }
  }
  if (anyNew && typeof _syncThemeButtons === 'function') {
    _syncThemeButtons();
  }
}

function _loadTheme() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (_ALL_THEMES.includes(raw)) {
      activeTheme = raw;
    } else if (raw && /^custom_\d+$/.test(raw) && typeof getCustomTheme === 'function' && getCustomTheme(raw)) {
      activeTheme = raw;
    } else {
      activeTheme = "classic";
    }
  } catch (_) {}
}

function _saveTheme() {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
  } catch (_) {}
  if (typeof onAutoSync === 'function') onAutoSync();
}

/** Return true if the given theme key is currently unlocked. */
function isThemeUnlocked(themeKey) {
  if (themeKey === "classic") return true;
  // Score-gated core themes (nether, ocean, ender, diamond)
  if (THEME_SCORE_MILESTONES[themeKey] !== undefined) {
    const scoreUnlocked = loadScoreUnlockedThemes();
    if (scoreUnlocked.includes(themeKey)) return true;
    // Also check best lifetime score so returning players are not re-locked
    if (typeof loadLifetimeStats === 'function') {
      const stats = loadLifetimeStats();
      if (stats.bestScore >= THEME_SCORE_MILESTONES[themeKey]) return true;
    }
    return false;
  }
  // Level-gated skins (fossil, storm, void, legendary)
  if (typeof isLevelThemeUnlocked === 'function') {
    const levelThemes = ["fossil", "storm", "void", "legendary"];
    if (levelThemes.includes(themeKey)) return isLevelThemeUnlocked(themeKey);
  }
  try {
    const achs = loadAchievements ? loadAchievements() : {};
    if (themeKey === "candy") return !!achs["sprinter"];
  } catch (_) {}
  // Custom themes: require level 10 + the theme slot must exist
  if (themeKey.startsWith('custom_')) {
    if (typeof isThemeEditorUnlocked === 'function' && !isThemeEditorUnlocked()) return false;
    if (typeof getCustomTheme === 'function') return getCustomTheme(themeKey) !== null;
    return false;
  }
  return false;
}

/**
 * Apply a theme globally: swap materials on all existing block meshes,
 * refresh next-piece HUD, and update HUD accent CSS class on <body>.
 */
function applyTheme(themeKey) {
  if (!isThemeUnlocked(themeKey)) return;
  activeTheme = themeKey;
  _saveTheme();

  // Update HUD accent classes on body.
  document.body.classList.toggle("theme-nether",    themeKey === "nether");
  document.body.classList.toggle("theme-ocean",     themeKey === "ocean");
  document.body.classList.toggle("theme-candy",     themeKey === "candy");
  document.body.classList.toggle("theme-fossil",    themeKey === "fossil");
  document.body.classList.toggle("theme-storm",     themeKey === "storm");
  document.body.classList.toggle("theme-void",      themeKey === "void");
  document.body.classList.toggle("theme-legendary", themeKey === "legendary");
  document.body.classList.toggle("theme-ender",     themeKey === "ender");
  document.body.classList.toggle("theme-diamond",   themeKey === "diamond");

  // Resolve theme palette for material swapping.
  const THEME_PALETTE = {
    nether:         NETHER_COLORS,
    ocean:          OCEAN_COLORS,
    candy:          CANDY_COLORS,
    fossil:         FOSSIL_COLORS,
    storm:          STORM_COLORS,
    void:           VOID_COLORS,
    legendary:      LEGENDARY_COLORS,
    ender:          (typeof ENDER_COLORS   !== 'undefined' ? ENDER_COLORS   : null),
    diamond:        (typeof DIAMOND_COLORS !== 'undefined' ? DIAMOND_COLORS : null),
    diamond_season: (typeof DIAMOND_SEASON_COLORS !== 'undefined' ? DIAMOND_SEASON_COLORS : null),
    cosmetic_carved_stone_board:   (typeof COSMETIC_CARVED_STONE_COLORS   !== 'undefined' ? COSMETIC_CARVED_STONE_COLORS   : null),
    cosmetic_ore_vein_theme:       (typeof COSMETIC_ORE_VEIN_COLORS       !== 'undefined' ? COSMETIC_ORE_VEIN_COLORS       : null),
    cosmetic_mossy_overgrown_board:(typeof COSMETIC_MOSSY_OVERGROWN_COLORS !== 'undefined' ? COSMETIC_MOSSY_OVERGROWN_COLORS : null),
    cosmetic_leaf_block_theme:     (typeof COSMETIC_LEAF_BLOCK_COLORS     !== 'undefined' ? COSMETIC_LEAF_BLOCK_COLORS     : null),
    cosmetic_obsidian_forge_board: (typeof COSMETIC_OBSIDIAN_FORGE_COLORS !== 'undefined' ? COSMETIC_OBSIDIAN_FORGE_COLORS : null),
    cosmetic_magma_theme:          (typeof COSMETIC_MAGMA_COLORS          !== 'undefined' ? COSMETIC_MAGMA_COLORS          : null),
    cosmetic_frozen_tundra_board:  (typeof COSMETIC_FROZEN_TUNDRA_COLORS  !== 'undefined' ? COSMETIC_FROZEN_TUNDRA_COLORS  : null),
    cosmetic_crystal_theme:        (typeof COSMETIC_CRYSTAL_COLORS        !== 'undefined' ? COSMETIC_CRYSTAL_COLORS        : null),
  };
  let themePalette = THEME_PALETTE[themeKey] || null;
  // Custom theme: build palette from saved player data.
  if (!themePalette && themeKey.startsWith('custom_') && typeof getCustomThemePalette === 'function') {
    themePalette = getCustomThemePalette(themeKey);
  }

  // Apply custom theme background and grid overlay.
  if (themeKey.startsWith('custom_') && typeof getCustomTheme === 'function') {
    const customTheme = getCustomTheme(themeKey);
    if (customTheme) {
      _applyCustomThemeBg(customTheme.bgColor || null);
      _applyCustomThemeGrid(customTheme.gridEnabled, customTheme.gridColor, customTheme.gridOpacity);
    }
  } else {
    _applyCustomThemeBg(null);
    _applyCustomThemeGrid(false, null, null);
  }

  // Swap materials on all existing block meshes (unless colorblind mode or block skin overrides).
  // When a block skin is active, the skin owns all material colors — skip theme swaps.
  const _anySkinActive = (activeBlockSkin && typeof BLOCK_SKIN_PALETTES !== 'undefined' && BLOCK_SKIN_PALETTES[activeBlockSkin]) ||
    (typeof activePerPieceTypeSkins !== 'undefined' && activePerPieceTypeSkins && Object.keys(activePerPieceTypeSkins).length > 0);
  if (!colorblindMode && !_anySkinActive) {
    [worldGroup, fallingPiecesGroup].forEach(function(group) {
      if (!group) return;
      group.traverse(function(obj) {
        if (!obj.userData || !obj.userData.isBlock) return;
        const canonHex = obj.userData.canonicalColor;
        if (canonHex === undefined) return;

        let newMat;
        if (themePalette) {
          const idx = COLOR_TO_INDEX[canonHex];
          if (idx !== undefined && themePalette[idx] !== null) {
            newMat = createBlockMaterial(themePalette[idx]);
          } else {
            newMat = createBlockMaterial(canonHex);
          }
        } else {
          // Classic — restore canonical color material.
          newMat = createBlockMaterial(canonHex);
          // Re-apply lava emissive for classic mode.
          const matName = COLOR_TO_MATERIAL[canonHex];
          if (matName && BLOCK_TYPES[matName] && BLOCK_TYPES[matName].effect === "lava_glow") {
            const lavaEmissive = new THREE.Color(0x220800);
            newMat.emissive = lavaEmissive;
            newMat.needsUpdate = true;
            obj.userData.defaultEmissive = lavaEmissive.clone();
          }
        }

        obj.material = newMat;
        obj.userData.originalColor = newMat.color.clone();
      });
    });
  }

  // Refresh next-pieces HUD colors.
  if (typeof updateNextPiecesHUD === 'function') updateNextPiecesHUD();

  // Sync theme button visual state.
  _syncThemeButtons();
}

/** Sync theme selector button states (locked/selected). */
function _syncThemeButtons() {
  const themes = [
    { key: "classic",   btnId: "theme-btn-classic"   },
    { key: "nether",    btnId: "theme-btn-nether"    },
    { key: "ocean",     btnId: "theme-btn-ocean"     },
    { key: "candy",     btnId: "theme-btn-candy"     },
    { key: "fossil",    btnId: "theme-btn-fossil"    },
    { key: "storm",     btnId: "theme-btn-storm"     },
    { key: "void",      btnId: "theme-btn-void"      },
    { key: "legendary", btnId: "theme-btn-legendary" },
    { key: "ender",     btnId: "theme-btn-ender"     },
    { key: "diamond",   btnId: "theme-btn-diamond"   },
  ];
  themes.forEach(function(t) {
    const btn = document.getElementById(t.btnId);
    if (!btn) return;
    const unlocked = isThemeUnlocked(t.key);
    btn.classList.toggle("theme-btn-selected", activeTheme === t.key);
    btn.classList.toggle("theme-btn-locked", !unlocked);
    btn.disabled = !unlocked;
  });
  // Also refresh custom theme list.
  if (typeof _syncCustomThemeButtons === 'function') _syncCustomThemeButtons();
}

// ── Controls / keybindings tab ────────────────────────────────────────────────

/** Converts a KeyboardEvent.code to a short display label. */
function _kbDisplayCode(code) {
  const MAP = {
    KeyA:"A", KeyB:"B", KeyC:"C", KeyD:"D", KeyE:"E", KeyF:"F", KeyG:"G",
    KeyH:"H", KeyI:"I", KeyJ:"J", KeyK:"K", KeyL:"L", KeyM:"M", KeyN:"N",
    KeyO:"O", KeyP:"P", KeyQ:"Q", KeyR:"R", KeyS:"S", KeyT:"T", KeyU:"U",
    KeyV:"V", KeyW:"W", KeyX:"X", KeyY:"Y", KeyZ:"Z",
    Space:"Space", Enter:"Enter", Backspace:"Bksp", Tab:"Tab", Escape:"Esc",
    ArrowUp:"\u2191", ArrowDown:"\u2193", ArrowLeft:"\u2190", ArrowRight:"\u2192",
    ShiftLeft:"L.Shift", ShiftRight:"R.Shift",
    ControlLeft:"L.Ctrl", ControlRight:"R.Ctrl",
    AltLeft:"L.Alt", AltRight:"R.Alt",
    Numpad0:"Num0", Numpad1:"Num1", Numpad2:"Num2", Numpad3:"Num3",
    Numpad4:"Num4", Numpad5:"Num5", Numpad6:"Num6", Numpad7:"Num7",
    Numpad8:"Num8", Numpad9:"Num9", NumpadEnter:"Num\u23CE",
    Digit0:"0", Digit1:"1", Digit2:"2", Digit3:"3", Digit4:"4",
    Digit5:"5", Digit6:"6", Digit7:"7", Digit8:"8", Digit9:"9",
  };
  return MAP[code] || code;
}

// Keys that should never be accepted as bindings (reserved / system).
const _KB_FORBIDDEN = new Set([
  "Escape", "F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12",
  "PrintScreen", "ScrollLock", "Pause", "NumLock", "CapsLock",
]);

let _kbListeningAction = null; // action currently awaiting a key press
let _kbListeningBtn   = null; // the button element being overridden

/** Build / rebuild the keybind table rows. */
function _buildKeybindTable() {
  const table = document.getElementById("keybind-table");
  if (!table) return;
  table.innerHTML = "";
  const bindings = getAllBindings();
  for (const action of Object.keys(KB_ACTION_LABELS)) {
    const label = KB_ACTION_LABELS[action];
    const code  = bindings[action] || KB_DEFAULTS[action];

    const row = document.createElement("div");
    row.className = "keybind-row";
    row.dataset.action = action;

    const lbl = document.createElement("span");
    lbl.className = "keybind-action-label";
    lbl.textContent = label;

    const btn = document.createElement("button");
    btn.className = "keybind-key-badge keybind-key-btn";
    btn.textContent = _kbDisplayCode(code);
    btn.dataset.action = action;
    btn.addEventListener("click", _onKeybindBtnClick);

    row.appendChild(lbl);
    row.appendChild(btn);
    table.appendChild(row);
  }
}

/** Sync all badge labels to current bindings without rebuilding the DOM. */
function _syncKeybindTable() {
  const bindings = getAllBindings();
  const table = document.getElementById("keybind-table");
  if (!table) return;
  for (const btn of table.querySelectorAll(".keybind-key-btn")) {
    const action = btn.dataset.action;
    if (action) btn.textContent = _kbDisplayCode(bindings[action] || KB_DEFAULTS[action]);
  }
}

function _onKeybindBtnClick(e) {
  const btn    = e.currentTarget;
  const action = btn.dataset.action;
  if (_kbListeningAction) {
    // Cancel previous listening state.
    if (_kbListeningBtn) {
      _kbListeningBtn.textContent = _kbDisplayCode(getKeyBinding(_kbListeningBtn.dataset.action));
      _kbListeningBtn.classList.remove("keybind-key-btn-listening");
    }
  }
  _kbListeningAction = action;
  _kbListeningBtn    = btn;
  btn.textContent = "Press key\u2026";
  btn.classList.add("keybind-key-btn-listening");
  document.getElementById("keybind-conflict-msg").textContent = "";
}

function _onKeybindCapture(e) {
  if (!_kbListeningAction) return;
  e.preventDefault();
  e.stopPropagation();
  const code = e.code;
  if (_KB_FORBIDDEN.has(code)) {
    // Reject forbidden keys.
    const msg = document.getElementById("keybind-conflict-msg");
    if (msg) { msg.textContent = "\u26A0 That key is reserved."; msg.style.color = "#f55"; }
    _kbListeningBtn.textContent = _kbDisplayCode(getKeyBinding(_kbListeningAction));
    _kbListeningBtn.classList.remove("keybind-key-btn-listening");
    _kbListeningAction = null;
    _kbListeningBtn    = null;
    return;
  }
  const displaced = setKeyBinding(_kbListeningAction, code);
  const msg = document.getElementById("keybind-conflict-msg");
  if (msg) {
    if (displaced) {
      msg.style.color = "#ff0";
      msg.textContent = "\u21C4 Swapped with \u201C" + KB_ACTION_LABELS[displaced] + "\u201D";
    } else {
      msg.textContent = "";
    }
  }
  _kbListeningBtn.classList.remove("keybind-key-btn-listening");
  _kbListeningAction = null;
  _kbListeningBtn    = null;
  _syncKeybindTable();
}

// ── DAS / ARR settings UI ──────────────────────────────────────────────────────

function _initDasSettingsUI() {
  const container = document.getElementById('das-settings-container');
  if (!container) return;
  const settings = typeof getInputDasSettings === 'function' ? getInputDasSettings() : { dasMs: 170, arrMs: 50, softDropMs: 50 };

  function _wireSlider(id, valId, settingKey, min, max, current) {
    const slider = document.getElementById(id);
    const label  = document.getElementById(valId);
    if (!slider || !label) return;
    slider.min   = min;
    slider.max   = max;
    slider.value = current;
    label.textContent = (settingKey === 'arrMs' && current === 0) ? '0 (instant)' : current + 'ms';
    slider.addEventListener('input', function () {
      const v = parseInt(this.value, 10);
      if (typeof setInputDasSetting === 'function') setInputDasSetting(settingKey, v);
      label.textContent = (settingKey === 'arrMs' && v === 0) ? '0 (instant)' : v + 'ms';
    });
  }

  _wireSlider('das-slider',          'das-slider-val',          'dasMs',      50,  300, settings.dasMs);
  _wireSlider('arr-slider',          'arr-slider-val',          'arrMs',      0,   100, settings.arrMs);
  _wireSlider('soft-drop-slider',    'soft-drop-slider-val',    'softDropMs', 10,  100, settings.softDropMs);
}

function _initControlsTab() {
  // Initialise gamepad support (safe no-op if API absent).
  if (typeof initGamepad === 'function') initGamepad();

  // Tab switching.
  const tabGeneral  = document.getElementById("settings-tab-general");
  const tabControls = document.getElementById("settings-tab-controls");
  const paneGeneral  = document.getElementById("settings-pane-general");
  const paneControls = document.getElementById("settings-pane-controls");

  function _showTab(tab) {
    const isControls = (tab === "controls");
    if (tabGeneral)  tabGeneral.classList.toggle("settings-tab-active",  !isControls);
    if (tabControls) tabControls.classList.toggle("settings-tab-active", isControls);
    if (tabGeneral)  tabGeneral.setAttribute("aria-selected",  String(!isControls));
    if (tabControls) tabControls.setAttribute("aria-selected", String(isControls));
    if (paneGeneral)  paneGeneral.style.display  = isControls ? "none" : "";
    if (paneControls) paneControls.style.display = isControls ? ""     : "none";
    // Refresh gamepad status whenever the Controls tab is shown.
    if (isControls && typeof _gpUpdateStatusUI === 'function') _gpUpdateStatusUI();
  }

  if (tabGeneral)  tabGeneral.addEventListener("click",  function() { _showTab("general"); });
  if (tabControls) tabControls.addEventListener("click", function() { _showTab("controls"); });

  // Build table once.
  _buildKeybindTable();

  // Preset buttons.
  const presets = [
    { id: "kb-preset-default",    name: "default"     },
    { id: "kb-preset-arrows",     name: "arrows"      },
    { id: "kb-preset-lefthanded", name: "leftHanded"  },
  ];
  for (const p of presets) {
    const btn = document.getElementById(p.id);
    if (btn) btn.addEventListener("click", function() {
      applyKeyPreset(p.name);
      _syncKeybindTable();
      const msg = document.getElementById("keybind-conflict-msg");
      if (msg) msg.textContent = "";
    });
  }

  // Reset button.
  const resetBtn = document.getElementById("keybind-reset-btn");
  if (resetBtn) resetBtn.addEventListener("click", function() {
    resetKeyBindings();
    _syncKeybindTable();
    const msg = document.getElementById("keybind-conflict-msg");
    if (msg) msg.textContent = "";
  });

  // Global key capture listener (only active when listening for a rebind).
  document.addEventListener("keydown", _onKeybindCapture, true);

  // Initialise DAS/ARR sliders in the controls pane.
  _initDasSettingsUI();
}

// ── Mobile difficulty ──────────────────────────────────────────────────────────

function _loadMobileDifficulty() {
  try {
    const raw = localStorage.getItem(MOBILE_DIFFICULTY_KEY);
    if (raw !== null) {
      mobileDifficultyEnabled = (raw === 'true');
    } else {
      // Default ON for touch devices, OFF for desktop.
      mobileDifficultyEnabled = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }
  } catch (_) {}
}

function _saveMobileDifficulty() {
  try { localStorage.setItem(MOBILE_DIFFICULTY_KEY, String(mobileDifficultyEnabled)); } catch (_) {}
}

function isMobileDifficultyEnabled() {
  return mobileDifficultyEnabled;
}

function setMobileDifficultyEnabled(val) {
  mobileDifficultyEnabled = !!val;
  _saveMobileDifficulty();
}

// ── Transfer Progress (export / import) ───────────────────────────────────────

/** Collect all mineCtris_* localStorage keys into a plain object. */
function _collectProgressData() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("mineCtris_")) {
        data[key] = localStorage.getItem(key);
      }
    }
  } catch (_) {}
  return data;
}

/** Build preview summary string from raw progress data object. */
function _buildProgressPreview(data) {
  let level = 1;
  let achCount = 0;
  let cosmeticCount = 0;
  try {
    const stats = data["mineCtris_stats"] ? JSON.parse(data["mineCtris_stats"]) : null;
    if (stats && typeof getLevelFromXP === "function") {
      level = getLevelFromXP(stats.playerXP || 0);
    } else if (stats && stats.playerXP) {
      level = Math.max(1, Math.floor(Math.sqrt(stats.playerXP / 50)));
    }
  } catch (_) {}
  try {
    const achs = data["mineCtris_achievements"] ? JSON.parse(data["mineCtris_achievements"]) : null;
    if (achs && typeof achs === "object") {
      achCount = Object.keys(achs).filter(function(k) { return achs[k]; }).length;
    }
  } catch (_) {}
  try {
    const rewards = data["mineCtris_seasonRewards"] ? JSON.parse(data["mineCtris_seasonRewards"]) : null;
    if (rewards && typeof rewards === "object") {
      cosmeticCount = Object.keys(rewards).length;
    }
  } catch (_) {}
  return "Level " + level + ", " + achCount + " achievement" + (achCount !== 1 ? "s" : "") +
    (cosmeticCount > 0 ? ", " + cosmeticCount + " cosmetic" + (cosmeticCount !== 1 ? "s" : "") : "");
}

/** Build the full export payload: metadata + all progress keys, base64-encoded. */
function _buildExportPayload() {
  const data = _collectProgressData();
  const stats = data["mineCtris_stats"] ? (function() { try { return JSON.parse(data["mineCtris_stats"]); } catch(_) { return {}; } })() : {};
  const meta = {
    version: GAME_VERSION,
    exportedAt: new Date().toISOString(),
    playerLevel: (typeof getLevelFromXP === "function") ? getLevelFromXP(stats.playerXP || 0) : 1,
    gamesPlayed: stats.gamesPlayed || 0,
  };
  data["_meta"] = meta;
  return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}

/** Trigger a .minectris file download. */
function exportProgress() {
  try {
    const encoded = _buildExportPayload();
    const blob = new Blob([encoded], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "minectris_save_" + new Date().toISOString().slice(0, 10) + ".minectris";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    _recordExportTime();
    _showTransferFeedback("Exported!", "#0f0");
  } catch (e) {
    _showTransferFeedback("Export failed.", "#f55");
  }
}

/** Copy encoded save to clipboard. */
function copyProgressToClipboard() {
  try {
    const encoded = _buildExportPayload();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(encoded).then(function() {
        _recordExportTime();
        _showTransferFeedback("Copied to clipboard!", "#0f0");
      }, function() {
        _showTransferFeedback("Copy failed — try Export File.", "#f55");
      });
    } else {
      // Fallback for older browsers.
      const ta = document.createElement("textarea");
      ta.value = encoded;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      _recordExportTime();
      _showTransferFeedback("Copied to clipboard!", "#0f0");
    }
  } catch (_) {
    _showTransferFeedback("Copy failed — try Export File.", "#f55");
  }
}

function _recordExportTime() {
  try {
    const ts = new Date().toISOString();
    localStorage.setItem(TRANSFER_LAST_EXPORT_KEY, ts);
    _syncLastExportLabel();
  } catch (_) {}
}

function _syncLastExportLabel() {
  const el = document.getElementById("transfer-last-export");
  if (!el) return;
  try {
    const ts = localStorage.getItem(TRANSFER_LAST_EXPORT_KEY);
    if (ts) {
      const d = new Date(ts);
      el.textContent = "Last export: " + d.toLocaleDateString() + " " + d.toLocaleTimeString();
      el.style.display = "";
    } else {
      el.style.display = "none";
    }
  } catch (_) {
    el.style.display = "none";
  }
}

let _pendingImportData = null;

/** Parse and validate an import string (base64-encoded JSON). Returns data object or throws. */
function _parseImportString(str) {
  const json = decodeURIComponent(escape(atob(str.trim())));
  const data = JSON.parse(json);
  if (!data || typeof data !== "object") throw new Error("Invalid format");
  // _meta is optional but keys must include at least one mineCtris_ key.
  const hasKeys = Object.keys(data).some(function(k) { return k.startsWith("mineCtris_"); });
  if (!hasKeys) throw new Error("No progress data found");
  return data;
}

/** Show the import preview area with parsed data. */
function _showImportPreview(data) {
  _pendingImportData = data;
  const previewText = document.getElementById("transfer-import-preview-text");
  if (previewText) previewText.textContent = _buildProgressPreview(data);
  const previewArea = document.getElementById("transfer-import-preview");
  if (previewArea) previewArea.style.display = "";
}

function _hideImportPreview() {
  _pendingImportData = null;
  const previewArea = document.getElementById("transfer-import-preview");
  if (previewArea) previewArea.style.display = "none";
}

/** Apply the pending import: write all mineCtris_* keys to localStorage, then reload. */
function _applyImport() {
  if (!_pendingImportData) return;
  try {
    const data = _pendingImportData;
    Object.keys(data).forEach(function(key) {
      if (key.startsWith("mineCtris_")) {
        try { localStorage.setItem(key, data[key]); } catch (_) {}
      }
    });
    window.location.reload();
  } catch (e) {
    _hideImportPreview();
    _showTransferFeedback("Import failed: " + e.message, "#f55");
  }
}

/** Show a brief feedback message below the transfer section. */
function _showTransferFeedback(msg, color) {
  const el = document.getElementById("transfer-feedback");
  if (!el) return;
  el.textContent = msg;
  el.style.color = color || "#0f0";
  el.style.display = "";
  clearTimeout(el._fbTimer);
  el._fbTimer = setTimeout(function() { el.style.display = "none"; }, 3000);
}

function _initTransferProgressSection() {
  _syncLastExportLabel();

  const exportBtn = document.getElementById("settings-export-btn");
  if (exportBtn) exportBtn.addEventListener("click", exportProgress);

  const clipboardBtn = document.getElementById("settings-clipboard-btn");
  if (clipboardBtn) clipboardBtn.addEventListener("click", copyProgressToClipboard);

  const importBtn = document.getElementById("settings-import-btn");
  const fileInput = document.getElementById("settings-import-file");

  if (importBtn && fileInput) {
    importBtn.addEventListener("click", function() {
      _hideImportPreview();
      fileInput.value = "";
      fileInput.click();
    });
    fileInput.addEventListener("change", function() {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const data = _parseImportString(e.target.result);
          _showImportPreview(data);
        } catch (_) {
          _showTransferFeedback("Invalid save file.", "#f55");
        }
      };
      reader.readAsText(file);
    });
  }

  const confirmBtn = document.getElementById("transfer-import-confirm-btn");
  if (confirmBtn) confirmBtn.addEventListener("click", _applyImport);

  const cancelBtn = document.getElementById("transfer-import-cancel-btn");
  if (cancelBtn) cancelBtn.addEventListener("click", function() {
    _hideImportPreview();
    _showTransferFeedback("Import cancelled.", "#aaa");
  });
}

// ── Cloud Sync UI ─────────────────────────────────────────────────────────────

function _updateLastSyncDisplay() {
  const el = document.getElementById('cloud-sync-last-sync');
  if (!el) return;
  try {
    const ts = localStorage.getItem('mineCtris_lastCloudSync');
    if (ts) {
      el.textContent = 'Last synced: ' + new Date(ts).toLocaleString();
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  } catch (_) { el.style.display = 'none'; }
}

function _showCloudFeedback(msg, color) {
  const el = document.getElementById("cloud-sync-status");
  if (!el) return;
  el.textContent = msg;
  el.style.color  = color || "#7f7";
  clearTimeout(el._fbTimer);
  el._fbTimer = setTimeout(function() { el.textContent = ""; }, 4000);
}

function _hideCloudPreview() {
  const el = document.getElementById("cloud-sync-preview");
  if (el) el.style.display = "none";
  if (typeof cancelCloudImport === "function") cancelCloudImport();
}

function _showCloudPreview(preview, savedAt, hasConflict) {
  const previewArea = document.getElementById("cloud-sync-preview");
  if (!previewArea) return;
  const previewText = document.getElementById("cloud-sync-preview-text");
  if (previewText) {
    const dateStr = savedAt ? " (saved " + new Date(savedAt).toLocaleString() + ")" : "";
    previewText.textContent = preview + dateStr;
  }
  const conflictWarn = document.getElementById("cloud-sync-conflict-warn");
  if (conflictWarn) conflictWarn.style.display = hasConflict ? "" : "none";
  previewArea.style.display = "";
}

async function _showSyncCode() {
  const row = document.getElementById("cloud-sync-code-row");
  if (!row) return;
  let code = typeof _getCachedSyncCode === "function" ? _getCachedSyncCode() : null;
  if (!code && typeof getCloudSyncCode === "function") {
    code = await getCloudSyncCode();
  }
  if (code) {
    const display = document.getElementById("cloud-sync-code-display");
    if (display) display.textContent = code;
    row.style.display = "";
    // Show delete row too once we have a cloud presence.
    const delRow = document.getElementById("cloud-sync-delete-row");
    if (delRow) delRow.style.display = "";
  }
}

function _initCloudSyncSection() {
  _hideCloudPreview();
  _updateLastSyncDisplay();

  // Auto-sync toggle
  const autoToggle = document.getElementById('cloud-sync-auto-toggle');
  if (autoToggle) {
    autoToggle.checked = typeof isAutoSyncEnabled === 'function' && isAutoSyncEnabled();
    autoToggle.addEventListener('change', function() {
      if (typeof setAutoSyncEnabled === 'function') setAutoSyncEnabled(autoToggle.checked);
    });
  }

  const saveBtn = document.getElementById("cloud-sync-save-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async function() {
      saveBtn.disabled = true;
      _showCloudFeedback("Saving to cloud…", "#aaa");
      const result = await cloudSave();
      saveBtn.disabled = false;
      if (result.ok) {
        _showCloudFeedback("Saved to cloud!", "#7f7");
        _showSyncCode();
        _updateLastSyncDisplay();
      } else {
        _showCloudFeedback("Save failed: " + result.error, "#f77");
      }
    });
  }

  const loadBtn = document.getElementById("cloud-sync-load-btn");
  if (loadBtn) {
    loadBtn.addEventListener("click", async function() {
      loadBtn.disabled = true;
      _hideCloudPreview();
      _showCloudFeedback("Loading from cloud…", "#aaa");
      const result = await cloudLoad();
      loadBtn.disabled = false;
      if (result.ok) {
        _showCloudFeedback("", "");
        _showCloudPreview(result.preview, result.savedAt, false);
      } else if (result.error === "conflict") {
        _showCloudFeedback("", "");
        _showCloudPreview(
          "Cloud save from " + new Date(result.cloudSavedAt).toLocaleString(),
          result.cloudSavedAt,
          true
        );
      } else {
        _showCloudFeedback("Load failed: " + result.error, "#f77");
      }
    });
  }

  const confirmBtn = document.getElementById("cloud-sync-confirm-btn");
  if (confirmBtn) confirmBtn.addEventListener("click", function() {
    _hideCloudPreview();
    if (typeof applyCloudImport === "function") applyCloudImport();
  });

  const cancelBtn = document.getElementById("cloud-sync-cancel-btn");
  if (cancelBtn) cancelBtn.addEventListener("click", function() {
    _hideCloudPreview();
    _showCloudFeedback("Cancelled.", "#aaa");
  });

  const copyCodeBtn = document.getElementById("cloud-sync-copy-code-btn");
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener("click", function() {
      const display = document.getElementById("cloud-sync-code-display");
      const code = display ? display.textContent : "";
      if (!code) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function() {
          _showCloudFeedback("Sync code copied!", "#7f7");
        });
      } else {
        _showCloudFeedback("Code: " + code, "#7f7");
      }
    });
  }

  const linkBtn = document.getElementById("cloud-sync-link-btn");
  if (linkBtn) {
    linkBtn.addEventListener("click", async function() {
      const input = document.getElementById("cloud-sync-code-input");
      const code = input ? input.value.trim().toUpperCase() : "";
      if (!code) { _showCloudFeedback("Enter a sync code first.", "#f77"); return; }
      linkBtn.disabled = true;
      _hideCloudPreview();
      _showCloudFeedback("Looking up sync code…", "#aaa");
      const result = await cloudLoadFromCode(code);
      linkBtn.disabled = false;
      if (result.ok) {
        _showCloudFeedback("", "");
        _showCloudPreview(result.preview, result.savedAt, false);
      } else if (result.error === "conflict") {
        _showCloudFeedback("", "");
        _showCloudPreview(
          "Cloud save from " + new Date(result.cloudSavedAt).toLocaleString(),
          result.cloudSavedAt,
          true
        );
      } else {
        _showCloudFeedback("Link failed: " + result.error, "#f77");
      }
    });
  }

  const deleteBtn = document.getElementById("cloud-sync-delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async function() {
      if (!confirm("Delete your cloud save? This cannot be undone.")) return;
      deleteBtn.disabled = true;
      const result = await cloudDeleteData();
      deleteBtn.disabled = false;
      if (result.ok) {
        _showCloudFeedback("Cloud data deleted.", "#aaa");
        const delRow = document.getElementById("cloud-sync-delete-row");
        if (delRow) delRow.style.display = "none";
        const codeRow = document.getElementById("cloud-sync-code-row");
        if (codeRow) codeRow.style.display = "none";
      } else {
        _showCloudFeedback("Delete failed: " + result.error, "#f77");
      }
    });
  }

  // Show sync code if already have one.
  const existingCode = typeof _getCachedSyncCode === "function" ? _getCachedSyncCode() : null;
  if (existingCode) {
    const display = document.getElementById("cloud-sync-code-display");
    if (display) display.textContent = existingCode;
    const codeRow = document.getElementById("cloud-sync-code-row");
    if (codeRow) codeRow.style.display = "";
    const delRow = document.getElementById("cloud-sync-delete-row");
    if (delRow) delRow.style.display = "";
  }
}

/** Update the per-device analytics stats hint shown in settings. */
function _settingsUpdateAnalyticsStats() {
  var el = document.getElementById("analytics-device-stats");
  if (!el) return;
  if (typeof analyticsIsOptedOut === 'function' && analyticsIsOptedOut()) {
    el.textContent = '';
    return;
  }
  if (typeof analyticsGetDeviceStats !== 'function') return;
  var s = analyticsGetDeviceStats();
  var fmt = typeof _analyticsFmtMs === 'function' ? _analyticsFmtMs : function(ms) {
    if (!ms) return '0s';
    var m = Math.floor(ms / 60000);
    if (m < 60) return m + 'm';
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  };
  el.textContent = 'This device: ' + s.sessionCount + ' sessions \u00B7 ' +
    fmt(s.totalPlayTimeMs) + ' played \u00B7 fav: ' + s.favoriteMode;
}

/** Called once during init() — loads persisted settings and wires sliders. */
function initSettings() {
  _loadAudioSettings();
  applyAudioSettings(_audioSettings.master, _audioSettings.sfx, _audioSettings.music);
  _loadSfxMute();
  _loadMusicMute();
  _loadDynamicMusic();
  _loadReducedMotion();
  _loadGlowIntensity();
  _loadParticleIntensity();
  // Auto-enable reduced motion if the OS requests it (only when user has no saved pref)
  if (!localStorage.getItem(REDUCED_MOTION_KEY)) {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        reducedMotionEnabled = true;
      }
    } catch (_) {}
  }
  _loadColorblindMode();
  _loadHighContrast();
  _loadLockDelay();
  _loadBoardSize();
  _loadNextPieceCount();
  _loadGhostOpacity();
  _loadHoldVisible();
  _loadPreviewSide();
  applyPreviewSide(playerPreviewSide);
  _loadTheme();
  if (typeof ghostReplayLoadSetting === 'function') ghostReplayLoadSetting();
  if (typeof initGraphicsQuality === 'function') initGraphicsQuality();
  if (typeof initInputDisplay === 'function') initInputDisplay();
  // Apply persisted theme body class without triggering a material swap on init
  // (blocks don't exist yet — createBlockMesh will pick up activeTheme directly).
  document.body.classList.toggle("theme-nether",    activeTheme === "nether");
  document.body.classList.toggle("theme-ocean",     activeTheme === "ocean");
  document.body.classList.toggle("theme-candy",     activeTheme === "candy");
  document.body.classList.toggle("theme-fossil",    activeTheme === "fossil");
  document.body.classList.toggle("theme-storm",     activeTheme === "storm");
  document.body.classList.toggle("theme-void",      activeTheme === "void");
  document.body.classList.toggle("theme-legendary", activeTheme === "legendary");

  function makeHandler(key, valId) {
    return function () {
      const v = parseInt(this.value, 10);
      const label = document.getElementById(valId);
      if (label) label.textContent = v;
      _audioSettings[key] = v;
      _saveAudioSettings();
      applyAudioSettings(_audioSettings.master, _audioSettings.sfx, _audioSettings.music);
    };
  }

  const masterSlider = document.getElementById("vol-master");
  const sfxSlider    = document.getElementById("vol-sfx");
  const musicSlider  = document.getElementById("vol-music");
  if (masterSlider) masterSlider.addEventListener("input", makeHandler("master", "vol-master-val"));
  if (sfxSlider)    sfxSlider.addEventListener("input",    makeHandler("sfx",    "vol-sfx-val"));
  if (musicSlider)  musicSlider.addEventListener("input",  makeHandler("music",  "vol-music-val"));

  const sfxMuteToggle = document.getElementById("sfx-mute-toggle");
  if (sfxMuteToggle) {
    sfxMuteToggle.addEventListener("change", function () {
      const muted = this.checked;
      _saveSfxMute(muted);
      if (typeof setSfxMuted === 'function') setSfxMuted(muted);
    });
  }

  const musicMuteToggle = document.getElementById("music-mute-toggle");
  if (musicMuteToggle) {
    musicMuteToggle.addEventListener("change", function () {
      const muted = this.checked;
      _saveMusicMute(muted);
      if (typeof setMusicMuted === 'function') setMusicMuted(muted);
    });
  }

  const dynamicMusicToggle = document.getElementById("dynamic-music-toggle");
  if (dynamicMusicToggle) {
    dynamicMusicToggle.addEventListener("change", function () {
      const enabled = this.checked;
      _saveDynamicMusic(enabled);
      if (typeof setDynamicMusicEnabled === 'function') setDynamicMusicEnabled(enabled);
    });
  }

  // ── Jukebox controls ──────────────────────────────────────────────────────
  // Track buttons: Auto + tracks 0–4
  const _jbAutoBtn = document.getElementById('jukebox-track-btn-auto');
  if (_jbAutoBtn) {
    _jbAutoBtn.addEventListener('click', function() {
      if (typeof jukeboxSelectTrack === 'function') jukeboxSelectTrack(-1);
    });
  }
  for (let _jbI = 0; _jbI < 5; _jbI++) {
    (function(idx) {
      const _btn = document.getElementById('jukebox-track-btn-' + idx);
      if (_btn) {
        _btn.addEventListener('click', function() {
          if (typeof jukeboxSelectTrack === 'function') jukeboxSelectTrack(idx);
        });
      }
    })(_jbI);
  }

  const _jbPrevBtn = document.getElementById('jukebox-prev-btn');
  if (_jbPrevBtn) {
    _jbPrevBtn.addEventListener('click', function() {
      if (typeof jukeboxPrev === 'function') jukeboxPrev();
    });
  }

  const _jbNextBtn = document.getElementById('jukebox-next-btn');
  if (_jbNextBtn) {
    _jbNextBtn.addEventListener('click', function() {
      if (typeof jukeboxNext === 'function') jukeboxNext();
    });
  }

  const _jbShuffleBtn = document.getElementById('jukebox-shuffle-btn');
  if (_jbShuffleBtn) {
    _jbShuffleBtn.addEventListener('click', function() {
      if (typeof jukeboxToggleShuffle === 'function') {
        const on = jukeboxToggleShuffle();
        _jbShuffleBtn.setAttribute('aria-pressed', String(on));
      }
    });
  }

  const _jbVolSlider = document.getElementById('jukebox-vol-slider');
  if (_jbVolSlider) {
    _jbVolSlider.addEventListener('input', function() {
      const v = parseInt(this.value, 10);
      const lbl = document.getElementById('jukebox-vol-val');
      if (lbl) lbl.textContent = v;
      if (typeof jukeboxSetVolume === 'function') jukeboxSetVolume(v);
    });
  }

  const showOpponentEmotesToggle = document.getElementById("show-opponent-emotes-toggle");
  if (showOpponentEmotesToggle) {
    // Initialise from storage
    try {
      const raw = localStorage.getItem('mineCtris_showOpponentEmotes');
      if (raw !== null) showOpponentEmotesToggle.checked = raw === 'true';
    } catch (_) {}
    showOpponentEmotesToggle.addEventListener("change", function () {
      try { localStorage.setItem('mineCtris_showOpponentEmotes', String(this.checked)); } catch (_) {}
    });
  }

  const ghostReplayToggle = document.getElementById("ghost-replay-toggle");
  if (ghostReplayToggle) {
    // Sync checkbox to persisted setting
    if (typeof ghostReplayEnabled !== 'undefined') ghostReplayToggle.checked = ghostReplayEnabled;
    ghostReplayToggle.addEventListener("change", function () {
      if (typeof ghostReplayApplySetting === 'function') ghostReplayApplySetting(this.checked);
    });
  }

  const inputDisplayToggle = document.getElementById("input-display-toggle");
  if (inputDisplayToggle) {
    if (typeof inputDisplayEnabled !== 'undefined') inputDisplayToggle.checked = inputDisplayEnabled;
    inputDisplayToggle.addEventListener("change", function () {
      if (inputDisplayEnabled !== this.checked && typeof toggleInputDisplay === 'function') {
        toggleInputDisplay();
      }
    });
  }

  const closeBtn = document.getElementById("settings-close-btn");
  if (closeBtn) closeBtn.addEventListener("click", closeSettings);

  // Wire up metrics dashboard button
  const metricsBtn = document.getElementById("settings-metrics-btn");
  if (metricsBtn) {
    metricsBtn.addEventListener("click", function () {
      if (typeof openMetricsDashboard === 'function') openMetricsDashboard();
    });
  }

  // Wire up replay tutorial button
  const replayTutBtn = document.getElementById("settings-replay-tutorial-btn");
  if (replayTutBtn) {
    replayTutBtn.addEventListener("click", function () {
      try { localStorage.removeItem('mineCtris_tutorialDone'); } catch (_e) {}
      try { localStorage.removeItem('mineCtris_tutorialProgress'); } catch (_e) {}
      try { localStorage.removeItem('mineCtris_craftHintShown'); } catch (_e) {}
      // Show confirmation via event-end-toast (reusable toast element)
      var toast = document.getElementById("event-end-toast");
      if (toast) {
        toast.textContent = "\uD83C\uDF93 Tutorial will play on your next game.";
        toast.classList.remove("toast-visible");
        void toast.offsetWidth;
        toast.style.display = "block";
        toast.classList.add("toast-visible");
        clearTimeout(toast._tutReplayTimer);
        toast._tutReplayTimer = setTimeout(function () {
          toast.classList.remove("toast-visible");
          setTimeout(function () { toast.style.display = "none"; }, 400);
        }, 3100);
      }
      closeSettings();
    });
  }
  var metricsCloseBtn = document.getElementById("metrics-close-btn");
  if (metricsCloseBtn) {
    metricsCloseBtn.addEventListener("click", function () {
      if (typeof closeMetricsDashboard === 'function') closeMetricsDashboard();
    });
  }
  var metricsClearBtn = document.getElementById("metrics-clear-btn");
  if (metricsClearBtn) {
    metricsClearBtn.addEventListener("click", function () {
      if (typeof metricsClearAll === 'function') metricsClearAll();
      if (typeof openMetricsDashboard === 'function') openMetricsDashboard();
    });
  }

  // Analytics opt-out toggle
  var analyticsToggle = document.getElementById("analytics-opt-out-toggle");
  if (analyticsToggle) {
    // Reflect current opt-out state (checked = analytics ON)
    if (typeof analyticsIsOptedOut === 'function') {
      analyticsToggle.checked = !analyticsIsOptedOut();
    }
    analyticsToggle.addEventListener("change", function () {
      if (typeof analyticsSetOptOut === 'function') {
        analyticsSetOptOut(!this.checked);
      }
      _settingsUpdateAnalyticsStats();
    });
  }

  // Admin dashboard close button
  var analyticsAdminCloseBtn = document.getElementById("analytics-admin-close-btn");
  if (analyticsAdminCloseBtn) {
    analyticsAdminCloseBtn.addEventListener("click", function () {
      if (typeof analyticsCloseAdminDashboard === 'function') analyticsCloseAdminDashboard();
    });
  }

  _settingsUpdateAnalyticsStats();

  const cbModeSelect = document.getElementById("cb-mode-select");
  if (cbModeSelect) {
    cbModeSelect.value = colorblindPreset;
    cbModeSelect.addEventListener("change", function() {
      applyColorblindMode(this.value);
    });
  }

  const rmToggle = document.getElementById("reduced-motion-toggle");
  if (rmToggle) {
    rmToggle.checked = reducedMotionEnabled;
    rmToggle.addEventListener("change", function() {
      applyReducedMotion(this.checked);
    });
  }

  // Wire glow intensity select
  const glowSelect = document.getElementById("glow-intensity-select");
  if (glowSelect) {
    try {
      const saved = localStorage.getItem(GLOW_INTENSITY_KEY);
      if (saved === 'off' || saved === 'low' || saved === 'medium' || saved === 'high') {
        glowSelect.value = saved;
      }
    } catch (_) {}
    glowSelect.addEventListener("change", function () {
      applyGlowIntensity(this.value);
    });
  }

  // Wire particle intensity select
  const particleSelect = document.getElementById("particle-intensity-select");
  if (particleSelect) {
    try {
      const saved = localStorage.getItem(PARTICLE_INTENSITY_KEY);
      if (saved === 'off' || saved === 'low' || saved === 'medium' || saved === 'high') {
        particleSelect.value = saved;
      }
    } catch (_) {}
    particleSelect.addEventListener("change", function () {
      applyParticleIntensity(this.value);
    });
  }

  // Wire finesse HUD metric toggles
  if (typeof finesseInitMetricToggles === 'function') finesseInitMetricToggles();

  const lockDelaySelect = document.getElementById("lock-delay-select");
  if (lockDelaySelect) {
    lockDelaySelect.value = String(playerLockDelayMs);
    lockDelaySelect.addEventListener("change", function () {
      _saveLockDelay(parseInt(this.value, 10));
    });
  }

  const boardSizeSelect = document.getElementById("board-size-select");
  if (boardSizeSelect) {
    boardSizeSelect.value = playerBoardSize;
    boardSizeSelect.addEventListener("change", function () {
      _saveBoardSize(this.value);
    });
  }

  // Wire up next piece count selector.
  const nextPieceCountSelect = document.getElementById("next-piece-count-select");
  if (nextPieceCountSelect) {
    nextPieceCountSelect.value = String(playerNextPieceCount);
    nextPieceCountSelect.addEventListener("change", function () {
      _saveNextPieceCount(parseInt(this.value, 10));
    });
  }

  // Wire up ghost opacity slider.
  const ghostOpacitySlider = document.getElementById("ghost-opacity-slider");
  const ghostOpacityVal    = document.getElementById("ghost-opacity-val");
  if (ghostOpacitySlider) {
    ghostOpacitySlider.value = String(playerGhostOpacity);
    if (ghostOpacityVal) ghostOpacityVal.textContent = playerGhostOpacity;
    ghostOpacitySlider.addEventListener("input", function () {
      const v = parseInt(this.value, 10);
      if (ghostOpacityVal) ghostOpacityVal.textContent = v;
      _saveGhostOpacity(v);
    });
  }

  // Wire up hold piece visibility toggle.
  const holdVisibleToggle = document.getElementById("hold-piece-visible-toggle");
  if (holdVisibleToggle) {
    holdVisibleToggle.checked = playerHoldVisible;
    holdVisibleToggle.addEventListener("change", function () {
      applyHoldVisible(this.checked);
    });
  }

  // Wire up preview panel side selector.
  const previewSideSelect = document.getElementById("preview-side-select");
  if (previewSideSelect) {
    previewSideSelect.value = playerPreviewSide;
    previewSideSelect.addEventListener("change", function () {
      applyPreviewSide(this.value);
    });
  }

  const hcToggle = document.getElementById("high-contrast-toggle");
  if (hcToggle) {
    hcToggle.checked = highContrastEnabled;
    hcToggle.addEventListener("change", function() {
      applyHighContrast(this.checked);
    });
  }

  const weatherToggle = document.getElementById("weather-effects-toggle");
  if (weatherToggle) {
    weatherToggle.checked = (typeof isWeatherEnabled === 'function') ? isWeatherEnabled() : true;
    weatherToggle.addEventListener("change", function() {
      if (typeof setWeatherEnabled === 'function') setWeatherEnabled(this.checked);
    });
  }

  // Wire up "Show all modes" toggle.
  const samToggle = document.getElementById("show-all-modes-toggle");
  if (samToggle) {
    samToggle.checked = (typeof isShowAllModesEnabled === "function") && isShowAllModesEnabled();
    samToggle.addEventListener("change", function() {
      if (typeof setShowAllModes === "function") setShowAllModes(this.checked);
    });
  }

  // Wire up touch controls toggle.
  const tcToggle = document.getElementById("touch-controls-toggle");
  if (tcToggle) {
    tcToggle.checked = (typeof isTouchControlsEnabled === "function") && isTouchControlsEnabled();
    tcToggle.addEventListener("change", function() {
      if (typeof setTouchControlsEnabled === "function") setTouchControlsEnabled(this.checked);
    });
  }

  // Wire up gesture sensitivity selector.
  const sensSel = document.getElementById("gesture-sensitivity-select");
  if (sensSel) {
    sensSel.value = (typeof getTouchSensitivity === "function") ? getTouchSensitivity() : "medium";
    sensSel.addEventListener("change", function() {
      if (typeof setTouchSensitivity === "function") setTouchSensitivity(this.value);
    });
  }

  // Wire up touch zones overlay toggle.
  const tzToggle = document.getElementById("touch-zones-toggle");
  if (tzToggle) {
    tzToggle.checked = (typeof isTouchZonesEnabled === "function") && isTouchZonesEnabled();
    tzToggle.addEventListener("change", function() {
      if (typeof setTouchZonesEnabled === "function") setTouchZonesEnabled(this.checked);
    });
  }

  // Wire up mobile difficulty toggle.
  _loadMobileDifficulty();
  const mdToggle = document.getElementById("mobile-difficulty-toggle");
  if (mdToggle) {
    mdToggle.checked = mobileDifficultyEnabled;
    mdToggle.addEventListener("change", function() {
      setMobileDifficultyEnabled(this.checked);
    });
  }

  // Wire up haptic feedback settings.
  const hapticsToggle = document.getElementById("haptics-enabled-toggle");
  if (hapticsToggle) {
    hapticsToggle.checked = (typeof isHapticsEnabled === "function") ? isHapticsEnabled() : true;
    hapticsToggle.addEventListener("change", function() {
      if (typeof setHapticsEnabled === "function") setHapticsEnabled(this.checked);
    });
  }
  const hapticsIntensitySel = document.getElementById("haptics-intensity-select");
  if (hapticsIntensitySel) {
    hapticsIntensitySel.value = (typeof getHapticsIntensity === "function") ? getHapticsIntensity() : "medium";
    hapticsIntensitySel.addEventListener("change", function() {
      if (typeof setHapticsIntensity === "function") setHapticsIntensity(this.value);
    });
  }

  // Wire up display name field.
  const dnInput    = document.getElementById("settings-displayname-input");
  const dnSaveBtn  = document.getElementById("settings-displayname-save-btn");
  const dnFeedback = document.getElementById("settings-displayname-feedback");
  if (dnSaveBtn && dnInput) {
    dnSaveBtn.addEventListener("click", function() {
      const val = dnInput.value.trim();
      if (!/^[a-zA-Z0-9_]{1,16}$/.test(val)) {
        if (dnFeedback) { dnFeedback.textContent = "Letters, numbers and _ only (max 16)"; dnFeedback.style.color = "#f55"; }
        return;
      }
      if (typeof saveDisplayName === "function") saveDisplayName(val);
      if (dnFeedback) {
        dnFeedback.textContent = "Saved!";
        dnFeedback.style.color = "#0f0";
        clearTimeout(dnFeedback._t);
        dnFeedback._t = setTimeout(function() { dnFeedback.textContent = ""; }, 1500);
      }
    });
  }

  // Wire up theme buttons.
  ["classic", "nether", "ocean", "candy", "fossil", "storm", "void", "legendary"].forEach(function(key) {
    const btn = document.getElementById("theme-btn-" + key);
    if (!btn) return;
    btn.addEventListener("click", function() {
      if (isThemeUnlocked(key)) applyTheme(key);
    });
  });

  // Wire up graphics quality buttons.
  ['low', 'medium', 'high', 'ultra'].forEach(function(tier) {
    const btn = document.getElementById('gfx-quality-btn-' + tier);
    if (!btn) return;
    btn.addEventListener('click', function() {
      if (typeof applyGraphicsPreset === 'function') applyGraphicsPreset(tier);
    });
  });

  // Wire up parallax background toggle.
  const parallaxToggle = document.getElementById('parallax-bg-toggle');
  if (parallaxToggle) {
    // Sync initial state from the parallax module (may have loaded a saved pref).
    if (typeof getParallaxActive === 'function') {
      parallaxToggle.checked = getParallaxActive();
    }
    parallaxToggle.addEventListener('change', function() {
      if (typeof setParallaxEnabled === 'function') setParallaxEnabled(this.checked);
    });
  }

  // Wire up parallax biome selector buttons.
  document.querySelectorAll('.parallax-biome-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (typeof setParallaxBiomePref === 'function') setParallaxBiomePref(btn.dataset.biome);
    });
  });

  // Wire up board background style selector.
  const bbStyleSelect = document.getElementById('board-bg-style-select');
  if (bbStyleSelect) {
    bbStyleSelect.addEventListener('change', function() {
      if (typeof setBoardBgStyle === 'function') setBoardBgStyle(this.value);
    });
  }

  // Wire up board background scene buttons.
  document.querySelectorAll('.bb-scene-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (typeof setBoardBgScene === 'function') setBoardBgScene(btn.dataset.scene);
    });
  });

  // Wire up font size buttons.
  _loadFontSize();
  ['small', 'medium', 'large'].forEach(function(size) {
    const btn = document.getElementById('font-size-btn-' + size);
    if (btn) btn.addEventListener('click', function() { applyFontSize(size); });
  });

  _initControlsTab();
  _initTransferProgressSection();
  _initCloudSyncSection();
  if (typeof initCloudSync === 'function') initCloudSync();
  if (typeof initThemeEditor === 'function') initThemeEditor();
  if (typeof initUIThemes === 'function') initUIThemes();

  // Escape closes the settings overlay
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var overlay = document.getElementById('settings-overlay');
    if (overlay && overlay.style.display !== 'none') {
      e.preventDefault();
      closeSettings();
    }
  });

  // Arrow keys navigate between settings tabs
  var settingsTabs = document.getElementById('settings-tabs');
  if (settingsTabs) {
    settingsTabs.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var tabs = Array.from(settingsTabs.querySelectorAll('.settings-tab'));
      var idx = tabs.indexOf(document.activeElement);
      if (idx === -1) return;
      e.preventDefault();
      var next = e.key === 'ArrowRight' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
      tabs[next].focus();
      tabs[next].click();
    });
  }

  // Wire up language picker buttons.
  var langPicker = document.getElementById('lang-picker');
  if (langPicker && typeof setLanguage === 'function') {
    langPicker.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-lang]');
      if (!btn) return;
      var code = btn.getAttribute('data-lang');
      setLanguage(code);
    });
  }
  // Apply current language state to DOM on open.
  if (typeof applyTranslations === 'function') applyTranslations();
}

function _syncDisplayNameField() {
  const input = document.getElementById("settings-displayname-input");
  if (input && typeof loadDisplayName === "function") input.value = loadDisplayName();
}

/** Show the settings overlay. Optional onClose callback fires when panel is dismissed. */
var _settingsOpener = null;

function openSettings(onClose) {
  _settingsOpener = document.activeElement || null;
  _settingsCloseCallback = onClose || null;
  _syncSliders();
  const cbModeSelect = document.getElementById("cb-mode-select");
  if (cbModeSelect) cbModeSelect.value = colorblindPreset;
  const rmToggleSync = document.getElementById("reduced-motion-toggle");
  if (rmToggleSync) rmToggleSync.checked = reducedMotionEnabled;
  const hcToggleSync = document.getElementById("high-contrast-toggle");
  if (hcToggleSync) hcToggleSync.checked = highContrastEnabled;
  const weatherToggleSync = document.getElementById("weather-effects-toggle");
  if (weatherToggleSync) weatherToggleSync.checked = (typeof isWeatherEnabled === 'function') ? isWeatherEnabled() : true;
  const samToggleSync = document.getElementById("show-all-modes-toggle");
  if (samToggleSync) samToggleSync.checked = (typeof isShowAllModesEnabled === "function") && isShowAllModesEnabled();
  const tcToggleSync = document.getElementById("touch-controls-toggle");
  if (tcToggleSync) tcToggleSync.checked = (typeof isTouchControlsEnabled === "function") && isTouchControlsEnabled();
  const sensSelSync = document.getElementById("gesture-sensitivity-select");
  if (sensSelSync) sensSelSync.value = (typeof getTouchSensitivity === "function") ? getTouchSensitivity() : "medium";
  const tzToggleSync = document.getElementById("touch-zones-toggle");
  if (tzToggleSync) tzToggleSync.checked = (typeof isTouchZonesEnabled === "function") && isTouchZonesEnabled();
  const hapticsToggleSync = document.getElementById("haptics-enabled-toggle");
  if (hapticsToggleSync) hapticsToggleSync.checked = (typeof isHapticsEnabled === "function") ? isHapticsEnabled() : true;
  const hapticsIntensitySync = document.getElementById("haptics-intensity-select");
  if (hapticsIntensitySync) hapticsIntensitySync.value = (typeof getHapticsIntensity === "function") ? getHapticsIntensity() : "medium";
  _syncThemeButtons();
  if (typeof _syncGraphicsQualityButtons === 'function') _syncGraphicsQualityButtons();
  _syncFontSizeButtons();
  const _npcSel = document.getElementById('next-piece-count-select');
  if (_npcSel) _npcSel.value = String(playerNextPieceCount);
  const _goSlider = document.getElementById('ghost-opacity-slider');
  const _goVal    = document.getElementById('ghost-opacity-val');
  if (_goSlider) { _goSlider.value = String(playerGhostOpacity); if (_goVal) _goVal.textContent = playerGhostOpacity; }
  const _hvToggle = document.getElementById('hold-piece-visible-toggle');
  if (_hvToggle) _hvToggle.checked = playerHoldVisible;
  const _psSel = document.getElementById('preview-side-select');
  if (_psSel) _psSel.value = playerPreviewSide;
  _syncDisplayNameField();
  _syncKeybindTable();
  _syncLastExportLabel();
  _hideImportPreview();
  if (typeof jukeboxSyncPanel === 'function') jukeboxSyncPanel();
  // Always start on the General tab.
  const paneGeneral  = document.getElementById("settings-pane-general");
  const paneControls = document.getElementById("settings-pane-controls");
  const tabGeneral   = document.getElementById("settings-tab-general");
  const tabControls  = document.getElementById("settings-tab-controls");
  if (paneGeneral)  paneGeneral.style.display  = "";
  if (paneControls) paneControls.style.display = "none";
  if (tabGeneral)   { tabGeneral.classList.add("settings-tab-active"); tabGeneral.setAttribute("aria-selected", "true"); }
  if (tabControls)  { tabControls.classList.remove("settings-tab-active"); tabControls.setAttribute("aria-selected", "false"); }
  const overlay = document.getElementById("settings-overlay");
  if (overlay) overlay.style.display = "flex";

  // Rebuild piece skin selector (checks unlock state live).
  _buildPieceSkinSelector();

  // Rebuild board skin selector (checks unlock state live).
  if (typeof initBoardSkinSelector === 'function') initBoardSkinSelector();

  // Refresh animated skin preview strip.
  if (typeof initAnimatedSkinStrip === 'function') initAnimatedSkinStrip();

  // Trap focus inside the settings dialog.
  if (overlay && typeof trapFocus === 'function') {
    trapFocus(overlay, closeSettings);
  }
}

// ── Custom theme background / grid helpers ────────────────────────────────────

/**
 * Apply (or remove) a background colour for an active custom theme.
 * Attempts to update the Three.js scene background first; falls back to a CSS div.
 */
function _applyCustomThemeBg(bgColor) {
  const elId = 'custom-theme-bg-overlay';
  // Try Three.js scene background.
  if (typeof scene !== 'undefined' && scene && typeof THREE !== 'undefined') {
    if (bgColor) {
      scene.background = new THREE.Color(bgColor);
    } else {
      // Restore default sky colour.
      scene.background = new THREE.Color(0x87ceeb);
    }
    return;
  }
  // Fallback: CSS overlay element.
  let el = document.getElementById(elId);
  if (!bgColor) { if (el) el.style.display = 'none'; return; }
  if (!el) {
    el = document.createElement('div');
    el.id = elId;
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;';
    document.body.insertBefore(el, document.body.firstChild);
  }
  el.style.backgroundColor = bgColor;
  el.style.display = '';
}

/**
 * Draw (or clear) a grid overlay on top of the game canvas for custom themes.
 */
function _applyCustomThemeGrid(enabled, color, opacity) {
  const elId = 'custom-theme-grid-overlay';
  let el = document.getElementById(elId);
  if (!enabled) { if (el) el.style.display = 'none'; return; }
  if (!el) {
    el = document.createElement('canvas');
    el.id = elId;
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2;width:100%;height:100%;';
    document.body.appendChild(el);
  }
  el.style.display = '';
  el.width  = window.innerWidth;
  el.height = window.innerHeight;
  const ctx      = el.getContext('2d');
  const cellSize = 32;
  ctx.clearRect(0, 0, el.width, el.height);
  ctx.strokeStyle  = color || '#333333';
  ctx.globalAlpha  = (opacity !== undefined && opacity !== null) ? opacity : 0.4;
  ctx.lineWidth    = 1;
  for (let x = 0; x < el.width; x += cellSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, el.height); ctx.stroke();
  }
  for (let y = 0; y < el.height; y += cellSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(el.width, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ── Piece Skin Selector ────────────────────────────────────────────────────────
// Shows all 7 static block skins with color swatches and lock state.
// Equipping applies immediately to in-progress block meshes.

const _PIECE_SKIN_CATALOG = [
  {
    id: 'block_skin_default',
    name: 'Classic',
    sub: 'Always unlocked',
    colors: [0x8b4513, 0x808080, 0xffff00, 0x00ffff, 0x008000, 0xff0000, 0x800080],
  },
  {
    id: 'block_skin_neon',
    name: 'Neon',
    sub: 'Level 5',
    colors: [0x00ff88, 0x00ccff, 0xffff00, 0x00ffff, 0x88ff00, 0xff0066, 0xcc00ff],
  },
  {
    id: 'block_skin_pixel',
    name: 'Pixel',
    sub: 'Level 10',
    colors: [0xcc6633, 0x778899, 0xffdd44, 0x44ccff, 0x44bb44, 0xff4422, 0xbb44dd],
  },
  {
    id: 'block_skin_lava',
    name: 'Lava',
    sub: 'Level 15',
    colors: [0xcc3300, 0xff6600, 0xffcc00, 0xff4400, 0xcc2200, 0xff0000, 0xff8800],
  },
  {
    id: 'block_skin_crystal',
    name: 'Crystal',
    sub: 'Level 20',
    colors: [0xaaddff, 0x99ccee, 0xeeeeff, 0x88eeff, 0xaaffcc, 0xffaaee, 0xeeccff],
  },
  {
    id: 'block_skin_obsidian',
    name: 'Obsidian',
    sub: 'Level 25',
    colors: [0x2a0055, 0x1a1a4d, 0x4400bb, 0x220088, 0x0d0d2a, 0x550022, 0x6600cc],
  },
  {
    id: 'block_skin_diamond_classic',
    name: 'Diamond',
    sub: 'Level 35',
    colors: [0x00bbcc, 0x22ccdd, 0x44ddee, 0x77eeff, 0x009baa, 0x55eecc, 0x00ccbb],
  },
];

function _isSkinUnlocked(skinId) {
  if (skinId === 'block_skin_default') return true;
  // Run processUnlocks so newly reached levels are reflected.
  if (typeof processUnlocks === 'function') processUnlocks();
  if (typeof isCosmeticUnlocked === 'function') return isCosmeticUnlocked(skinId);
  // Fallback: live condition check.
  if (typeof getCosmeticById === 'function' && typeof checkUnlockCondition === 'function') {
    var cos = getCosmeticById(skinId);
    if (cos) return checkUnlockCondition(cos);
  }
  return false;
}

function _buildPieceSkinSelector() {
  var container = document.getElementById('piece-skin-selector');
  if (!container) return;

  var html = '';
  _PIECE_SKIN_CATALOG.forEach(function(skin) {
    var unlocked = _isSkinUnlocked(skin.id);
    var lockedClass = unlocked ? '' : ' piece-skin-btn-locked';
    html += '<button id="piece-skin-btn-' + skin.id + '" class="piece-skin-btn' + lockedClass + '"' +
      (unlocked ? '' : ' disabled') + ' data-skin-id="' + skin.id + '" title="' + skin.name + '">';
    html += '<div class="piece-skin-swatches">';
    skin.colors.forEach(function(c) {
      html += '<span class="piece-skin-swatch" style="background:#' + c.toString(16).padStart(6, '0') + '"></span>';
    });
    html += '</div>';
    html += '<span class="piece-skin-name">' + skin.name + '</span>';
    html += '<span class="piece-skin-sub' + (unlocked ? '' : ' piece-skin-hint') + '">';
    html += (unlocked ? '' : '\uD83D\uDD12 ') + skin.sub;
    html += '</span>';
    html += '</button>';
  });
  container.innerHTML = html;

  // Wire click handlers on unlocked buttons.
  var btns = container.querySelectorAll('.piece-skin-btn:not(.piece-skin-btn-locked)');
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      applyBlockSkin(btn.getAttribute('data-skin-id'));
    });
  });

  _syncPieceSkinButtons();
}

function _syncPieceSkinButtons() {
  var equippedId = 'block_skin_default';
  if (typeof getEquipped === 'function') {
    var eq = getEquipped('block_skin');
    if (eq && !(eq.assets && eq.assets.animated)) equippedId = eq.id;
  }
  _PIECE_SKIN_CATALOG.forEach(function(skin) {
    var btn = document.getElementById('piece-skin-btn-' + skin.id);
    if (!btn) return;
    btn.classList.toggle('piece-skin-btn-selected', equippedId === skin.id);
  });
}

/**
 * Equip a piece skin by cosmetic id, apply its palette to all live block meshes,
 * and refresh the HUD and skin selector UI.
 * @param {string} cosmeticId  e.g. 'block_skin_neon' or 'block_skin_default'
 */
function applyBlockSkin(cosmeticId) {
  var themeKey = null;
  if (cosmeticId && cosmeticId !== 'block_skin_default' && typeof getCosmeticById === 'function') {
    var cos = getCosmeticById(cosmeticId);
    if (cos && cos.assets && cos.assets.themeKey && !cos.assets.animated) {
      themeKey = cos.assets.themeKey;
    }
  }

  // Update global state.
  activeBlockSkin = themeKey;

  // Persist via cosmetics system.
  if (!cosmeticId || cosmeticId === 'block_skin_default') {
    if (typeof unequipCosmetic === 'function') unequipCosmetic('block_skin');
    // Delegate to applyTheme to restore theme/classic materials.
    if (typeof applyTheme === 'function') {
      applyTheme(activeTheme);
    } else if (typeof updateNextPiecesHUD === 'function') {
      updateNextPiecesHUD();
    }
  } else {
    if (typeof equipCosmetic === 'function') equipCosmetic(cosmeticId);

    // Swap materials on all live block meshes to the skin palette.
    if (!colorblindMode) {
      var skinDef = (themeKey && typeof BLOCK_SKIN_PALETTES !== 'undefined') ? BLOCK_SKIN_PALETTES[themeKey] : null;
      if (skinDef) {
        var groups = [];
        if (typeof worldGroup !== 'undefined' && worldGroup) groups.push(worldGroup);
        if (typeof fallingPiecesGroup !== 'undefined' && fallingPiecesGroup) groups.push(fallingPiecesGroup);
        groups.forEach(function(group) {
          group.traverse(function(obj) {
            if (!obj.userData || !obj.userData.isBlock) return;
            var canonHex = obj.userData.canonicalColor;
            if (canonHex === undefined) return;
            var targetColor = canonHex;
            if (typeof COLOR_TO_INDEX !== 'undefined') {
              var idx = COLOR_TO_INDEX[canonHex];
              if (idx !== undefined && skinDef.colors[idx] != null) {
                targetColor = skinDef.colors[idx];
              }
            }
            if (typeof createBlockMaterial === 'function') {
              var newMat = createBlockMaterial(targetColor);
              if (skinDef.material) {
                var m = skinDef.material;
                if (typeof THREE !== 'undefined' && m.emissive !== undefined) {
                  newMat.emissive = new THREE.Color(m.emissive);
                }
                if (m.emissiveIntensity !== undefined) newMat.emissiveIntensity = m.emissiveIntensity;
                if (m.roughness !== undefined) newMat.roughness = m.roughness;
                if (m.metalness !== undefined) newMat.metalness = m.metalness;
                newMat.needsUpdate = true;
              }
              obj.material = newMat;
              obj.userData.originalColor = newMat.color.clone();
            }
          });
        });
      }
    }

    if (typeof updateNextPiecesHUD === 'function') updateNextPiecesHUD();
  }

  if (typeof onAutoSync === 'function') onAutoSync();
  _syncPieceSkinButtons();
}

/** Hide the settings overlay and invoke the close callback if any. */
function closeSettings() {
  // Cancel any pending keybind capture.
  if (_kbListeningAction) {
    if (_kbListeningBtn) {
      _kbListeningBtn.textContent = _kbDisplayCode(getKeyBinding(_kbListeningBtn.dataset.action));
      _kbListeningBtn.classList.remove("keybind-key-btn-listening");
    }
    _kbListeningAction = null;
    _kbListeningBtn    = null;
  }
  // Release focus trap and restore focus to the element that opened settings.
  if (typeof releaseFocusTrap === 'function') releaseFocusTrap();
  const overlay = document.getElementById("settings-overlay");
  if (overlay) overlay.style.display = "none";
  if (_settingsOpener && typeof _settingsOpener.focus === 'function') {
    try { _settingsOpener.focus(); } catch (_) {}
    _settingsOpener = null;
  }
  if (_settingsCloseCallback) {
    const cb = _settingsCloseCallback;
    _settingsCloseCallback = null;
    cb();
  }
}

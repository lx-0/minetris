// Graphics quality preset system + FPS monitor.
// Tiers: 'low' (mobile), 'medium', 'high' (default desktop), 'ultra'
//
// graphicsQualityTier — global read by shaders.js, sky.js, trails.js at runtime.
// initGraphicsQuality() — call from initSettings() AFTER renderer is created.
// applyGraphicsPreset(tier) — runtime tier switch (user-initiated).
// updateFpsMonitor(timestamp) — call every frame from animate().

const GRAPHICS_QUALITY_KEY   = 'mineCtris_graphicsQuality';
const FPS_SUGGESTION_KEY     = 'mineCtris_fpsSuggestionDismissed';
const FPS_WINDOW_SECONDS     = 5;
const FPS_LOW_THRESHOLD      = 30;

// ── Public global read by other modules ──────────────────────────────────────
let graphicsQualityTier = 'high';

// ── FPS monitor state ────────────────────────────────────────────────────────
let _fpsFrameCount   = 0;
let _fpsWindowStart  = 0;
let _fpsSuggestionShown = false;

// ── Detection ────────────────────────────────────────────────────────────────

function detectDefaultQuality() {
  const isTouch       = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isSmallScreen = window.innerWidth < 768;
  return (isTouch || isSmallScreen) ? 'low' : 'high';
}

// ── Persistence ──────────────────────────────────────────────────────────────

function _loadGraphicsQuality() {
  try {
    const saved = localStorage.getItem(GRAPHICS_QUALITY_KEY);
    if (['low', 'medium', 'high', 'ultra'].includes(saved)) {
      graphicsQualityTier = saved;
    } else {
      graphicsQualityTier = detectDefaultQuality();
    }
  } catch (_) {
    graphicsQualityTier = detectDefaultQuality();
  }
}

function _saveGraphicsQuality() {
  try { localStorage.setItem(GRAPHICS_QUALITY_KEY, graphicsQualityTier); } catch (_) {}
}

// ── Apply renderer-level settings ────────────────────────────────────────────

function _applyRendererSettings(tier) {
  if (typeof renderer === 'undefined' || !renderer) return;
  if (tier === 'low') {
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
  } else if (tier === 'medium') {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = false;
  } else {
    // high / ultra
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
  }
}

// ── Material re-swap ─────────────────────────────────────────────────────────

function _rematerialBlocks() {
  if (typeof colorblindMode !== 'undefined' && colorblindMode) return;
  if (typeof activeBlockSkin !== 'undefined' && activeBlockSkin &&
      typeof BLOCK_SKIN_PALETTES !== 'undefined' && BLOCK_SKIN_PALETTES[activeBlockSkin]) return;

  const groups = [];
  if (typeof worldGroup        !== 'undefined' && worldGroup)        groups.push(worldGroup);
  if (typeof fallingPiecesGroup !== 'undefined' && fallingPiecesGroup) groups.push(fallingPiecesGroup);
  if (groups.length === 0) return;

  const THEME_PALETTE_MAP = {
    nether:    typeof NETHER_COLORS    !== 'undefined' ? NETHER_COLORS    : null,
    ocean:     typeof OCEAN_COLORS     !== 'undefined' ? OCEAN_COLORS     : null,
    candy:     typeof CANDY_COLORS     !== 'undefined' ? CANDY_COLORS     : null,
    fossil:    typeof FOSSIL_COLORS    !== 'undefined' ? FOSSIL_COLORS    : null,
    storm:     typeof STORM_COLORS     !== 'undefined' ? STORM_COLORS     : null,
    void:      typeof VOID_COLORS      !== 'undefined' ? VOID_COLORS      : null,
    legendary: typeof LEGENDARY_COLORS !== 'undefined' ? LEGENDARY_COLORS : null,
  };
  const currentTheme = (typeof activeTheme !== 'undefined') ? activeTheme : 'classic';
  const themePalette = THEME_PALETTE_MAP[currentTheme] || null;

  groups.forEach(function(group) {
    group.traverse(function(obj) {
      if (!obj.userData || !obj.userData.isBlock) return;
      const canonHex = obj.userData.canonicalColor;
      if (canonHex === undefined) return;

      let displayHex = canonHex;
      if (themePalette) {
        const idx = (typeof COLOR_TO_INDEX !== 'undefined') ? COLOR_TO_INDEX[canonHex] : undefined;
        if (idx !== undefined && themePalette[idx] !== null) {
          displayHex = themePalette[idx];
        }
      }

      const newMat = createBlockMaterial(displayHex);
      obj.material = newMat;
      obj.userData.originalColor = newMat.color.clone();
    });
  });

  if (typeof updateNextPiecesHUD === 'function') updateNextPiecesHUD();
}

// ── Sync UI buttons ───────────────────────────────────────────────────────────

function _syncGraphicsQualityButtons() {
  ['low', 'medium', 'high', 'ultra'].forEach(function(t) {
    const btn = document.getElementById('gfx-quality-btn-' + t);
    if (btn) btn.classList.toggle('gfx-quality-btn-selected', graphicsQualityTier === t);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

function getGraphicsQuality() { return graphicsQualityTier; }

/**
 * Apply a graphics quality preset at runtime (user-initiated).
 * Adjusts renderer, post-processing, materials, sky, and trails immediately.
 */
function applyGraphicsPreset(tier) {
  if (!['low', 'medium', 'high', 'ultra'].includes(tier)) return;
  graphicsQualityTier = tier;
  _saveGraphicsQuality();

  _applyRendererSettings(tier);

  const noBloom = (tier === 'low' || tier === 'medium');
  const noCA    = (tier === 'low');
  if (typeof setBloomEnabled                  === 'function') setBloomEnabled(!noBloom);
  if (typeof setChromaticAberrationEnabled    === 'function') setChromaticAberrationEnabled(!noCA);

  // Sky and trails read graphicsQualityTier directly — no extra call needed.
  // Re-material all existing blocks to match new quality.
  _rematerialBlocks();
  _syncGraphicsQualityButtons();
}

/**
 * Called once from initSettings() after the renderer has been created.
 * Sets quality from storage / auto-detect and applies renderer-level settings.
 * Post-processing passes are applied later by initPostProcessing().
 */
function initGraphicsQuality() {
  _loadGraphicsQuality();
  _applyRendererSettings(graphicsQualityTier);
  _syncGraphicsQualityButtons();
}

// ── FPS Monitor ──────────────────────────────────────────────────────────────

/**
 * Call every frame from animate() with performance.now() timestamp.
 * Tracks FPS over 5-second windows; shows a one-time suggestion if < 30fps.
 */
function updateFpsMonitor(timestamp) {
  if (_fpsSuggestionShown) return; // done — no-op going forward

  _fpsFrameCount++;
  if (_fpsWindowStart === 0) {
    _fpsWindowStart = timestamp;
    return;
  }
  const elapsed = (timestamp - _fpsWindowStart) / 1000;
  if (elapsed < FPS_WINDOW_SECONDS) return;

  const fps = _fpsFrameCount / elapsed;
  _fpsFrameCount  = 0;
  _fpsWindowStart = timestamp;

  if (fps < FPS_LOW_THRESHOLD) {
    try {
      if (!localStorage.getItem(FPS_SUGGESTION_KEY)) {
        _showFpsSuggestion();
      }
    } catch (_) {
      _showFpsSuggestion();
    }
    _fpsSuggestionShown = true;
  }
}

function _showFpsSuggestion() {
  const toast = document.getElementById('fps-suggestion-toast');
  if (!toast) return;
  toast.style.display = 'flex';
  void toast.offsetWidth; // reflow for transition
  toast.classList.add('fps-suggestion-visible');
}

function _dismissFpsSuggestion() {
  const toast = document.getElementById('fps-suggestion-toast');
  if (toast) {
    toast.classList.remove('fps-suggestion-visible');
    setTimeout(function() { toast.style.display = 'none'; }, 400);
  }
  try { localStorage.setItem(FPS_SUGGESTION_KEY, '1'); } catch (_) {}
}

function _initFpsSuggestionToast() {
  const dismissBtn = document.getElementById('fps-suggestion-dismiss');
  if (dismissBtn) dismissBtn.addEventListener('click', _dismissFpsSuggestion);

  const lowerBtn = document.getElementById('fps-suggestion-lower');
  if (lowerBtn) {
    lowerBtn.addEventListener('click', function() {
      applyGraphicsPreset('low');
      _dismissFpsSuggestion();
      // Show confirmation
      var toast = document.getElementById('event-end-toast');
      if (toast) {
        toast.textContent = '\uD83D\uDCF1 Graphics set to Low for better performance.';
        toast.classList.remove('toast-visible');
        void toast.offsetWidth;
        toast.style.display = 'block';
        toast.classList.add('toast-visible');
        setTimeout(function() {
          toast.classList.remove('toast-visible');
          setTimeout(function() { toast.style.display = 'none'; }, 400);
        }, 2800);
      }
    });
  }
}

// Wire up toast buttons when DOM is ready (called from initGraphicsQuality flow).
// We defer to after DOMContentLoaded since this script may load before DOM settles.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initFpsSuggestionToast);
} else {
  _initFpsSuggestionToast();
}

// Graphics quality preset system + FPS monitor + performance metrics.
// Tiers: 'low' (mobile), 'medium', 'high' (default desktop), 'ultra'
//
// graphicsQualityTier — global read by shaders.js, sky.js, trails.js at runtime.
// initGraphicsQuality() — call from initSettings() AFTER renderer is created.
// applyGraphicsPreset(tier) — runtime tier switch (user-initiated).
// updateFpsMonitor(timestamp) — call every frame from animate().
//
// Performance overlay (debug):
//   togglePerfOverlay()   — show/hide full metrics panel (console command)
//   toggleFpsCounter()    — show/hide simple FPS badge (console command)
//   getPerfMetrics()      — returns snapshot of all tracked metrics
//   perfMarkTransitionStart(label) / perfMarkTransitionEnd() — mode timing hooks

const GRAPHICS_QUALITY_KEY   = 'mineCtris_graphicsQuality';
const FPS_SUGGESTION_KEY     = 'mineCtris_fpsSuggestionDismissed';
const FPS_WINDOW_SECONDS     = 5;
const FPS_LOW_THRESHOLD      = 30;

// ── Public global read by other modules ──────────────────────────────────────
let graphicsQualityTier = 'high';

// ── FPS monitor state (suggestion logic) ─────────────────────────────────────
let _fpsFrameCount   = 0;
let _fpsWindowStart  = 0;
let _fpsSuggestionShown = false;

// ── Performance metrics state ─────────────────────────────────────────────────
// Circular frametime buffer (ms per frame, last ~5 s at 60 fps).
const _PERF_BUF_SIZE         = 300;
const _PERF_DROP_THRESHOLD   = 33; // ms; frame longer than this counts as a drop
const _PERF_FPS_HIST_SIZE    = 60; // per-second samples kept for graph

let _perfBuf          = new Float32Array(_PERF_BUF_SIZE);
let _perfHead         = 0;
let _perfFilled       = 0;
let _perfLastTs       = 0;    // timestamp of previous frame (ms)
let _perfDropCount    = 0;    // cumulative frame-drop counter
let _perfSecondAcc    = 0;    // ms accumulated in current 1-second window
let _perfSecondFrames = 0;    // frame count in current 1-second window
let _perfFpsHistory   = [];   // rolling per-second FPS values
let _perfLoadStart    = performance.now(); // captured at script parse
let _perfLoadTime     = null; // ms from script-parse to initGraphicsQuality()

// Mode-transition timing
let _perfTransStart = null;
let _perfTransLabel = '';
let _perfTransitions = []; // [{label, durationMs}] — last 10 recorded

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
  if (typeof activePerPieceTypeSkins !== 'undefined' && activePerPieceTypeSkins &&
      Object.keys(activePerPieceTypeSkins).length > 0) return;

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
    ender:     typeof ENDER_COLORS     !== 'undefined' ? ENDER_COLORS     : null,
    diamond:   typeof DIAMOND_COLORS   !== 'undefined' ? DIAMOND_COLORS   : null,
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
 * Low  — no particles, no weather, static backgrounds, Lambert materials, no shadows.
 * Medium — reduced particles, no weather, no bloom, no shadows.
 * High — bloom, shadows, all effects (default desktop).
 * Ultra — maximum quality, all effects.
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
 * Also records the initial load time.
 */
function initGraphicsQuality() {
  _perfLoadTime = performance.now() - _perfLoadStart;
  _loadGraphicsQuality();
  _applyRendererSettings(graphicsQualityTier);
  _syncGraphicsQualityButtons();
}

// ── Performance metrics helpers ───────────────────────────────────────────────

function _perfComputeAvgFps() {
  if (_perfFilled === 0) return 0;
  const count = Math.min(_perfFilled, _PERF_BUF_SIZE);
  let sum = 0;
  for (let i = 0; i < count; i++) sum += _perfBuf[i];
  const avgFt = sum / count;
  return avgFt > 0 ? Math.round(1000 / avgFt) : 0;
}

function _perfComputeP95Fps() {
  if (_perfFilled === 0) return 0;
  const count = Math.min(_perfFilled, _PERF_BUF_SIZE);
  // Copy the valid portion of the circular buffer into a sorted array.
  const ft = Array.from(_perfBuf.subarray(0, count)).slice();
  ft.sort(function(a, b) { return a - b; });
  const p95ft = ft[Math.min(Math.floor(count * 0.95), count - 1)];
  return p95ft > 0 ? Math.round(1000 / p95ft) : 0;
}

/**
 * Mark the start of a mode transition for timing.
 * @param {string} label  Human-readable label (e.g. 'mainMenu→classic')
 */
function perfMarkTransitionStart(label) {
  _perfTransStart = performance.now();
  _perfTransLabel = label || 'transition';
}
window.perfMarkTransitionStart = perfMarkTransitionStart;

/**
 * Mark the end of a mode transition; records the duration.
 */
function perfMarkTransitionEnd() {
  if (_perfTransStart === null) return;
  const dur = Math.round(performance.now() - _perfTransStart);
  _perfTransitions.push({ label: _perfTransLabel, durationMs: dur });
  if (_perfTransitions.length > 10) _perfTransitions.shift();
  _perfTransStart = null;
}
window.perfMarkTransitionEnd = perfMarkTransitionEnd;

/**
 * Returns a plain-object snapshot of all tracked performance metrics.
 */
function getPerfMetrics() {
  return {
    currentFps:  _perfFpsHistory.length ? _perfFpsHistory[_perfFpsHistory.length - 1] : null,
    avgFps:      _perfComputeAvgFps(),
    p95Fps:      _perfComputeP95Fps(),
    frameDrops:  _perfDropCount,
    loadTimeMs:  _perfLoadTime,
    transitions: _perfTransitions.slice(),
    quality:     graphicsQualityTier,
    fpsHistory:  _perfFpsHistory.slice(),
  };
}
window.getPerfMetrics = getPerfMetrics;

// ── Performance overlay (debug panel) ────────────────────────────────────────

let _perfOverlayEnabled = false;
let _perfOverlayEl      = null;
let _perfOverlayStats   = null;
let _perfGraphCanvas    = null;
let _perfGraphCtx       = null;

function _ensurePerfOverlayEl() {
  if (_perfOverlayEl) return;

  _perfOverlayEl = document.createElement('div');
  _perfOverlayEl.id = 'perf-overlay';
  Object.assign(_perfOverlayEl.style, {
    position:     'fixed',
    top:          '8px',
    left:         '8px',
    zIndex:       '99998',
    background:   'rgba(0,0,0,0.82)',
    color:        '#d8d8d8',
    font:         '11px/1.6 monospace',
    padding:      '8px 10px',
    borderRadius: '5px',
    pointerEvents:'none',
    display:      'none',
    minWidth:     '210px',
    userSelect:   'none',
    border:       '1px solid rgba(255,255,255,0.08)',
  });

  _perfOverlayStats = document.createElement('div');
  _perfOverlayEl.appendChild(_perfOverlayStats);

  // FPS history graph
  _perfGraphCanvas = document.createElement('canvas');
  _perfGraphCanvas.width  = 200;
  _perfGraphCanvas.height = 44;
  Object.assign(_perfGraphCanvas.style, { display: 'block', marginTop: '5px' });
  _perfOverlayEl.appendChild(_perfGraphCanvas);
  _perfGraphCtx = _perfGraphCanvas.getContext('2d');

  document.body.appendChild(_perfOverlayEl);
}

function _renderPerfOverlay(currentFps) {
  if (!_perfOverlayEnabled || !_perfOverlayEl) return;

  const avgFps = _perfComputeAvgFps();
  const p95Fps = _perfComputeP95Fps();

  // Memory (Chrome-only Performance API)
  let memStr = 'N/A';
  if (performance.memory) {
    memStr = Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB';
  }

  // Draw calls (Three.js renderer.info)
  let drawStr = 'N/A';
  if (typeof renderer !== 'undefined' && renderer && renderer.info) {
    drawStr = String(renderer.info.render.calls);
  }

  const loadStr  = _perfLoadTime !== null
    ? (_perfLoadTime / 1000).toFixed(2) + 's'
    : '--';
  const fpsColor = currentFps >= 55 ? '#00ff44' : currentFps >= 30 ? '#ffcc00' : '#ff4444';

  // Input latency (from DAS/ARR module, -1 if no sample yet).
  let inputLatStr = '--';
  if (typeof getInputLatencyMs === 'function') {
    const _il = getInputLatencyMs();
    if (_il >= 0) {
      const _ilColor = _il < 16 ? '#00ff44' : _il < 33 ? '#ffcc00' : '#ff4444';
      inputLatStr = '<span style="color:' + _ilColor + '">' + _il.toFixed(1) + 'ms</span>';
    }
  }

  _perfOverlayStats.innerHTML =
    '<span style="color:#9af;font-weight:bold">PERF MONITOR</span>' +
    '  <span style="color:#555;font-size:10px">togglePerfOverlay()</span><br>' +
    'FPS <span style="color:' + fpsColor + '">' + currentFps + '</span>' +
    '  avg <b>' + avgFps + '</b>' +
    '  P95 <b>' + p95Fps + '</b><br>' +
    'Drops <b>' + _perfDropCount + '</b>' +
    '  Load <b>' + loadStr + '</b><br>' +
    'Mem <b>' + memStr + '</b>' +
    '  Draws <b>' + drawStr + '</b><br>' +
    'Quality <span style="color:#7df">' + graphicsQualityTier + '</span>' +
    '  Input lag ' + inputLatStr;

  // Draw FPS history graph
  if (_perfGraphCtx && _perfFpsHistory.length > 1) {
    const ctx = _perfGraphCtx;
    const w   = _perfGraphCanvas.width;
    const h   = _perfGraphCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, w, h);

    // 60 fps reference line
    ctx.strokeStyle = 'rgba(0,255,68,0.25)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    const y60 = h - Math.round((60 / 90) * h);
    ctx.moveTo(0, y60);
    ctx.lineTo(w, y60);
    ctx.stroke();

    const hist = _perfFpsHistory;
    const barW = w / _PERF_FPS_HIST_SIZE;
    for (let i = 0; i < hist.length; i++) {
      const fps  = hist[i];
      const barH = Math.min(Math.round((fps / 90) * h), h);
      ctx.fillStyle = fps >= 55 ? '#00cc44' : fps >= 30 ? '#ffcc00' : '#ff4444';
      ctx.fillRect(
        Math.round(i * barW),
        h - barH,
        Math.max(Math.floor(barW) - 1, 1),
        barH
      );
    }
  }
}

/**
 * Toggle the full performance debug overlay.
 * Usage (browser console):
 *   togglePerfOverlay()       — flip current state
 *   togglePerfOverlay(true)   — force on
 *   togglePerfOverlay(false)  — force off
 */
function togglePerfOverlay(on) {
  _perfOverlayEnabled = (typeof on === 'boolean') ? on : !_perfOverlayEnabled;
  _ensurePerfOverlayEl();
  _perfOverlayEl.style.display = _perfOverlayEnabled ? 'block' : 'none';
  // Hide simple FPS counter when full overlay is active (redundant)
  if (_fpsCounterEl) {
    _fpsCounterEl.style.display = (_perfOverlayEnabled || !_fpsCounterEnabled) ? 'none' : 'block';
  }
  if (_perfOverlayEnabled) {
    console.info('[PerfOverlay] ON — getPerfMetrics() for raw data, ' +
      'perfMarkTransitionStart(label)/perfMarkTransitionEnd() for mode timing');
  }
  return _perfOverlayEnabled ? 'Perf overlay ON' : 'Perf overlay OFF';
}
window.togglePerfOverlay = togglePerfOverlay;

// ── Debug FPS Counter ────────────────────────────────────────────────────────
// Toggle via browser console: toggleFpsCounter()  or  toggleFpsCounter(true/false)

let _fpsCounterEnabled = false;
let _fpsCounterEl      = null;
let _fpsCounterFrames  = 0;
let _fpsCounterStart   = 0;

function _ensureFpsCounterEl() {
  if (_fpsCounterEl) return;
  _fpsCounterEl = document.createElement('div');
  _fpsCounterEl.id = 'debug-fps-counter';
  Object.assign(_fpsCounterEl.style, {
    position:     'fixed',
    top:          '8px',
    left:         '8px',
    zIndex:       '99999',
    background:   'rgba(0,0,0,0.65)',
    color:        '#00ff44',
    font:         'bold 12px/1.6 monospace',
    padding:      '1px 7px',
    borderRadius: '3px',
    pointerEvents:'none',
    display:      'none',
    userSelect:   'none',
  });
  document.body.appendChild(_fpsCounterEl);
}

/**
 * Toggle the debug FPS counter overlay.
 * Usage (browser console):
 *   toggleFpsCounter()          — flip current state
 *   toggleFpsCounter(true)      — force on
 *   toggleFpsCounter(false)     — force off
 */
function toggleFpsCounter(on) {
  _fpsCounterEnabled = (typeof on === 'boolean') ? on : !_fpsCounterEnabled;
  _ensureFpsCounterEl();
  // Hide the simple counter if the full overlay is already visible
  _fpsCounterEl.style.display = (_fpsCounterEnabled && !_perfOverlayEnabled) ? 'block' : 'none';
  if (_fpsCounterEnabled) {
    _fpsCounterFrames = 0;
    _fpsCounterStart  = 0;
    _fpsCounterEl.textContent = 'FPS: --';
  }
  return _fpsCounterEnabled ? 'FPS counter ON' : 'FPS counter OFF';
}
window.toggleFpsCounter = toggleFpsCounter;

function _tickFpsCounter(timestamp) {
  if (!_fpsCounterEnabled || !_fpsCounterEl || _perfOverlayEnabled) return;
  _fpsCounterFrames++;
  if (_fpsCounterStart === 0) { _fpsCounterStart = timestamp; return; }
  const elapsed = (timestamp - _fpsCounterStart) / 1000;
  if (elapsed < 0.5) return; // update every ~0.5s
  const fps = Math.round(_fpsCounterFrames / elapsed);
  _fpsCounterFrames = 0;
  _fpsCounterStart  = timestamp;
  _fpsCounterEl.style.color = fps >= 55 ? '#00ff44' : fps >= 30 ? '#ffdd00' : '#ff3333';
  _fpsCounterEl.textContent = 'FPS: ' + fps;
}

// ── FPS Monitor ──────────────────────────────────────────────────────────────

/**
 * Call every frame from animate() with performance.now() timestamp.
 * Tracks per-frame frametimes, computes per-second FPS samples, counts frame
 * drops, and drives both the debug overlay and the low-FPS suggestion logic.
 */
function updateFpsMonitor(timestamp) {
  _tickFpsCounter(timestamp);

  // ── Per-frame frametime tracking ─────────────────────────────────────────
  if (_perfLastTs > 0) {
    const ft = timestamp - _perfLastTs;

    // Store in circular buffer
    _perfBuf[_perfHead] = ft;
    _perfHead = (_perfHead + 1) % _PERF_BUF_SIZE;
    if (_perfFilled < _PERF_BUF_SIZE) _perfFilled++;

    // Count slow frames
    if (ft > _PERF_DROP_THRESHOLD) _perfDropCount++;

    // Accumulate for per-second FPS sample
    _perfSecondAcc    += ft;
    _perfSecondFrames += 1;
    if (_perfSecondAcc >= 1000) {
      const secFps = Math.round(_perfSecondFrames * 1000 / _perfSecondAcc);
      _perfFpsHistory.push(secFps);
      if (_perfFpsHistory.length > _PERF_FPS_HIST_SIZE) _perfFpsHistory.shift();
      _renderPerfOverlay(secFps);
      _perfSecondAcc    = 0;
      _perfSecondFrames = 0;
    }
  }
  _perfLastTs = timestamp;

  // ── Low-FPS suggestion window (fires at most once per session) ───────────
  if (_fpsSuggestionShown) return;

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

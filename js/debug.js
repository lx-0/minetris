// debug.js — Developer performance profiler overlay (MINAA-462)
//
// Toggle:   F3 key  or  backtick (`)
// Metrics:  FPS (current / avg / min), frame time (ms), memory,
//           active particles, draw call estimate
// Visual:   compact semi-transparent panel, top-right corner
//           FPS color-coded green (55+) / yellow (30-54) / red (<30)
//           frame-time sparkline for last 120 frames
// Persist:  localStorage toggle state (survives page reload)
// Gate:     only available on localhost / dev hostnames, or ?debug=1
//
// Called per-frame from game-loop.js: updateDebugProfiler(timestamp)

(function () {
  'use strict';

  const STORAGE_KEY  = 'mineCtris_debugOverlay';
  const FT_BUF_SIZE  = 120; // sparkline frames

  // ── State ────────────────────────────────────────────────────────────────
  let _enabled     = false;
  let _el          = null;
  let _statsEl     = null;
  let _sparkCanvas = null;
  let _sparkCtx    = null;

  // Per-frame tracking
  const _ftBuf   = new Float32Array(FT_BUF_SIZE);
  let _ftHead    = 0;
  let _ftFilled  = 0;
  let _lastTs    = 0;
  let _secAcc    = 0;
  let _secFrames = 0;

  // Displayed values (updated once per second)
  let _curFps  = 0;
  let _avgFps  = 0;
  let _minFps  = Infinity;
  let _curFtMs = 0;

  // ── Availability gate ────────────────────────────────────────────────────
  function _isAvailable() {
    try {
      if (new URLSearchParams(window.location.search).get('debug') === '1') return true;
      const h = window.location.hostname;
      return (h === '' || h === 'localhost' || h === '127.0.0.1' ||
              h.startsWith('192.168.') || h.startsWith('10.'));
    } catch (_e) { return false; }
  }

  // ── DOM ──────────────────────────────────────────────────────────────────
  function _ensureEl() {
    if (_el) return;

    _el = document.createElement('div');
    _el.id = 'debug-profiler-overlay';
    Object.assign(_el.style, {
      position:     'fixed',
      top:          '8px',
      right:        '8px',
      zIndex:       '99999',
      background:   'rgba(0,0,0,0.72)',
      color:        '#d0d0d0',
      font:         '11px/1.7 monospace',
      padding:      '7px 11px',
      borderRadius: '4px',
      pointerEvents:'none',
      minWidth:     '195px',
      userSelect:   'none',
      border:       '1px solid rgba(255,255,255,0.07)',
      display:      'none',
    });

    _statsEl = document.createElement('div');
    _el.appendChild(_statsEl);

    // Frame-time sparkline canvas (last 120 frames)
    _sparkCanvas = document.createElement('canvas');
    _sparkCanvas.width  = 190;
    _sparkCanvas.height = 36;
    Object.assign(_sparkCanvas.style, { display: 'block', marginTop: '4px' });
    _el.appendChild(_sparkCanvas);
    _sparkCtx = _sparkCanvas.getContext('2d');

    document.body.appendChild(_el);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function _render() {
    if (!_enabled || !_statsEl) return;

    function _fpsColor(fps) {
      return fps >= 55 ? '#00ff44' : fps >= 30 ? '#ffdd00' : '#ff4444';
    }

    const minFpsStr = _minFps === Infinity ? '--' : String(_minFps);

    // Memory (Chrome-only performance.memory API)
    let memStr = 'N/A';
    if (performance.memory) {
      memStr = Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB';
    }

    // Draw calls from Three.js renderer.info
    let drawStr = 'N/A';
    if (typeof renderer !== 'undefined' && renderer && renderer.info) {
      drawStr = String(renderer.info.render.calls);
    }

    // Active dust particles (global dustParticles array from state.js)
    let partStr = 'N/A';
    if (typeof dustParticles !== 'undefined') {
      partStr = String(dustParticles.length);
    }

    _statsEl.innerHTML =
      '<span style="color:#9af;font-weight:bold;letter-spacing:.05em">DEBUG</span>' +
      '  <span style="color:#444;font-size:10px">F3/` to close</span><br>' +
      'FPS <span style="color:' + _fpsColor(_curFps) + '"><b>' + _curFps + '</b></span>' +
      '  avg <span style="color:' + _fpsColor(_avgFps) + '">' + _avgFps + '</span>' +
      '  min <span style="color:' + _fpsColor(_minFps === Infinity ? 0 : _minFps) + '">' + minFpsStr + '</span><br>' +
      'Frame <b>' + _curFtMs.toFixed(1) + ' ms</b><br>' +
      'Mem <b>' + memStr + '</b>' +
      '  Draws <b>' + drawStr + '</b><br>' +
      'Particles <b>' + partStr + '</b>';

    // ── Sparkline (frame time, last 120 frames) ───────────────────────────
    if (_sparkCtx && _ftFilled > 1) {
      const ctx = _sparkCtx;
      const w   = _sparkCanvas.width;
      const h   = _sparkCanvas.height;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, 0, w, h);

      // 60 fps reference line at 16.67 ms (cap display range at 50 ms)
      const ref60y = h - Math.round((16.67 / 50) * h);
      ctx.strokeStyle = 'rgba(0,255,68,0.20)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(0, ref60y);
      ctx.lineTo(w, ref60y);
      ctx.stroke();

      const count  = Math.min(_ftFilled, FT_BUF_SIZE);
      const barW   = w / FT_BUF_SIZE;
      const startI = (_ftHead - count + FT_BUF_SIZE) % FT_BUF_SIZE;

      for (let i = 0; i < count; i++) {
        const ft   = _ftBuf[(startI + i) % FT_BUF_SIZE];
        const barH = Math.min(Math.round((ft / 50) * h), h);
        ctx.fillStyle = ft <= 18 ? '#00cc44' : ft <= 33 ? '#ffcc00' : '#ff4444';
        ctx.fillRect(
          Math.round(i * barW), h - barH,
          Math.max(Math.floor(barW) - 1, 1), barH
        );
      }
    }
  }

  // ── Per-frame update (called from game-loop.js each frame) ───────────────
  function updateDebugProfiler(timestamp) {
    if (_lastTs > 0) {
      const ft = timestamp - _lastTs;

      // Store in circular frame-time buffer
      _ftBuf[_ftHead] = ft;
      _ftHead = (_ftHead + 1) % FT_BUF_SIZE;
      if (_ftFilled < FT_BUF_SIZE) _ftFilled++;
      _curFtMs = ft;

      // Accumulate for per-second FPS sample
      _secAcc    += ft;
      _secFrames += 1;
      if (_secAcc >= 1000) {
        const fps = Math.round(_secFrames * 1000 / _secAcc);
        _curFps = fps;
        if (fps < _minFps) _minFps = fps;
        // Average FPS: reuse getPerfMetrics() from graphics-quality.js if available
        _avgFps = (typeof getPerfMetrics === 'function')
          ? (getPerfMetrics().avgFps || fps)
          : fps;
        _secAcc    = 0;
        _secFrames = 0;
        if (_enabled) _render();
      }
    }
    _lastTs = timestamp;
  }
  window.updateDebugProfiler = updateDebugProfiler;

  // ── Toggle ───────────────────────────────────────────────────────────────
  function toggleDebugProfiler(force) {
    if (!_isAvailable()) return 'Debug profiler not available (use ?debug=1)';
    _enabled = (typeof force === 'boolean') ? force : !_enabled;
    _ensureEl();
    _el.style.display = _enabled ? 'block' : 'none';
    try { localStorage.setItem(STORAGE_KEY, _enabled ? '1' : '0'); } catch (_e) {}
    if (_enabled) { _minFps = Infinity; _render(); }
    return _enabled ? 'Debug profiler ON' : 'Debug profiler OFF';
  }
  window.toggleDebugProfiler = toggleDebugProfiler;

  // ── Keyboard handler (F3 or backtick) ────────────────────────────────────
  function _onKeyDown(e) {
    if (!_isAvailable()) return;
    const tag = (e.target || {}).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'F3' || e.key === '`') {
      e.preventDefault();
      toggleDebugProfiler();
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function _init() {
    if (!_isAvailable()) return;

    window.addEventListener('keydown', _onKeyDown);

    // Restore persisted toggle state
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') {
        toggleDebugProfiler(true);
      }
    } catch (_e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();

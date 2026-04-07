// Global error reporting, crash recovery, and state snapshot system.
// Installs window.onerror + unhandledrejection listeners.
// Saves periodic state snapshots to localStorage for crash recovery.
// Shows a pure HTML/CSS error overlay that does not depend on the game renderer.

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  const ERROR_LOG_KEY      = 'mineCtris_errorLog';
  const SNAPSHOT_KEY       = 'mineCtris_crashSnapshot';
  const MAX_ERROR_LOG      = 10;
  const SNAPSHOT_INTERVAL  = 30000; // 30 seconds

  // ── Dev mode detection ────────────────────────────────────────────────────
  // Dev mode: localhost, *.local, or ?dev=1 in the URL.
  const IS_DEV = (
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname.endsWith('.local') ||
    location.search.indexOf('dev=1') !== -1
  );

  // ── Error log helpers ─────────────────────────────────────────────────────
  function readErrorLog() {
    try {
      const raw = localStorage.getItem(ERROR_LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  function writeErrorLog(entries) {
    try { localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(entries)); } catch (_) {}
  }

  function appendErrorLog(entry) {
    const log = readErrorLog();
    log.push(entry);
    // Keep only the last MAX_ERROR_LOG entries
    if (log.length > MAX_ERROR_LOG) log.splice(0, log.length - MAX_ERROR_LOG);
    writeErrorLog(log);
  }

  function buildLogEntry(message, source, lineno, colno, error) {
    const state = collectStateSummary();
    return {
      ts:      new Date().toISOString(),
      msg:     String(message).slice(0, 500),
      source:  String(source || '').slice(0, 200),
      line:    lineno || 0,
      col:     colno  || 0,
      stack:   (error && error.stack) ? String(error.stack).slice(0, 2000) : '',
      ua:      navigator.userAgent.slice(0, 200),
      state
    };
  }

  // ── Game state summary (lightweight — only scalars, no 3D objects) ────────
  function collectStateSummary() {
    try {
      return {
        score:               typeof score !== 'undefined'               ? score               : null,
        linesCleared:        typeof linesCleared !== 'undefined'        ? linesCleared        : null,
        blocksMined:         typeof blocksMined !== 'undefined'         ? blocksMined         : null,
        gameElapsedSeconds:  typeof gameElapsedSeconds !== 'undefined'  ? gameElapsedSeconds  : null,
        isGameOver:          typeof isGameOver !== 'undefined'          ? isGameOver          : null,
        isPaused:            typeof isPaused !== 'undefined'            ? isPaused            : null,
        difficultyMultiplier: typeof difficultyMultiplier !== 'undefined' ? difficultyMultiplier : null,
        pieceQueueLen:       typeof pieceQueue !== 'undefined' && pieceQueue ? pieceQueue.length : null,
        marathonLevel:       typeof marathonLevel !== 'undefined'       ? marathonLevel       : null,
      };
    } catch (_) { return {}; }
  }

  // ── Periodic crash snapshot (every 30s during active gameplay) ────────────
  // Uses the existing saveGameState() so recovery can use restoreGameState().
  // Only fires when the game is active (not game-over, not paused).
  let _snapshotTimer = null;

  function startSnapshotTimer() {
    if (_snapshotTimer) return;
    _snapshotTimer = setInterval(function () {
      try {
        const active = (
          typeof isGameOver !== 'undefined' && !isGameOver &&
          typeof isPaused   !== 'undefined' && !isPaused   &&
          typeof saveGameState === 'function'
        );
        if (active) {
          saveGameState();
          // Tag the snapshot time so recovery UI can show a meaningful timestamp.
          try { localStorage.setItem(SNAPSHOT_KEY, String(Date.now())); } catch (_) {}
        }
      } catch (_) {}
    }, SNAPSHOT_INTERVAL);
  }

  // Start the snapshot timer once the DOM is fully loaded.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startSnapshotTimer);
  } else {
    startSnapshotTimer();
  }

  // ── Error overlay ─────────────────────────────────────────────────────────
  let _overlayShown = false;

  function showErrorOverlay(entry) {
    if (_overlayShown) return; // Only show once per session
    _overlayShown = true;

    // Release pointer lock so the cursor is visible.
    try { document.exitPointerLock(); } catch (_) {}

    const hasSnapshot = (function () {
      try { return !!localStorage.getItem('mineCtris_saveState'); } catch (_) { return false; }
    }());

    const snapshotAgeMsg = (function () {
      try {
        const ts = localStorage.getItem(SNAPSHOT_KEY);
        if (!ts) return '';
        const ageS = Math.round((Date.now() - parseInt(ts, 10)) / 1000);
        if (ageS < 60)  return ' (saved ' + ageS + 's ago)';
        return ' (saved ~' + Math.round(ageS / 60) + 'min ago)';
      } catch (_) { return ''; }
    }());

    const overlay = document.createElement('div');
    overlay.id = 'minetris-error-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Game error');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:999999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.88)',
      'font-family:"Press Start 2P",monospace,sans-serif',
      'padding:1rem', 'box-sizing:border-box'
    ].join(';');

    const resumeBtn  = hasSnapshot
      ? '<button id="err-btn-resume"  style="' + btnStyle('#22c55e','#15803d') + '">&#9654; Resume Game' + snapshotAgeMsg + '</button>'
      : '';
    const restartBtn = '<button id="err-btn-restart" style="' + btnStyle('#3b82f6','#1d4ed8') + '">&#8635; Restart</button>';
    const reportBtn  = '<button id="err-btn-report"  style="' + btnStyle('#6b7280','#374151') + '">&#9432; Details</button>';

    overlay.innerHTML =
      '<div style="max-width:480px;width:100%;text-align:center;color:#fff;">' +
        '<div style="font-size:2.5rem;margin-bottom:1rem;">&#128680;</div>' +
        '<h2 style="font-size:clamp(0.7rem,3vw,1rem);color:#f87171;margin-bottom:0.75rem;letter-spacing:0.05em;">SOMETHING WENT WRONG</h2>' +
        '<p style="font-size:clamp(0.4rem,1.8vw,0.55rem);color:#9ca3af;line-height:1.8;margin-bottom:1.75rem;">' +
          'An unexpected error occurred.' +
          (hasSnapshot ? ' Your last game state was saved — you can try to recover it.' : '') +
        '</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:0.75rem;justify-content:center;margin-bottom:1.5rem;">' +
          resumeBtn + restartBtn + reportBtn +
        '</div>' +
        '<div id="err-details" style="display:none;text-align:left;background:#111;border:1px solid #374151;border-radius:4px;padding:0.75rem;margin-top:0.5rem;font-size:0.4rem;color:#6b7280;line-height:1.7;max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-all;">' +
          escapeHtml(entry.msg + (entry.stack ? '\n\n' + entry.stack : '') + '\n\n' + JSON.stringify(entry.state, null, 2)) +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Wire buttons
    const resumeEl = document.getElementById('err-btn-resume');
    if (resumeEl) {
      resumeEl.addEventListener('click', function () {
        // The existing save state is still in localStorage — just reload.
        location.reload();
      });
    }

    document.getElementById('err-btn-restart').addEventListener('click', function () {
      try {
        localStorage.removeItem('mineCtris_saveState');
        localStorage.removeItem(SNAPSHOT_KEY);
      } catch (_) {}
      location.reload();
    });

    document.getElementById('err-btn-report').addEventListener('click', function () {
      const d = document.getElementById('err-details');
      if (d) d.style.display = d.style.display === 'none' ? 'block' : 'none';
    });
  }

  function btnStyle(bg, hover) {
    return [
      'display:inline-block', 'padding:0.6rem 1.2rem',
      'background:' + bg, 'color:#fff',
      'border:none', 'border-radius:3px',
      'font-family:inherit', 'font-size:clamp(0.38rem,1.6vw,0.5rem)',
      'cursor:pointer', 'letter-spacing:0.03em', 'line-height:1.5'
    ].join(';');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Global error handlers ─────────────────────────────────────────────────
  window.addEventListener('error', function (event) {
    const entry = buildLogEntry(event.message, event.filename, event.lineno, event.colno, event.error);
    appendErrorLog(entry);
    if (IS_DEV) {
      console.error('[MineError] Unhandled error:', entry.msg, '\nState:', entry.state, '\nStack:', entry.stack);
    }
    showErrorOverlay(entry);
  });

  window.addEventListener('unhandledrejection', function (event) {
    const reason = event.reason || {};
    const entry = buildLogEntry(
      (reason.message || String(reason)).slice(0, 500),
      '', 0, 0,
      reason instanceof Error ? reason : null
    );
    appendErrorLog(entry);
    if (IS_DEV) {
      console.error('[MineError] Unhandled rejection:', entry.msg, '\nState:', entry.state);
    }
    showErrorOverlay(entry);
  });

  // ── WebGL context loss ────────────────────────────────────────────────────
  // The canvas doesn't exist yet at script load time, so we listen on the
  // document and delegate to the canvas once it's created.
  document.addEventListener('webglcontextlost', function (event) {
    event.preventDefault(); // Allow context restoration attempt
    const entry = buildLogEntry('WebGL context lost', '', 0, 0, null);
    appendErrorLog(entry);
    if (IS_DEV) console.warn('[MineError] WebGL context lost. Attempting restore...');
    showWebGLRecoveryUI();
  }, true);

  document.addEventListener('webglcontextrestored', function () {
    if (IS_DEV) console.info('[MineError] WebGL context restored.');
    const overlay = document.getElementById('minetris-webgl-overlay');
    if (overlay) overlay.remove();
    // Flag recovery for the game loop to re-initialise renderer state.
    window._minetrisWebGLRestored = true;
  }, true);

  function showWebGLRecoveryUI() {
    if (document.getElementById('minetris-webgl-overlay')) return;
    try { document.exitPointerLock(); } catch (_) {}

    const overlay = document.createElement('div');
    overlay.id = 'minetris-webgl-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:999998',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.85)',
      'font-family:"Press Start 2P",monospace,sans-serif',
      'color:#fff', 'text-align:center', 'padding:1rem', 'box-sizing:border-box'
    ].join(';');
    overlay.innerHTML =
      '<div>' +
        '<div style="font-size:2rem;margin-bottom:1rem;">&#128165;</div>' +
        '<p style="font-size:clamp(0.5rem,2vw,0.7rem);color:#fbbf24;margin-bottom:0.5rem;">GPU CONTEXT LOST</p>' +
        '<p style="font-size:clamp(0.35rem,1.5vw,0.48rem);color:#9ca3af;line-height:1.8;margin-bottom:1.5rem;">' +
          'The graphics context was lost.<br>Attempting to restore...' +
        '</p>' +
        '<button onclick="location.reload()" style="' + btnStyle('#3b82f6','#1d4ed8') + '">Reload</button>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  // ── Dev mode: expose error log ────────────────────────────────────────────
  if (IS_DEV) {
    window._minetrisErrorLog = {
      get:   readErrorLog,
      clear: function () { writeErrorLog([]); },
    };
    console.info('[MineError] Error reporter active (dev mode). window._minetrisErrorLog available.');
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.MineErrorReporter = {
    /** Manually log an error from game code. */
    log: function (message, error) {
      const entry = buildLogEntry(message, '', 0, 0, error || null);
      appendErrorLog(entry);
      if (IS_DEV) console.warn('[MineError] Manual log:', message, entry.state);
    },
    /** Show the error overlay programmatically. */
    showOverlay: function (message) {
      const entry = buildLogEntry(message || 'Unexpected error', '', 0, 0, null);
      showErrorOverlay(entry);
    },
    /** Read the stored error log. */
    getLog: readErrorLog,
  };
}());

// loader.js — Load orchestrator + stage-based progress tracking
// Exposes window.MineLoader with setStage() and complete() APIs.
// Controls the #loading-screen element.

(function () {
  // Stage definitions: name → target percentage
  var STAGES = {
    dom_ready:    20,
    scripts:      40,
    assets:       60,
    audio:        80,
    game_ready:  100,
  };

  var MIN_DISPLAY_MS = 500;
  var startTime = Date.now();

  // Track the current display percentage (never decreases)
  var currentPct = 0;
  var completed = false;
  var pendingHide = false;

  function setBar(pct) {
    pct = Math.max(currentPct, Math.min(100, pct));
    currentPct = pct;
    var bar = document.getElementById('loading-bar');
    var pctEl = document.getElementById('loading-pct');
    if (bar) bar.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
  }

  function doHide() {
    if (completed) return;
    completed = true;

    // Stop tip / block animation intervals started by inline script
    if (window.__minetrisTipInterval) {
      clearInterval(window.__minetrisTipInterval);
      delete window.__minetrisTipInterval;
    }
    if (window.__minetrisBlockInterval) {
      clearInterval(window.__minetrisBlockInterval);
      delete window.__minetrisBlockInterval;
    }
    if (window.__minetrisLoadingObserver) {
      window.__minetrisLoadingObserver.disconnect();
      delete window.__minetrisLoadingObserver;
    }

    setBar(100);

    var ls = document.getElementById('loading-screen');
    if (ls) {
      ls.style.transition = 'opacity 0.3s ease';
      ls.style.opacity = '0';
      setTimeout(function () {
        if (ls.parentNode) ls.parentNode.removeChild(ls);
      }, 320);
    }
  }

  // Public API
  window.MineLoader = {
    /**
     * Signal a named load stage. Automatically advances the progress bar
     * to the stage's target percentage.
     * @param {string} stage  One of: dom_ready, scripts, assets, audio, game_ready
     */
    setStage: function (stage) {
      var pct = STAGES[stage];
      if (pct === undefined) return;
      setBar(pct);
    },

    /**
     * Set an arbitrary percentage (0–100). Useful for fine-grained updates
     * within a stage.
     */
    setProgress: function (pct) {
      setBar(pct);
    },

    /**
     * Signal that the game is fully ready and hide the loading screen.
     * Respects the minimum display time (500 ms).
     */
    complete: function () {
      setBar(100);
      var elapsed = Date.now() - startTime;
      var delay = Math.max(0, MIN_DISPLAY_MS - elapsed);
      setTimeout(doHide, delay);
    },
  };

  // Automatically signal dom_ready as soon as the DOM is interactive
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.MineLoader.setStage('dom_ready');
    });
  } else {
    // DOM already ready (script loaded late)
    window.MineLoader.setStage('dom_ready');
  }
})();

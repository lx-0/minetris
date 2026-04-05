// Window resize and responsive HUD helpers.

let _resizeTimer = null;
function onWindowResize() {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    const { canvasWidth: w, canvasHeight: h } = getTouchAdjustedSize();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
    resizePostProcessing(w, h);
    if (typeof coopAvatar !== 'undefined') coopAvatar.onResize();
    if (typeof _lcResizeParticleCanvas === 'function') _lcResizeParticleCanvas();
    applyResponsiveHUD(w);
  }, 100);
}

function applyResponsiveHUD(width) {
  const root = document.documentElement;
  // Remove previous responsive classes
  document.body.classList.remove("vp-small", "vp-xs");
  if (width < 480) {
    document.body.classList.add("vp-small", "vp-xs");
  } else if (width < 600) {
    document.body.classList.add("vp-small");
  }
  // Scale HUD font sizes proportionally below 600px
  if (width < 600) {
    const scale = Math.max(0.55, width / 600);
    root.style.setProperty("--hud-scale", scale.toFixed(3));
  } else {
    root.style.setProperty("--hud-scale", "1");
  }
}

// ── Touch-control zone accounting ────────────────────────────────────────────
// Returns { canvasWidth, canvasHeight } accounting for touch control zones
// so the Three.js renderer fills only the available play area.
function getTouchAdjustedSize() {
  const isTouch = window.matchMedia('(hover: none)').matches;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!isTouch) return { canvasWidth: w, canvasHeight: h };

  const isLandscape = w > h;
  const isNarrow = w <= 1024;

  if (isLandscape && isNarrow) {
    // Landscape mobile: 160px dpad + 160px actions reserved on sides
    const SIDE_ZONE = 160;
    return { canvasWidth: Math.max(w - SIDE_ZONE * 2, w * 0.5), canvasHeight: h };
  }
  if (!isLandscape && w <= 768) {
    // Portrait mobile: bottom 40% of viewport reserved for controls
    return { canvasWidth: w, canvasHeight: Math.round(h * 0.60) };
  }
  return { canvasWidth: w, canvasHeight: h };
}

// ── Orientation suggestion overlay ───────────────────────────────────────────
(function initOrientationSuggest() {
  const STORAGE_KEY = 'minetris_orient_dismissed';
  const overlay = document.getElementById('orientation-suggest');
  const dismissBtn = document.getElementById('orientation-suggest-dismiss');
  if (!overlay || !dismissBtn) return;

  function shouldShow() {
    if (localStorage.getItem(STORAGE_KEY)) return false;
    const isTouch = window.matchMedia('(hover: none)').matches;
    const isPortrait = window.innerHeight > window.innerWidth;
    const isNarrow = window.innerWidth < 768;
    return isTouch && isPortrait && isNarrow;
  }

  function updateVisibility() {
    if (shouldShow()) {
      overlay.classList.add('os-visible');
    } else {
      overlay.classList.remove('os-visible');
    }
  }

  dismissBtn.addEventListener('click', function () {
    localStorage.setItem(STORAGE_KEY, '1');
    overlay.classList.remove('os-visible');
  });

  window.addEventListener('resize', updateVisibility);
  window.addEventListener('orientationchange', function () {
    setTimeout(updateVisibility, 300);
  });
  updateVisibility();
})();

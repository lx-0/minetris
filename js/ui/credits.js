// Credits screen — scrolling credits overlay with version history and easter egg.
// Requires: config.js (GAME_VERSION)

(function () {
  'use strict';

  const VERSION_HISTORY = [
    { version: 'v6.8', title: 'Cooperative Mode & Haptic Feedback',   features: ['Cooperative highlight zones', 'Garbage injection mechanics', 'Vibration patterns for mobile', 'Gamepad rumble support'] },
    { version: 'v6.7', title: 'Board Skins & Input Lag Compensation',  features: ['Unlockable visual board styles', 'Netcode prediction & reconciliation', 'Client-side interpolation', 'Input lag measurement tool'] },
    { version: 'v6.6', title: 'Puzzle Mode & Particle Effects',        features: ['50 puzzles across 5 tiers', 'Line-clear particle bursts', 'T-Spin and combo effects', 'Level-up celebrations'] },
    { version: 'v6.5', title: 'Analytics Dashboard & Tournaments',     features: ['Player engagement metrics', 'Session tracking', 'Scheduled bracket tournaments', 'Prize distribution'] },
    { version: 'v6.4', title: 'Training Mode & XP Leveling',           features: ['Configurable board states', 'Scenario practice', 'XP earn from gameplay', 'Level-up rewards'] },
    { version: 'v6.3', title: 'Marathon Mode & Battle Royale',         features: ['Infinite progression with milestones', '4–10 player free-for-all', 'Elimination system', 'Shrinking board'] },
    { version: 'v6.2', title: 'Leaderboard & Piece Preview',           features: ['Infinite scroll leaderboard', 'Country flags', 'Piece preview customization', 'Match history screen'] },
    { version: 'v6.0', title: 'Theme Customization & Localization',    features: ['Dark mode & color schemes', 'Background selection', 'German language support', 'Full i18n pipeline'] },
    { version: 'v5.9', title: 'Seasonal Events & Anti-Cheat',          features: ['Themed skins & events', 'Score obfuscation', 'Duration & rate-limit checks', 'Rejection logging'] },
    { version: 'v5.8', title: 'Friend List & Custom Rooms',            features: ['Friends system', 'Custom game rooms', 'Private lobbies', 'Invite links'] },
  ];

  const OPEN_SOURCE_LIBS = [
    { name: 'Three.js',  version: 'r128', license: 'MIT',     url: 'https://threejs.org' },
    { name: 'Tone.js',   version: '14.8', license: 'MIT',     url: 'https://tonejs.github.io' },
    { name: 'Howler.js', version: '2.2',  license: 'MIT',     url: 'https://howlerjs.com' },
  ];

  // Konami sequence: ↑↑↓↓←→←→BA
  const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let konamiIdx = 0;
  let scrollRAF = null;
  let scrollPaused = false;
  let scrollY = 0;

  function buildCreditsHTML() {
    const ver = typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '?';
    let html = `
      <div class="credits-section">
        <div class="credits-game-title">MINETRIS</div>
        <div class="credits-subtitle">Mine. Build. Survive the fall.</div>
        <div class="credits-version">Version ${ver}</div>
      </div>

      <div class="credits-section">
        <div class="credits-heading">DEVELOPMENT TEAM</div>
        <div class="credits-entry credits-entry-lead">Lead Developer</div>
        <div class="credits-entry">MineCtris Team</div>
        <div class="credits-entry credits-entry-lead">Game Design</div>
        <div class="credits-entry">MineCtris Team</div>
        <div class="credits-entry credits-entry-lead">Art &amp; Sound</div>
        <div class="credits-entry">MineCtris Team</div>
      </div>

      <div class="credits-section">
        <div class="credits-heading">SPECIAL THANKS</div>
        <div class="credits-entry">Our playtesters &amp; early adopters</div>
        <div class="credits-entry">The open-source community</div>
        <div class="credits-entry">Everyone who submitted feedback</div>
      </div>

      <div class="credits-section">
        <div class="credits-heading">OPEN SOURCE LIBRARIES</div>`;

    for (const lib of OPEN_SOURCE_LIBS) {
      html += `
        <div class="credits-lib-row">
          <span class="credits-lib-name">${lib.name} ${lib.version}</span>
          <span class="credits-lib-license">${lib.license}</span>
        </div>`;
    }

    html += `</div>

      <div class="credits-section">
        <div class="credits-heading">VERSION HISTORY</div>`;

    for (const entry of VERSION_HISTORY) {
      html += `
        <details class="credits-version-entry">
          <summary class="credits-version-summary">
            <span class="credits-ver-tag">${entry.version}</span>
            <span class="credits-ver-title">${entry.title}</span>
          </summary>
          <ul class="credits-ver-features">`;
      for (const f of entry.features) {
        html += `<li>${f}</li>`;
      }
      html += `</ul></details>`;
    }

    html += `</div>

      <div class="credits-section">
        <div class="credits-heading">LICENSE</div>
        <div class="credits-entry">Copyright &copy; 2024–2026 MineCtris Team.</div>
        <div class="credits-entry">All rights reserved.</div>
        <div class="credits-entry credits-entry-small">Open source libraries retain their respective licenses.</div>
      </div>

      <div class="credits-section credits-section-footer">
        <div class="credits-entry credits-entry-small">&#128075; Thanks for playing!</div>
        <div class="credits-entry credits-entry-small credits-hint">Click / tap to pause scroll &nbsp;|&nbsp; Scroll to navigate</div>
      </div>`;

    return html;
  }

  function startScroll() {
    if (scrollRAF) cancelAnimationFrame(scrollRAF);
    const inner = document.getElementById('credits-inner');
    if (!inner) return;

    let last = null;
    function step(ts) {
      if (last === null) last = ts;
      const dt = ts - last;
      last = ts;
      if (!scrollPaused) {
        scrollY += dt * 0.025; // ~25px/s
        const maxScroll = inner.scrollHeight - inner.clientHeight;
        if (scrollY >= maxScroll + 80) scrollY = -inner.clientHeight * 0.1;
        inner.scrollTop = scrollY;
      }
      scrollRAF = requestAnimationFrame(step);
    }
    scrollRAF = requestAnimationFrame(step);
  }

  function stopScroll() {
    if (scrollRAF) { cancelAnimationFrame(scrollRAF); scrollRAF = null; }
  }

  let _creditsOpener = null;

  function openCredits() {
    _creditsOpener = document.activeElement || null;
    const overlay = document.getElementById('credits-overlay');
    if (!overlay) return;
    const inner = document.getElementById('credits-inner');
    scrollY = 0;
    scrollPaused = false;
    if (inner) { inner.scrollTop = 0; inner.innerHTML = buildCreditsHTML(); }
    overlay.style.display = 'flex';
    konamiIdx = 0;
    startScroll();
    if (typeof trapFocus === 'function') trapFocus(overlay, closeCredits);
  }

  function closeCredits() {
    if (typeof releaseFocusTrap === 'function') releaseFocusTrap();
    const overlay = document.getElementById('credits-overlay');
    if (overlay) overlay.style.display = 'none';
    stopScroll();
    scrollPaused = false;
    konamiIdx = 0;
    if (_creditsOpener && typeof _creditsOpener.focus === 'function') {
      try { _creditsOpener.focus(); } catch (_) {}
      _creditsOpener = null;
    }
  }

  function triggerEasterEgg() {
    const overlay = document.getElementById('credits-overlay');
    if (!overlay) return;
    overlay.classList.add('credits-konami');
    setTimeout(() => overlay.classList.remove('credits-konami'), 3000);
    scrollPaused = true;
    // Resume scroll after animation
    setTimeout(() => { scrollPaused = false; }, 3200);
  }

  function onKonamiKey(e) {
    if (e.key === KONAMI[konamiIdx]) {
      konamiIdx++;
      if (konamiIdx === KONAMI.length) {
        konamiIdx = 0;
        triggerEasterEgg();
      }
    } else {
      konamiIdx = e.key === KONAMI[0] ? 1 : 0;
    }
  }

  function initCredits() {
    const btn = document.getElementById('start-credits-btn');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openCredits();
      });
    }

    const closeBtn = document.getElementById('credits-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeCredits);

    const overlay = document.getElementById('credits-overlay');
    if (overlay) {
      // Click/tap on overlay background closes; on inner area, toggle pause
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) { closeCredits(); return; }
        scrollPaused = !scrollPaused;
      });
    }

    const inner = document.getElementById('credits-inner');
    if (inner) {
      // Manual scroll syncs position and pauses auto-scroll momentarily
      inner.addEventListener('scroll', function () {
        scrollY = inner.scrollTop;
        scrollPaused = true;
        clearTimeout(inner._resumeTimer);
        inner._resumeTimer = setTimeout(() => { scrollPaused = false; }, 2000);
      });
    }

    document.addEventListener('keydown', function (e) {
      const overlay = document.getElementById('credits-overlay');
      if (!overlay || overlay.style.display === 'none') return;
      if (e.key === 'Escape') { closeCredits(); return; }
      onKonamiKey(e);
    });
  }

  window.initCredits = initCredits;
  window.openCredits = openCredits;
  window.closeCredits = closeCredits;
})();

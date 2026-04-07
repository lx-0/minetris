// js/ui/multiplayer-hud.js — Multiplayer ping display and connection quality indicator.
// Shows current latency (ms) and a color-coded dot in the top-center HUD during
// battle and co-op sessions.  Called by netcode.js pingDisplayCb every 2 s.

(function () {
  'use strict';

  var _hudEl   = null;
  var _dotEl   = null;
  var _labelEl = null;

  function _ensureRefs() {
    if (_hudEl) return true;
    _hudEl   = document.getElementById('multiplayer-ping-hud');
    _dotEl   = document.getElementById('mp-ping-dot');
    _labelEl = document.getElementById('mp-ping-label');
    return !!_hudEl;
  }

  /**
   * Update the ping HUD.
   * @param {number|null} ms       Latency in milliseconds, or null to hide the HUD.
   * @param {string|null} quality  'good' | 'fair' | 'poor' | null
   */
  window.updateMultiplayerPingHUD = function updateMultiplayerPingHUD(ms, quality) {
    if (!_ensureRefs()) return;

    if (ms === null || quality === null) {
      _hudEl.style.display = 'none';
      return;
    }

    _hudEl.style.display = 'flex';

    // Connection quality dot: green / yellow / red
    var dotColor;
    if (quality === 'good')      dotColor = '#4ade80'; // green  < 50 ms
    else if (quality === 'fair') dotColor = '#facc15'; // yellow 50-150 ms
    else                         dotColor = '#f87171'; // red    > 150 ms
    if (_dotEl)   _dotEl.style.background = dotColor;
    if (_labelEl) _labelEl.textContent    = ms + ' ms';
  };
})();

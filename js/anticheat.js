// Anti-cheat client utilities — score obfuscation, board state hashing, session tokens.
// Must be loaded after state.js (uses gridOccupancy).

// ── Score shadow (XOR obfuscation) ────────────────────────────────────────────
// Maintains a parallel XOR-masked copy of the score variable alongside the real one.
// Not a cryptographic measure — just makes casual devtools editing less obvious
// by hiding the real score value in memory.

var _AC_MASK = (function () {
  try {
    var d = new Date();
    return (((d.getUTCFullYear() * 0x1f + d.getUTCMonth() * 0x7d + d.getUTCDate() * 0x3) ^ 0x4d3c2b1a) >>> 0);
  } catch (_) { return 0x4d3c2b1a; }
})();

var _acShadowScore = _AC_MASK; // 0 ^ _AC_MASK

/** Sync the shadow to a known value. Call on game reset. */
function acSetScore(val) {
  _acShadowScore = (((val | 0) ^ _AC_MASK) >>> 0);
}

/** Add pts to the shadow. Call from addScore after updating the real score. */
function acAddScore(pts) {
  _acShadowScore = (((_acShadowScore ^ _AC_MASK) + (pts | 0)) ^ _AC_MASK) >>> 0;
}

/** Read back the real score from the shadow. */
function acGetScore() {
  return (_acShadowScore ^ _AC_MASK) >>> 0;
}

// ── Board state hash ───────────────────────────────────────────────────────────
// SHA-256 of the grid occupancy at game-over time.
// Included in the score submission payload so the server can detect
// if the same board state is submitted under multiple scores.

async function acBoardStateHash() {
  try {
    var cells = [];
    if (typeof gridOccupancy !== 'undefined') {
      var ys = Array.from(gridOccupancy.keys()).sort(function (a, b) { return a - b; });
      for (var i = 0; i < ys.length; i++) {
        var row = Array.from(gridOccupancy.get(ys[i])).sort();
        cells.push(ys[i] + ':' + row.join(';'));
      }
    }
    var data = cells.join('|');
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  } catch (_) {
    return null;
  }
}

// ── Session token ──────────────────────────────────────────────────────────────
// One-time random token generated at page load.
// Included in score submissions to help detect cross-session replay attacks
// (submitting a previously captured valid request body again later).

var _AC_SESSION_TOKEN = (function () {
  try {
    var arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  } catch (_) {
    return ((Math.random() * 0xffffffff) >>> 0).toString(16).padStart(8, '0') +
           ((Math.random() * 0xffffffff) >>> 0).toString(16).padStart(8, '0');
  }
})();

function acGetSessionToken() { return _AC_SESSION_TOKEN; }

// ── Submission timestamp guard ─────────────────────────────────────────────────
// Track the last successful submit time client-side for UX feedback
// (does not replace server-side rate limiting).

var _acLastSubmitMs = 0;
var AC_MIN_SUBMIT_INTERVAL_MS = 30 * 1000; // 30 seconds

function acCanSubmit() {
  return Date.now() - _acLastSubmitMs >= AC_MIN_SUBMIT_INTERVAL_MS;
}

function acMarkSubmitted() {
  _acLastSubmitMs = Date.now();
}

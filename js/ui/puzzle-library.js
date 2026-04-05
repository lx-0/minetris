// puzzle-library.js
// Persistent library of user-created custom puzzles stored in localStorage.
// Requires: puzzle-codec.js (for encoding/decoding share codes)

var PUZZLE_LIBRARY_KEY    = "mineCtris_customPuzzles";
var PUZZLE_LIBRARY_MAX    = 50;

// ── Internal helpers ─────────────────────────────────────────────────────────

function _puzzleLibraryRead() {
  try {
    var raw = localStorage.getItem(PUZZLE_LIBRARY_KEY);
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function _puzzleLibraryWrite(arr) {
  try {
    localStorage.setItem(PUZZLE_LIBRARY_KEY, JSON.stringify(arr));
    return true;
  } catch (_) {
    return false;
  }
}

function _puzzleLibraryNewId() {
  return "cpz_" + Date.now() + "_" + Math.floor(Math.random() * 0xffff).toString(16);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return all saved puzzles, newest first.
 * @returns {Array<object>}
 */
function puzzleLibraryGetAll() {
  var arr = _puzzleLibraryRead();
  return arr.slice().sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
}

/**
 * Return a single saved puzzle by id, or null.
 * @param {string} id
 * @returns {object|null}
 */
function puzzleLibraryGet(id) {
  var arr = _puzzleLibraryRead();
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].id === id) return arr[i];
  }
  return null;
}

/**
 * Save a new puzzle to the library.
 *
 * @param {object} payload
 *   { blocks, winCondition, metadata, pieceSequence, shareCode }
 * @returns {{ ok: true, id: string } | { ok: false, error: string }}
 */
function puzzleLibrarySave(payload) {
  var arr = _puzzleLibraryRead();
  if (arr.length >= PUZZLE_LIBRARY_MAX) {
    return { ok: false, error: "Library full (" + PUZZLE_LIBRARY_MAX + " puzzles max). Delete one to save." };
  }
  if (!payload || !payload.metadata || !payload.metadata.name || !String(payload.metadata.name).trim()) {
    return { ok: false, error: "Puzzle must have a name." };
  }
  var id = _puzzleLibraryNewId();
  var entry = {
    id:            id,
    blocks:        payload.blocks        || [],
    winCondition:  payload.winCondition  || { mode: "mine_all", n: 10 },
    metadata:      payload.metadata      || { name: "", description: "", author: "", difficulty: 0 },
    pieceSequence: payload.pieceSequence || { mode: "random", pieces: [] },
    shareCode:     payload.shareCode     || null,
    savedAt:       Date.now(),
  };
  arr.push(entry);
  if (!_puzzleLibraryWrite(arr)) {
    return { ok: false, error: "Could not write to localStorage." };
  }
  return { ok: true, id: id };
}

/**
 * Update an existing puzzle by id.
 *
 * @param {string} id
 * @param {object} payload  same shape as save payload
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function puzzleLibraryUpdate(id, payload) {
  var arr = _puzzleLibraryRead();
  var idx = -1;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].id === id) { idx = i; break; }
  }
  if (idx === -1) return { ok: false, error: "Puzzle not found." };
  arr[idx] = Object.assign({}, arr[idx], {
    blocks:        payload.blocks        !== undefined ? payload.blocks        : arr[idx].blocks,
    winCondition:  payload.winCondition  !== undefined ? payload.winCondition  : arr[idx].winCondition,
    metadata:      payload.metadata      !== undefined ? payload.metadata      : arr[idx].metadata,
    pieceSequence: payload.pieceSequence !== undefined ? payload.pieceSequence : arr[idx].pieceSequence,
    shareCode:     payload.shareCode     !== undefined ? payload.shareCode     : arr[idx].shareCode,
    savedAt:       Date.now(),
  });
  if (!_puzzleLibraryWrite(arr)) {
    return { ok: false, error: "Could not write to localStorage." };
  }
  return { ok: true };
}

/**
 * Delete a puzzle by id.
 * @param {string} id
 * @returns {boolean}
 */
function puzzleLibraryDelete(id) {
  var arr = _puzzleLibraryRead();
  var filtered = arr.filter(function (p) { return p.id !== id; });
  if (filtered.length === arr.length) return false;
  return _puzzleLibraryWrite(filtered);
}

/**
 * Return the count of saved puzzles.
 * @returns {number}
 */
function puzzleLibraryCount() {
  return _puzzleLibraryRead().length;
}

/**
 * Import a puzzle from a share code and add it to the library.
 * @param {string} code  URL-safe share code
 * @returns {{ ok: true, id: string } | { ok: false, error: string, versionMismatch?: boolean }}
 */
function puzzleLibraryImport(code) {
  if (typeof puzzleCodecDecode !== "function") {
    return { ok: false, error: "Codec unavailable." };
  }
  var result = puzzleCodecDecode(code);
  if (!result.ok) {
    return { ok: false, error: result.error, versionMismatch: result.versionMismatch };
  }
  var saveResult = puzzleLibrarySave({
    blocks:        result.blocks,
    winCondition:  result.winCondition,
    metadata:      result.metadata,
    pieceSequence: result.pieceSequence || { mode: "random", pieces: [] },
    shareCode:     code,
  });
  return saveResult;
}

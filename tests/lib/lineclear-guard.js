// Co-op line-clear guard logic — extracted from js/core/lineclear.js.
// Prevents double-processing when both co-op clients detect the same cleared rows.

const COOP_LC_TTL = 3000; // ms — entries expire after 3 s

/**
 * Returns a fresh guard instance. Each instance owns its own Map so tests
 * can run in isolation without shared mutable state.
 */
export function createLineClearGuard() {
  const _guard = new Map();

  function _key(rows) {
    return rows.slice().sort((a, b) => a - b).join(',');
  }

  function has(rows, nowMs = Date.now()) {
    const k = _key(rows);
    const ts = _guard.get(k);
    if (ts === undefined) return false;
    if (nowMs - ts > COOP_LC_TTL) { _guard.delete(k); return false; }
    return true;
  }

  function add(rows, nowMs = Date.now()) {
    _guard.set(_key(rows), nowMs);
  }

  return { has, add, _guard };
}

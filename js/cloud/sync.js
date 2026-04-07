/**
 * MineCtris Cloud Sync
 *
 * Provides cross-device save sync via the Cloudflare Worker /api/sync/* endpoints.
 * All player data lives in localStorage under mineCtris_* keys. This module
 * serialises that data (using the same base64-encoded JSON format as manual export)
 * and stores it keyed by an anonymous player UUID.
 *
 * Public API (called from settings.js):
 *   initCloudSync()              — generate player ID on first visit, expose sync state
 *   getCloudPlayerId()           — returns the UUID (creates on first call)
 *   getCloudSyncCode()           — returns (or creates) the 6-char shareable code
 *   cloudSave()                  — push local data to cloud (Promise)
 *   cloudLoad()                  — pull cloud data to local and reload (Promise)
 *   cloudLoadFromCode(code)      — pull cloud data using a foreign sync code (Promise)
 *   cloudDeleteData()            — delete this player's cloud data (Promise)
 *   onAutoSync()                 — call after meaningful state changes; debounced
 *
 * Depends on: leaderboard.js (LEADERBOARD_WORKER_URL), settings.js (_collectProgressData, _buildExportPayload, _parseImportString, _applyImport)
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const CLOUD_PLAYER_ID_KEY  = 'mineCtris_playerId';
const CLOUD_SYNC_CODE_KEY  = 'mineCtris_syncCode';
const CLOUD_LAST_SYNC_KEY  = 'mineCtris_lastCloudSync';
const CLOUD_LAST_SAVED_AT_KEY = 'mineCtris_cloudSavedAt'; // ISO timestamp stored with last cloud push

const AUTO_SYNC_DEBOUNCE_MS = 5000; // 5 s cooldown between auto-syncs
const AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLOUD_AUTO_SYNC_KEY   = 'mineCtris_cloudAutoSync';

let _autoSyncTimer = null;
let _syncInProgress = false;

// ── Encryption (AES-GCM, key derived from player UUID via PBKDF2) ─────────────

const _ENC_SALT = new TextEncoder().encode('minectris-cloud-sync-v1');

async function _deriveKey(playerId) {
  const raw = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(playerId), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: _ENC_SALT, iterations: 100000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}

/** Encrypt a plaintext string with the player's derived key. Returns opaque base64. */
async function _encryptPayload(plaintext, playerId) {
  try {
    const key = await _deriveKey(playerId);
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const ct  = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)
    );
    return btoa(JSON.stringify({
      v:  1,
      iv: btoa(String.fromCharCode.apply(null, iv)),
      ct: btoa(String.fromCharCode.apply(null, new Uint8Array(ct)))
    }));
  } catch (_) {
    return plaintext; // fallback: upload unencrypted if Web Crypto unavailable
  }
}

/**
 * Decrypt a payload encrypted by _encryptPayload.
 * Falls back to returning the raw string on any error (handles legacy unencrypted saves).
 */
async function _decryptPayload(data, playerId) {
  try {
    const obj = JSON.parse(atob(data));
    if (!obj.v || !obj.iv || !obj.ct) return data; // not encrypted format
    const key = await _deriveKey(playerId);
    const iv  = Uint8Array.from(atob(obj.iv), function(c) { return c.charCodeAt(0); });
    const ct  = Uint8Array.from(atob(obj.ct), function(c) { return c.charCodeAt(0); });
    const pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch (_) {
    return data; // legacy unencrypted fallback
  }
}

// ── Auto-sync preference ──────────────────────────────────────────────────────

function isAutoSyncEnabled() {
  try { return localStorage.getItem(CLOUD_AUTO_SYNC_KEY) === 'true'; } catch (_) { return false; }
}

function setAutoSyncEnabled(enabled) {
  try { localStorage.setItem(CLOUD_AUTO_SYNC_KEY, enabled ? 'true' : 'false'); } catch (_) {}
}

// ── Player ID ─────────────────────────────────────────────────────────────────

/** Returns the anonymous player UUID, creating and persisting it on first call. */
function getCloudPlayerId() {
  let id;
  try { id = localStorage.getItem(CLOUD_PLAYER_ID_KEY); } catch (_) {}
  if (id) return id;
  id = _uuidv4();
  try { localStorage.setItem(CLOUD_PLAYER_ID_KEY, id); } catch (_) {}
  return id;
}

function _uuidv4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Sync Code ────────────────────────────────────────────────────────────────

/** Returns cached local sync code, or null if not yet fetched. */
function _getCachedSyncCode() {
  try { return localStorage.getItem(CLOUD_SYNC_CODE_KEY) || null; } catch (_) { return null; }
}

/**
 * Returns the 6-char sync code for this device (creates one via the Worker if needed).
 * Resolves to the code string, or null on error.
 */
async function getCloudSyncCode() {
  const cached = _getCachedSyncCode();
  if (cached) return cached;
  const playerId = getCloudPlayerId();
  try {
    const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/sync/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    if (json.syncCode) {
      try { localStorage.setItem(CLOUD_SYNC_CODE_KEY, json.syncCode); } catch (_) {}
      return json.syncCode;
    }
  } catch (_) {}
  return null;
}

// ── Cloud Save / Load ─────────────────────────────────────────────────────────

/**
 * Push local save data to cloud.
 * Returns { ok: true, savedAt } or { ok: false, error }.
 */
async function cloudSave() {
  if (_syncInProgress) return { ok: false, error: 'Sync already in progress' };
  _syncInProgress = true;
  try {
    const playerId  = getCloudPlayerId();
    const encoded   = _buildExportPayload(); // from settings.js
    const encrypted = await _encryptPayload(encoded, playerId);
    const savedAt   = new Date().toISOString();

    const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/sync/' + encodeURIComponent(playerId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: encrypted, savedAt }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { ok: false, error: err.error || 'Upload failed' };
    }
    // Make sure a sync code is available.
    await getCloudSyncCode();
    try {
      localStorage.setItem(CLOUD_LAST_SYNC_KEY, savedAt);
      localStorage.setItem(CLOUD_LAST_SAVED_AT_KEY, savedAt);
    } catch (_) {}
    return { ok: true, savedAt };
  } catch (e) {
    return { ok: false, error: e.message || 'Network error' };
  } finally {
    _syncInProgress = false;
  }
}

/**
 * Pull cloud data for this player and apply it locally (triggers page reload).
 * Returns { ok: true } or { ok: false, error }.
 */
async function cloudLoad() {
  return _cloudLoadForPlayer(getCloudPlayerId());
}

/**
 * Pull cloud data using a foreign 6-char sync code, then apply (triggers reload).
 * On success, adopts the foreign player ID so future saves go to the same slot.
 */
async function cloudLoadFromCode(code) {
  const code2 = (code || '').trim().toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z0-9]{6}$/.test(code2)) return { ok: false, error: 'Invalid sync code' };
  try {
    const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/sync/code/' + code2);
    if (!resp.ok) return { ok: false, error: 'Could not look up sync code' };
    const json = await resp.json();
    if (!json.found || !json.playerId) return { ok: false, error: 'Sync code not found' };
    const remotePlayerId = json.playerId;
    const result = await _cloudLoadForPlayer(remotePlayerId);
    if (result.ok) {
      // Adopt foreign identity so this device syncs to the same slot going forward.
      try {
        localStorage.setItem(CLOUD_PLAYER_ID_KEY, remotePlayerId);
        localStorage.setItem(CLOUD_SYNC_CODE_KEY, code2);
      } catch (_) {}
    }
    return result;
  } catch (e) {
    return { ok: false, error: e.message || 'Network error' };
  }
}

async function _cloudLoadForPlayer(playerId) {
  if (_syncInProgress) return { ok: false, error: 'Sync already in progress' };
  _syncInProgress = true;
  try {
    const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/sync/' + encodeURIComponent(playerId));
    if (!resp.ok) return { ok: false, error: 'Download failed' };
    const json = await resp.json();
    if (!json.found) return { ok: false, error: 'No cloud save found' };
    // Conflict check: warn if local data is newer.
    const cloudTs = json.savedAt ? new Date(json.savedAt).getTime() : 0;
    const localTs = _getLocalSavedAt();
    if (localTs > cloudTs && cloudTs > 0) {
      return { ok: false, error: 'conflict', cloudSavedAt: json.savedAt, localSavedAt: new Date(localTs).toISOString() };
    }
    const decrypted = await _decryptPayload(json.data, playerId); // decrypt (or pass through legacy)
    const data = _parseImportString(decrypted); // from settings.js
    _pendingCloudImportData = data;
    return { ok: true, preview: _buildProgressPreview(data), savedAt: json.savedAt };
  } catch (e) {
    return { ok: false, error: e.message || 'Network error' };
  } finally {
    _syncInProgress = false;
  }
}

let _pendingCloudImportData = null;

/** Apply the pending cloud import and reload the page. */
function applyCloudImport() {
  if (!_pendingCloudImportData) return;
  const data = _pendingCloudImportData;
  _pendingCloudImportData = null;
  Object.keys(data).forEach(function(key) {
    if (key.startsWith('mineCtris_')) {
      try { localStorage.setItem(key, data[key]); } catch (_) {}
    }
  });
  window.location.reload();
}

/** Cancel pending cloud import. */
function cancelCloudImport() {
  _pendingCloudImportData = null;
}

function _getLocalSavedAt() {
  try {
    const ts = localStorage.getItem(CLOUD_LAST_SAVED_AT_KEY);
    return ts ? new Date(ts).getTime() : 0;
  } catch (_) { return 0; }
}

/**
 * Delete this player's cloud data.
 * Returns { ok: true } or { ok: false, error }.
 */
async function cloudDeleteData() {
  const playerId = getCloudPlayerId();
  const syncCode = _getCachedSyncCode();
  try {
    const body = syncCode ? { syncCode } : {};
    const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/sync/' + encodeURIComponent(playerId), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return { ok: false, error: 'Delete failed' };
    try {
      localStorage.removeItem(CLOUD_LAST_SYNC_KEY);
      localStorage.removeItem(CLOUD_LAST_SAVED_AT_KEY);
      // Do NOT remove playerId or syncCode — player keeps their identity.
    } catch (_) {}
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'Network error' };
  }
}

// ── Auto-sync ─────────────────────────────────────────────────────────────────

/**
 * Call this after meaningful state changes (game over, settings change, unlock).
 * Debounced so rapid changes don't spam the Worker. No-ops if auto-sync is disabled.
 */
function onAutoSync() {
  if (!isAutoSyncEnabled()) return;
  clearTimeout(_autoSyncTimer);
  _autoSyncTimer = setTimeout(function() {
    cloudSave().then(function(result) {
      if (result.ok) _notifyAutoSyncResult(true);
    }).catch(function() {});
  }, AUTO_SYNC_DEBOUNCE_MS);
}

function _notifyAutoSyncResult(ok) {
  const el = document.getElementById('cloud-sync-status');
  if (el) {
    el.textContent = ok ? 'Auto-saved to cloud' : 'Cloud save failed';
    el.style.color  = ok ? '#7f7' : '#f77';
    clearTimeout(el._timer);
    el._timer = setTimeout(function() { el.textContent = ''; }, 4000);
  }
  if (ok && typeof _updateLastSyncDisplay === 'function') _updateLastSyncDisplay();
}

// ── Init ──────────────────────────────────────────────────────────────────────

/** Call once during game init to ensure a player ID exists and start the 24h auto-sync check. */
function initCloudSync() {
  getCloudPlayerId(); // ensure generated

  // Periodic 24-hour auto-sync: check every hour and push if 24h have elapsed.
  setInterval(function() {
    if (!isAutoSyncEnabled()) return;
    try {
      const last = localStorage.getItem(CLOUD_LAST_SYNC_KEY);
      const elapsed = last ? Date.now() - new Date(last).getTime() : Infinity;
      if (elapsed >= AUTO_SYNC_INTERVAL_MS) {
        cloudSave().then(function(result) {
          if (result.ok) _notifyAutoSyncResult(true);
        }).catch(function() {});
      }
    } catch (_) {}
  }, 60 * 60 * 1000); // check every 60 minutes
}

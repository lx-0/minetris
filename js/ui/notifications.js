// Notification center — achievement unlocks, mission completions, guild @mentions,
// friend invites/online events, personal bests, community goal milestones.
// Requires: nothing (standalone). Integrates via notifPush() calls from other modules.

const NOTIF_STORAGE_KEY = 'mineCtris_notifications';
const NOTIF_SETTINGS_KEY = 'mineCtris_notifSettings';
const NOTIF_MAX = 50;
const NOTIF_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Notification types
const NOTIF_TYPES = {
  ACHIEVEMENT:      'achievement',
  MISSION:          'mission',
  GUILD_MENTION:    'guild_mention',
  FRIEND_ONLINE:    'friend_online',
  FRIEND_INVITE:    'friend_invite',
  PERSONAL_BEST:    'personal_best',
  COMMUNITY_GOAL:   'community_goal',
};

// Default settings — all types on
const NOTIF_DEFAULTS = {
  [NOTIF_TYPES.ACHIEVEMENT]:    true,
  [NOTIF_TYPES.MISSION]:        true,
  [NOTIF_TYPES.GUILD_MENTION]:  true,
  [NOTIF_TYPES.FRIEND_ONLINE]:  true,
  [NOTIF_TYPES.FRIEND_INVITE]:  true,
  [NOTIF_TYPES.PERSONAL_BEST]:  true,
  [NOTIF_TYPES.COMMUNITY_GOAL]: true,
};

let _notifSettings = Object.assign({}, NOTIF_DEFAULTS);
let _notifPanelOpen = false;

// ── Persistence ───────────────────────────────────────────────────────────────

function _notifLoadSettings() {
  try {
    const raw = localStorage.getItem(NOTIF_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      _notifSettings = Object.assign({}, NOTIF_DEFAULTS, parsed);
    }
  } catch (_) {}
}

function _notifSaveSettings() {
  try { localStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(_notifSettings)); } catch (_) {}
}

function _notifLoad() {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      const cutoff = Date.now() - NOTIF_EXPIRE_MS;
      return list.filter(function (n) { return n.ts > cutoff; });
    }
  } catch (_) {}
  return [];
}

function _notifSave(list) {
  try { localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(list)); } catch (_) {}
}

// ── Core push ─────────────────────────────────────────────────────────────────

/**
 * Push a notification into the center.
 * @param {string} type      One of NOTIF_TYPES values.
 * @param {string} icon      Emoji or short string.
 * @param {string} message   Main notification text.
 */
function notifPush(type, icon, message) {
  if (!_notifSettings[type]) return;

  const list = _notifLoad();
  const entry = {
    id:      Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    type:    type,
    icon:    icon,
    message: message,
    ts:      Date.now(),
    read:    false,
  };

  list.unshift(entry);
  if (list.length > NOTIF_MAX) list.length = NOTIF_MAX;
  _notifSave(list);

  _notifUpdateBadge();
  if (_notifPanelOpen) _notifRenderList();
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function _notifUnreadCount() {
  return _notifLoad().filter(function (n) { return !n.read; }).length;
}

function _notifUpdateBadge() {
  const badge = document.getElementById('notif-bell-badge');
  if (!badge) return;
  const count = _notifUnreadCount();
  badge.textContent = count > 9 ? '9+' : String(count);
  badge.style.display = count > 0 ? 'flex' : 'none';
}

// ── Panel open/close ──────────────────────────────────────────────────────────

function notifOpen() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  _notifPanelOpen = true;
  panel.style.display = 'flex';
  _notifRenderList();
  // Mark all as read
  const list = _notifLoad();
  list.forEach(function (n) { n.read = true; });
  _notifSave(list);
  _notifUpdateBadge();
}

function notifClose() {
  const panel = document.getElementById('notif-panel');
  if (panel) panel.style.display = 'none';
  _notifPanelOpen = false;
}

function notifToggle() {
  if (_notifPanelOpen) { notifClose(); } else { notifOpen(); }
}

// ── Panel rendering ───────────────────────────────────────────────────────────

function _notifFormatTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000)   return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _notifRenderList() {
  const listEl = document.getElementById('notif-list');
  if (!listEl) return;

  const list = _notifLoad();
  if (list.length === 0) {
    listEl.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
    return;
  }

  listEl.innerHTML = list.map(function (n) {
    return '<div class="notif-item" data-id="' + _esc(n.id) + '">'
      + '<div class="notif-item-icon">' + _esc(n.icon) + '</div>'
      + '<div class="notif-item-body">'
      + '<div class="notif-item-msg">' + _esc(n.message) + '</div>'
      + '<div class="notif-item-time">' + _esc(_notifFormatTime(n.ts)) + '</div>'
      + '</div>'
      + '<button class="notif-dismiss-btn" data-id="' + _esc(n.id) + '" title="Dismiss">&#10005;</button>'
      + '</div>';
  }).join('');

  // Dismiss buttons
  listEl.querySelectorAll('.notif-dismiss-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      _notifDismiss(btn.dataset.id);
    });
  });
}

function _notifDismiss(id) {
  const list = _notifLoad().filter(function (n) { return n.id !== id; });
  _notifSave(list);
  _notifUpdateBadge();
  if (_notifPanelOpen) _notifRenderList();
}

function _notifClearAll() {
  _notifSave([]);
  _notifUpdateBadge();
  if (_notifPanelOpen) _notifRenderList();
}

// ── Settings panel rendering ──────────────────────────────────────────────────

const _NOTIF_TYPE_LABELS = {
  [NOTIF_TYPES.ACHIEVEMENT]:    'Achievement unlocked',
  [NOTIF_TYPES.MISSION]:        'Mission completed',
  [NOTIF_TYPES.GUILD_MENTION]:  'Guild @mention',
  [NOTIF_TYPES.FRIEND_ONLINE]:  'Friend came online',
  [NOTIF_TYPES.FRIEND_INVITE]:  'Friend invite received',
  [NOTIF_TYPES.PERSONAL_BEST]:  'New personal best',
  [NOTIF_TYPES.COMMUNITY_GOAL]: 'Community goal milestone',
};

function _notifRenderSettings() {
  const container = document.getElementById('notif-settings-rows');
  if (!container) return;

  container.innerHTML = Object.keys(NOTIF_TYPES).map(function (key) {
    const type = NOTIF_TYPES[key];
    const checked = _notifSettings[type] ? 'checked' : '';
    return '<label class="notif-setting-row">'
      + '<span class="notif-setting-label">' + _esc(_NOTIF_TYPE_LABELS[type]) + '</span>'
      + '<input type="checkbox" class="notif-setting-check" data-type="' + _esc(type) + '" ' + checked + '>'
      + '</label>';
  }).join('');

  container.querySelectorAll('.notif-setting-check').forEach(function (cb) {
    cb.addEventListener('change', function () {
      _notifSettings[cb.dataset.type] = cb.checked;
      _notifSaveSettings();
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initNotifications() {
  _notifLoadSettings();
  _notifUpdateBadge();

  const bellBtn = document.getElementById('notif-bell-btn');
  if (bellBtn) {
    bellBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      notifToggle();
    });
  }

  const closeBtn = document.getElementById('notif-panel-close');
  if (closeBtn) closeBtn.addEventListener('click', notifClose);

  const clearBtn = document.getElementById('notif-clear-all');
  if (clearBtn) clearBtn.addEventListener('click', _notifClearAll);

  const settingsTab = document.getElementById('notif-tab-settings');
  const listTab     = document.getElementById('notif-tab-list');
  const listView    = document.getElementById('notif-list-view');
  const settingsView = document.getElementById('notif-settings-view');

  if (settingsTab && listTab) {
    settingsTab.addEventListener('click', function () {
      settingsTab.classList.add('notif-tab-active');
      listTab.classList.remove('notif-tab-active');
      if (settingsView) settingsView.style.display = 'block';
      if (listView)     listView.style.display     = 'none';
      _notifRenderSettings();
    });

    listTab.addEventListener('click', function () {
      listTab.classList.add('notif-tab-active');
      settingsTab.classList.remove('notif-tab-active');
      if (listView)     listView.style.display     = 'block';
      if (settingsView) settingsView.style.display = 'none';
      _notifRenderList();
    });
  }

  // Close panel when clicking outside
  document.addEventListener('click', function (e) {
    if (!_notifPanelOpen) return;
    const panel  = document.getElementById('notif-panel');
    const bell   = document.getElementById('notif-bell-btn');
    if (panel && !panel.contains(e.target) && bell && !bell.contains(e.target)) {
      notifClose();
    }
  });
}

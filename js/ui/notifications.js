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
  FRIEND_SCORE:     'friend_score',
  PERSONAL_BEST:    'personal_best',
  COMMUNITY_GOAL:   'community_goal',
  DAILY_CHALLENGE:  'daily_challenge',
  EVENT_STARTED:    'event_started',
  EVENT_ENDING:     'event_ending',
  LEVEL_UP:         'level_up',
  RANK_CHANGE:      'rank_change',
  OPPONENT_JOINED:  'opponent_joined',
  OPPONENT_LEFT:    'opponent_left',
  GARBAGE_ATTACK:   'garbage_attack',
  XP_PASS:          'xp_pass',
  TOURNAMENT:       'tournament',
};

// Default settings — all types on
const NOTIF_DEFAULTS = {
  [NOTIF_TYPES.ACHIEVEMENT]:     true,
  [NOTIF_TYPES.MISSION]:         true,
  [NOTIF_TYPES.GUILD_MENTION]:   true,
  [NOTIF_TYPES.FRIEND_ONLINE]:   true,
  [NOTIF_TYPES.FRIEND_INVITE]:   true,
  [NOTIF_TYPES.FRIEND_SCORE]:    true,
  [NOTIF_TYPES.PERSONAL_BEST]:   true,
  [NOTIF_TYPES.COMMUNITY_GOAL]:  true,
  [NOTIF_TYPES.DAILY_CHALLENGE]: true,
  [NOTIF_TYPES.EVENT_STARTED]:   true,
  [NOTIF_TYPES.EVENT_ENDING]:    true,
  [NOTIF_TYPES.LEVEL_UP]:        true,
  [NOTIF_TYPES.RANK_CHANGE]:     true,
  [NOTIF_TYPES.OPPONENT_JOINED]: true,
  [NOTIF_TYPES.OPPONENT_LEFT]:   true,
  [NOTIF_TYPES.GARBAGE_ATTACK]:  true,
  [NOTIF_TYPES.XP_PASS]:         true,
  [NOTIF_TYPES.TOURNAMENT]:      true,
};

let _notifSettings = Object.assign({}, NOTIF_DEFAULTS);
let _notifPanelOpen = false;

// ── Toast queue state ─────────────────────────────────────────────────────────

// Toasts buffered during active gameplay; flushed on game over or menu return.
let _notifToastBuffer = [];
// Currently visible toast elements (max 3 at once).
let _notifActiveToasts = [];
// Pending toasts waiting for an active slot to free up.
let _notifToastQueue = [];

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

// ── Gameplay suppression ──────────────────────────────────────────────────────

/**
 * Returns true when the player is in an active, unpaused game session.
 * Toasts are buffered (not shown) during this state.
 */
function _notifIsGameplayActive() {
  return (
    typeof gameTimerRunning !== 'undefined' && gameTimerRunning &&
    typeof isGameOver !== 'undefined' && !isGameOver &&
    typeof isPaused !== 'undefined' && !isPaused
  );
}

// ── Core push ─────────────────────────────────────────────────────────────────

/**
 * Push a notification into the center and show a toast.
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

  // Play chime (respects SFX/mute settings via audio system)
  if (typeof playNotificationChime === 'function') {
    playNotificationChime();
  }

  // Show toast — buffer during active gameplay, show immediately otherwise
  if (_notifIsGameplayActive()) {
    _notifToastBuffer.push({ icon: icon, message: message, type: type });
  } else {
    _notifEnqueueToast(icon, message, type);
  }
}

/**
 * Flush buffered toasts — call when the game ends or the player returns to menu.
 * Clears the gameplay buffer and shows up to 3 toasts immediately.
 */
function notifFlushQueued() {
  const pending = _notifToastBuffer.splice(0);
  pending.forEach(function (item) {
    _notifEnqueueToast(item.icon, item.message, item.type);
  });
}

// ── Toast system ──────────────────────────────────────────────────────────────

/** Map a semantic notification type to a visual CSS modifier class. */
function _notifVisualClass(type) {
  switch (type) {
    case NOTIF_TYPES.ACHIEVEMENT:
    case NOTIF_TYPES.PERSONAL_BEST:
    case NOTIF_TYPES.XP_PASS:
      return 'notif-toast--achievement';
    case NOTIF_TYPES.MISSION:
    case NOTIF_TYPES.LEVEL_UP:
    case NOTIF_TYPES.RANK_CHANGE:
      return 'notif-toast--success';
    case NOTIF_TYPES.OPPONENT_LEFT:
    case NOTIF_TYPES.GARBAGE_ATTACK:
      return 'notif-toast--warning';
    default:
      return 'notif-toast--info';
  }
}

/** Auto-dismiss duration in ms by type. */
function _notifToastDuration(type) {
  if (type === NOTIF_TYPES.ACHIEVEMENT || type === NOTIF_TYPES.LEVEL_UP || type === NOTIF_TYPES.PERSONAL_BEST) {
    return 5000;
  }
  return 3000;
}

/** Add a toast to the visible queue (shows immediately if slot available). */
function _notifEnqueueToast(icon, message, type) {
  if (_notifActiveToasts.length < 3) {
    _notifShowToast(icon, message, type);
  } else {
    _notifToastQueue.push({ icon: icon, message: message, type: type });
  }
}

/** Create and display a single toast element. */
function _notifShowToast(icon, message, type) {
  const container = document.getElementById('notif-toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'notif-toast ' + _notifVisualClass(type);
  el.innerHTML =
    '<div class="notif-toast-icon">' + _esc(icon) + '</div>' +
    '<div class="notif-toast-msg">' + _esc(message) + '</div>' +
    '<button class="notif-toast-close" title="Dismiss">&#10005;</button>';

  el.querySelector('.notif-toast-close').addEventListener('click', function (e) {
    e.stopPropagation();
    _notifRemoveToast(el);
  });

  el.addEventListener('click', function () {
    notifOpen();
    _notifRemoveToast(el);
  });

  container.appendChild(el);
  _notifActiveToasts.push(el);

  // Slide in on next frame
  requestAnimationFrame(function () {
    el.classList.add('notif-toast-in');
  });

  // Auto-dismiss based on type
  var _dismissTimer = setTimeout(function () {
    _notifRemoveToast(el);
  }, _notifToastDuration(type));
  el._dismissTimer = _dismissTimer;
}

/** Slide a toast out and remove it; show next queued if any. */
function _notifRemoveToast(el) {
  if (el._dismissTimer) { clearTimeout(el._dismissTimer); el._dismissTimer = null; }
  el.classList.remove('notif-toast-in');
  el.style.opacity = '0';
  el.style.transform = 'translateX(320px)';
  setTimeout(function () {
    if (el.parentNode) el.parentNode.removeChild(el);
    var idx = _notifActiveToasts.indexOf(el);
    if (idx !== -1) _notifActiveToasts.splice(idx, 1);
    // Show next waiting toast
    if (_notifToastQueue.length > 0) {
      var next = _notifToastQueue.shift();
      _notifShowToast(next.icon, next.message, next.type);
    }
  }, 320);
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
  [NOTIF_TYPES.ACHIEVEMENT]:     'Achievement unlocked',
  [NOTIF_TYPES.MISSION]:         'Mission completed',
  [NOTIF_TYPES.GUILD_MENTION]:   'Guild @mention',
  [NOTIF_TYPES.FRIEND_ONLINE]:   'Friend came online',
  [NOTIF_TYPES.FRIEND_INVITE]:   'Friend invite received',
  [NOTIF_TYPES.FRIEND_SCORE]:    'Friend beat your score',
  [NOTIF_TYPES.PERSONAL_BEST]:   'New personal best',
  [NOTIF_TYPES.COMMUNITY_GOAL]:  'Community goal milestone',
  [NOTIF_TYPES.DAILY_CHALLENGE]: 'Daily challenge available',
  [NOTIF_TYPES.EVENT_STARTED]:   'Seasonal event started',
  [NOTIF_TYPES.EVENT_ENDING]:    'Seasonal event ending soon',
  [NOTIF_TYPES.LEVEL_UP]:        'Level up',
  [NOTIF_TYPES.RANK_CHANGE]:     'Ranked rating change',
  [NOTIF_TYPES.OPPONENT_JOINED]: 'Opponent joined',
  [NOTIF_TYPES.OPPONENT_LEFT]:   'Opponent left',
  [NOTIF_TYPES.GARBAGE_ATTACK]:  'Incoming garbage attack',
  [NOTIF_TYPES.XP_PASS]:         'Season pass reward',
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

// ── Startup notifications ─────────────────────────────────────────────────────

/** Push a daily challenge available notification if today's hasn't been played. */
function _notifCheckDailyChallenge() {
  if (typeof hasDailyAttemptedToday !== 'function') return;
  if (typeof getDailyDateString !== 'function') return;
  if (hasDailyAttemptedToday()) return;

  const today = getDailyDateString();
  const key = 'mineCtris_dailyNotif_' + today;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch (_) {}

  notifPush(NOTIF_TYPES.DAILY_CHALLENGE, '📅', "Today's daily challenge is ready to play!");
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

  // Check startup conditions slightly deferred so other modules finish loading
  setTimeout(_notifCheckDailyChallenge, 1500);
}

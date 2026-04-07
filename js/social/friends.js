// js/social/friends.js — Friend list, friend codes, and presence system.
// Depends on: _esc() from guild.js (loaded earlier).

const FRIENDS_WORKER_URL  = 'https://minectris-leaderboard.workers.dev';
const FRIENDS_LS_CODE     = 'mineCtris_friendCode';
const FRIENDS_LS_LIST     = 'mineCtris_friendList';
const FRIENDS_LS_SEEN     = 'mineCtris_friendLastSeen';
const FRIENDS_MAX         = 50;
const FRIENDS_ONLINE_MS   = 90000;  // 90 s — treat as online if seen within this window
const FRIENDS_CODE_CHARS  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/1/I/O for clarity

// ── Friend code ───────────────────────────────────────────────────────────────

function friendsGetMyCode() {
  let code = localStorage.getItem(FRIENDS_LS_CODE);
  if (code && /^[A-Z2-9]{6}$/.test(code)) return code;
  code = '';
  for (let i = 0; i < 6; i++) {
    code += FRIENDS_CODE_CHARS[Math.floor(Math.random() * FRIENDS_CODE_CHARS.length)];
  }
  localStorage.setItem(FRIENDS_LS_CODE, code);
  return code;
}

// ── Friend list CRUD ──────────────────────────────────────────────────────────

function friendsGetList() {
  try { return JSON.parse(localStorage.getItem(FRIENDS_LS_LIST) || '[]'); }
  catch (e) { return []; }
}

function _friendsSaveList(list) {
  localStorage.setItem(FRIENDS_LS_LIST, JSON.stringify(list));
}

// Returns null on success, or an error string.
function friendsAdd(code, name) {
  code = (code || '').toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z0-9]{6}$/.test(code)) return 'Invalid code — must be 6 letters/numbers.';
  if (code === friendsGetMyCode()) return "That's your own code!";
  const list = friendsGetList();
  if (list.length >= FRIENDS_MAX) return 'Friend list full (max ' + FRIENDS_MAX + ').';
  if (list.find(function (f) { return f.code === code; })) return 'Already in your friend list.';
  list.push({ code: code, name: (name || code), addedAt: Date.now() });
  _friendsSaveList(list);
  return null;
}

function friendsRemove(code) {
  _friendsSaveList(friendsGetList().filter(function (f) { return f.code !== code; }));
}

// ── Last-seen cache (localStorage) ───────────────────────────────────────────

let _friendsSeenCache = {};

function _friendsLoadSeen() {
  try { _friendsSeenCache = JSON.parse(localStorage.getItem(FRIENDS_LS_SEEN) || '{}'); }
  catch (e) { _friendsSeenCache = {}; }
}

function _friendsSaveSeen() {
  try { localStorage.setItem(FRIENDS_LS_SEEN, JSON.stringify(_friendsSeenCache)); }
  catch (e) {}
}

function friendsGetStatus(code) {
  const seen = _friendsSeenCache[code];
  if (!seen) return { online: false, lastSeen: null, mode: null, name: null };
  return {
    online:   (Date.now() - seen.ts) < FRIENDS_ONLINE_MS,
    lastSeen: seen.ts,
    mode:     seen.mode || null,
    name:     seen.name || null,
  };
}

function _friendsRecordSeen(data) {
  if (!data || !data.code) return;
  const myCode     = friendsGetMyCode();
  const friendList = friendsGetList();
  const isFriend   = friendList.some(function (f) { return f.code === data.code; });
  if (!isFriend && data.code !== myCode) return; // ignore strangers

  // Detect friend coming online: was offline, now online
  const prevEntry = _friendsSeenCache[data.code];
  const wasOffline = !prevEntry || (Date.now() - prevEntry.ts) >= 300000; // 5-min threshold
  _friendsSeenCache[data.code] = { ts: Date.now(), mode: data.mode || 'menu', name: data.name };
  _friendsSaveSeen();

  if (isFriend && wasOffline && typeof notifPush === 'function') {
    const displayName = data.name || data.code;
    notifPush('friend_online', '🟢', displayName + ' is now online');
  }
  // Keep cached display name in sync
  if (data.name && data.name !== data.code && isFriend) {
    const list = friendsGetList();
    const f = list.find(function (f) { return f.code === data.code; });
    if (f && f.name !== data.name) { f.name = data.name; _friendsSaveList(list); }
  }
  if (_friendsPanelOpen) _friendsRenderList();
}

// ── Presence WebSocket ────────────────────────────────────────────────────────

let _friendsPresenceWs   = null;
let _friendsPresenceTmr  = null;
let _friendsCurrentMode  = 'menu';

function _friendsMyName() {
  return (typeof loadDisplayName === 'function' ? loadDisplayName() : null)
    || localStorage.getItem('mineCtris_displayName')
    || friendsGetMyCode();
}

function _friendsSendPresence(mode) {
  if (!_friendsPresenceWs || _friendsPresenceWs.readyState !== WebSocket.OPEN) return;
  _friendsPresenceWs.send(JSON.stringify({
    type:    'friend_presence',
    code:    friendsGetMyCode(),
    name:    _friendsMyName(),
    mode:    mode || 'menu',
    friends: friendsGetList().map(function (f) { return f.code; }),
  }));
}

function friendsConnectPresence() {
  _friendsLoadSeen();
  if (_friendsPresenceWs) return;
  const wsBase = FRIENDS_WORKER_URL.replace(/^https/, 'wss').replace(/^http(?!s)/, 'ws');
  const wsUrl  = wsBase + '/friends/presence/ws';
  try { _friendsPresenceWs = new WebSocket(wsUrl); }
  catch (e) { return; }

  _friendsPresenceWs.addEventListener('open', function () {
    _friendsSendPresence(_friendsCurrentMode);
    _friendsPresenceTmr = setInterval(function () { _friendsSendPresence(_friendsCurrentMode); }, 30000);
  });

  _friendsPresenceWs.addEventListener('message', function (event) {
    let msg;
    try { msg = JSON.parse(event.data); } catch (e) { return; }
    if (msg.type === 'friend_presence') {
      _friendsRecordSeen(msg);
    } else if (msg.type === 'friend_presence_bulk' && Array.isArray(msg.updates)) {
      msg.updates.forEach(_friendsRecordSeen);
    } else if (msg.type === 'friend_invite') {
      _friendsHandleIncomingInvite(msg);
    }
  });

  _friendsPresenceWs.addEventListener('close', function () {
    clearInterval(_friendsPresenceTmr);
    _friendsPresenceTmr = null;
    _friendsPresenceWs  = null;
  });

  _friendsPresenceWs.addEventListener('error', function () {
    clearInterval(_friendsPresenceTmr);
    _friendsPresenceTmr = null;
    _friendsPresenceWs  = null;
  });
}

function friendsDisconnectPresence() {
  clearInterval(_friendsPresenceTmr);
  _friendsPresenceTmr = null;
  if (_friendsPresenceWs) {
    try { _friendsPresenceWs.close(); } catch (e) {}
    _friendsPresenceWs = null;
  }
}

// Call this whenever the player enters or exits a game mode.
// mode should match keys in _friendsModeLabel (e.g. 'classic', 'battle', 'menu').
function friendsSetMode(mode) {
  _friendsCurrentMode = mode || 'menu';
  _friendsSendPresence(_friendsCurrentMode);
}

// ── Outgoing invite ───────────────────────────────────────────────────────────

// Called when user clicks "Invite to Battle/Co-op" on an online friend.
function friendsSendInvite(friendCode, mode) {
  const api = mode === 'battle'
    ? (typeof battle !== 'undefined' ? battle : null)
    : (typeof coop   !== 'undefined' ? coop   : null);
  if (!api) return;

  var statusEl = document.getElementById('friends-invite-status');
  if (statusEl) statusEl.textContent = 'Creating room\u2026';

  api.createRoom().then(function (roomCode) {
    // Open the overlay in waiting-host mode
    if (mode === 'battle') {
      if (typeof window._friendsOpenBattleCreate === 'function') window._friendsOpenBattleCreate(roomCode);
    } else {
      if (typeof window._friendsOpenCoopCreate === 'function') window._friendsOpenCoopCreate(roomCode);
    }
    // Broadcast the invite via presence WS
    if (_friendsPresenceWs && _friendsPresenceWs.readyState === WebSocket.OPEN) {
      _friendsPresenceWs.send(JSON.stringify({
        type:     'friend_invite',
        from:     friendsGetMyCode(),
        fromName: _friendsMyName(),
        to:       friendCode,
        mode:     mode,
        roomCode: roomCode,
      }));
    }
    _friendsClosePanel();
  }).catch(function () {
    if (statusEl) statusEl.textContent = 'Failed to create room.';
  });
}

// ── Incoming invite ───────────────────────────────────────────────────────────

function _friendsHandleIncomingInvite(msg) {
  if (msg.to !== friendsGetMyCode()) return;
  const list       = friendsGetList();
  const sender     = list.find(function (f) { return f.code === msg.from; });
  const senderName = sender ? sender.name : (msg.fromName || msg.from);
  _friendsShowInviteToast(senderName, msg.roomCode, msg.mode);
}

function _friendsShowInviteToast(fromName, roomCode, mode) {
  if (typeof notifPush === 'function') {
    const modeLabel = mode === 'battle' ? 'Battle' : 'Co-op';
    notifPush('friend_invite', '📨', fromName + ' invited you to a ' + modeLabel + ' game');
  }

  const toast = document.getElementById('friend-invite-toast');
  if (!toast) return;
  const senderEl = document.getElementById('fit-sender');
  const modeEl   = document.getElementById('fit-mode');
  if (senderEl) senderEl.textContent = fromName;
  if (modeEl)   modeEl.textContent   = mode === 'battle' ? 'Battle' : 'Co-op';
  toast.dataset.roomCode = roomCode;
  toast.dataset.mode     = mode;
  toast.style.display    = 'flex';
  clearTimeout(toast._autoHide);
  toast._autoHide = setTimeout(function () { toast.style.display = 'none'; }, 30000);
}

// ── Panel UI ──────────────────────────────────────────────────────────────────

let _friendsPanelOpen = false;

function friendsOpenPanel() {
  _friendsLoadSeen();
  const panel = document.getElementById('friends-panel');
  if (!panel) return;
  _friendsPanelOpen = true;
  panel.style.display = 'flex';
  const blocker = document.getElementById('blocker');
  if (blocker) blocker.style.display = 'none';
  _friendsShowView('list');
  _friendsRenderMyCode();
  _friendsRenderList();
  friendsConnectPresence();
}

function _friendsClosePanel() {
  const panel = document.getElementById('friends-panel');
  if (panel) panel.style.display = 'none';
  _friendsPanelOpen = false;
  const blocker = document.getElementById('blocker');
  if (blocker) blocker.style.display = 'flex';
}

function _friendsShowView(name) {
  ['friends-list-view', 'friends-add-view'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.style.display = (id === 'friends-' + name + '-view') ? '' : 'none';
  });
}

function _friendsRenderMyCode() {
  const el = document.getElementById('friends-my-code');
  if (el) el.textContent = friendsGetMyCode();
  const countEl = document.getElementById('friends-count');
  if (countEl) countEl.textContent = friendsGetList().length + ' / ' + FRIENDS_MAX;
}

function _friendsFormatLastSeen(ts) {
  if (!ts) return 'Never';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

function _friendsModeLabel(mode) {
  const map = {
    menu: 'In Menu', classic: 'Classic', sprint: 'Sprint', blitz: 'Blitz',
    daily: 'Daily', battle: 'Battle', coop: 'Co-op', survival: 'Survival',
    depths: 'Depths', expedition: 'Expedition', tournament: 'Tournament',
  };
  return map[mode] || (mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : 'Playing');
}

function _friendsRenderList() {
  if (!_friendsPanelOpen) return;
  const container = document.getElementById('friends-list-body');
  if (!container) return;
  _friendsRenderMyCode();
  const list = friendsGetList();
  if (list.length === 0) {
    container.innerHTML = '<div class="friends-empty">No friends yet — share your code<br>or add one below!</div>';
    return;
  }
  const online = [], inGame = [], offline = [];
  list.forEach(function (f) {
    const s = friendsGetStatus(f.code);
    if (!s.online) {
      offline.push({ f: f, s: s });
    } else if (s.mode && s.mode !== 'menu') {
      inGame.push({ f: f, s: s });
    } else {
      online.push({ f: f, s: s });
    }
  });
  function _sortAlpha(a, b) {
    return (a.f.name || a.f.code).localeCompare(b.f.name || b.f.code);
  }
  online.sort(_sortAlpha);
  inGame.sort(_sortAlpha);
  offline.sort(_sortAlpha);

  let html = '';
  inGame.concat(online).concat(offline).forEach(function (item) {
    const f = item.f, s = item.s;
    const dotClass = !s.online ? 'offline' : (s.mode && s.mode !== 'menu' ? 'in-game' : 'online');
    const dot  = '<span class="friends-dot ' + dotClass + '"></span>';
    const info = s.online
      ? '<span class="friends-status-mode">' + _esc(_friendsModeLabel(s.mode)) + '</span>'
      : '<span class="friends-status-seen">Last seen: ' + _friendsFormatLastSeen(s.lastSeen) + '</span>';
    const inviteBtns = s.online
      ? '<button class="friends-invite-btn friends-invite-battle" data-code="' + _esc(f.code) + '" data-mode="battle">&#9876; Battle</button>'
      + '<button class="friends-invite-btn friends-invite-coop"   data-code="' + _esc(f.code) + '" data-mode="coop">&#129309; Co-op</button>'
      : '';
    // Deterministic skin from friend code hash (consistent per friend)
    const avatarCanvas = typeof renderAvatarToCanvas === 'function'
      ? '<canvas class="friends-avatar-thumb" data-friend-code="' + _esc(f.code) + '" width="24" height="24"></canvas>'
      : '';
    html +=
      '<div class="friends-row">'
      + '<div class="friends-row-left">'
      + avatarCanvas
      + dot
      + '<div class="friends-row-info">'
      + '<span class="friends-name">' + _esc(f.name) + '</span>'
      + info
      + '</div></div>'
      + '<div class="friends-row-right">'
      + inviteBtns
      + '<button class="friends-view-profile-btn friend-view-profile-btn" data-code="' + _esc(f.code) + '" title="View profile">&#128100;</button>'
      + '<button class="friends-remove-btn" data-code="' + _esc(f.code) + '" title="Remove friend">&#10005;</button>'
      + '</div>'
      + '</div>';
  });
  container.innerHTML = html;

  // Render mini avatars — deterministic skin based on friend code hash
  if (typeof renderAvatarToCanvas === 'function') {
    const _SKIN_IDS = ['steve','alex','creeper','enderman','skeleton','zombie',
                       'blaze','ghast','iron_golem','villager','wither','ender_dragon'];
    container.querySelectorAll('.friends-avatar-thumb').forEach(function (c) {
      const code = c.getAttribute('data-friend-code') || '';
      let hash = 0;
      for (let ci = 0; ci < code.length; ci++) hash = (hash * 31 + code.charCodeAt(ci)) | 0;
      const skinId = _SKIN_IDS[Math.abs(hash) % _SKIN_IDS.length];
      renderAvatarToCanvas(c, skinId, 'none');
    });
  }

  container.querySelectorAll('.friends-invite-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      friendsSendInvite(btn.dataset.code, btn.dataset.mode);
    });
  });
  container.querySelectorAll('.friends-view-profile-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (typeof friendsViewProfile === 'function') friendsViewProfile(btn.dataset.code);
    });
  });
  container.querySelectorAll('.friends-remove-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var row = btn.closest('.friends-row');
      var nameEl = row ? row.querySelector('.friends-name') : null;
      var name = nameEl ? nameEl.textContent : btn.dataset.code;
      if (!confirm('Remove ' + name + ' from your friends?')) return;
      friendsRemove(btn.dataset.code);
      _friendsRenderList();
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

function _friendsRegisterCode() {
  const code = friendsGetMyCode();
  const name = _friendsMyName();
  fetch(FRIENDS_WORKER_URL + '/api/friends/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code, name: name }),
  }).catch(function () {});
}

function initFriends() {
  _friendsLoadSeen();
  // Ensure the player has a friend code on first load
  friendsGetMyCode();
  // Register code → display name server-side so others can look us up
  _friendsRegisterCode();

  // Panel close
  var closeBtn = document.getElementById('friends-panel-close');
  if (closeBtn) closeBtn.addEventListener('click', _friendsClosePanel);

  // Copy my code
  var copyBtn = document.getElementById('friends-copy-code-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var code = friendsGetMyCode();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () {
          copyBtn.textContent = 'Copied!';
          setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500);
        }).catch(function () { prompt('Your friend code:', code); });
      } else {
        prompt('Your friend code:', code);
      }
    });
  }

  // Add-friend tab
  var addTabBtn = document.getElementById('friends-add-tab-btn');
  if (addTabBtn) addTabBtn.addEventListener('click', function () {
    _friendsShowView('add');
    var inp = document.getElementById('friends-add-input');
    if (inp) inp.focus();
    var statusEl = document.getElementById('friends-add-status');
    if (statusEl) statusEl.textContent = '';
  });

  var addBackBtn = document.getElementById('friends-add-back-btn');
  if (addBackBtn) addBackBtn.addEventListener('click', function () { _friendsShowView('list'); });

  // Confirm add
  var addConfirmBtn = document.getElementById('friends-add-confirm-btn');
  if (addConfirmBtn) {
    function _doAdd() {
      var codeInput = document.getElementById('friends-add-input');
      var nameInput = document.getElementById('friends-add-name-input');
      var code = codeInput ? codeInput.value.trim() : '';
      var name = nameInput ? nameInput.value.trim() : '';
      var err = friendsAdd(code, name);
      var statusEl = document.getElementById('friends-add-status');
      if (err) {
        if (statusEl) { statusEl.textContent = err; statusEl.style.color = '#f87171'; }
      } else {
        if (codeInput) codeInput.value = '';
        if (nameInput) nameInput.value = '';
        if (statusEl)  { statusEl.textContent = 'Friend added!'; statusEl.style.color = '#4ade80'; }
        _friendsShowView('list');
        _friendsRenderList();
      }
    }
    addConfirmBtn.addEventListener('click', _doAdd);
    // Allow Enter key in code input
    var codeInput = document.getElementById('friends-add-input');
    if (codeInput) codeInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') _doAdd();
    });
  }

  // Invite toast — join button
  var toastJoinBtn = document.getElementById('fit-join-btn');
  if (toastJoinBtn) {
    toastJoinBtn.addEventListener('click', function () {
      var toast = document.getElementById('friend-invite-toast');
      if (!toast) return;
      var roomCode = toast.dataset.roomCode;
      var mode     = toast.dataset.mode;
      toast.style.display = 'none';
      if (mode === 'battle') {
        if (typeof window._friendsOpenBattleWithCode === 'function') window._friendsOpenBattleWithCode(roomCode);
      } else {
        if (typeof window._friendsOpenCoopWithCode === 'function') window._friendsOpenCoopWithCode(roomCode);
      }
    });
  }

  var toastDismissBtn = document.getElementById('fit-dismiss-btn');
  if (toastDismissBtn) {
    toastDismissBtn.addEventListener('click', function () {
      var toast = document.getElementById('friend-invite-toast');
      if (toast) toast.style.display = 'none';
    });
  }

  // Main menu button
  var menuBtn = document.getElementById('start-friends-btn');
  if (menuBtn) menuBtn.addEventListener('click', friendsOpenPanel);

  // Start presence connection in background
  friendsConnectPresence();
}

// Boot after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFriends);
} else {
  setTimeout(initFriends, 0);
}

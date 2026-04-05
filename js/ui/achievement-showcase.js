// achievement-showcase.js — Player profile card with achievement badges, featured badge,
// PNG share, and friend profile viewer.
// Requires: achievements.js, stats.js, leveling.js, leaderboard.js (loadDisplayName),
//           friends.js (friendsGetList, friendsGetMyCode)

'use strict';

var SHOWCASE_FEATURED_KEY = 'mineCtris_featuredBadge';

// ── Featured badge storage ────────────────────────────────────────────────────

function loadFeaturedBadge() {
  return localStorage.getItem(SHOWCASE_FEATURED_KEY) || null;
}

function saveFeaturedBadge(id) {
  if (id) {
    localStorage.setItem(SHOWCASE_FEATURED_KEY, id);
  } else {
    localStorage.removeItem(SHOWCASE_FEATURED_KEY);
  }
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function _showcaseFmtTime(secs) {
  secs = secs || 0;
  if (secs < 60) return secs + 's';
  var m = Math.floor(secs / 60);
  if (m < 60) return m + 'm';
  var h = Math.floor(m / 60);
  var rm = m % 60;
  return h + 'h ' + rm + 'm';
}

function _showcaseFavoriteMode(stats) {
  var perMode = stats.perMode || {};
  var best = null;
  var bestGames = 0;
  Object.keys(perMode).forEach(function (mode) {
    var games = (perMode[mode] && perMode[mode].games) || 0;
    if (games > bestGames) { bestGames = games; best = mode; }
  });
  if (!best) return 'Classic';
  return best.charAt(0).toUpperCase() + best.slice(1);
}

function _showcaseTopAchievements(unlocked, count) {
  // Sort by unlock date descending, take first `count`
  var entries = Object.keys(unlocked).map(function (id) {
    return { id: id, date: (unlocked[id] && unlocked[id].date) || '0' };
  });
  entries.sort(function (a, b) { return b.date.localeCompare(a.date); });
  var top = entries.slice(0, count);
  return top.map(function (e) {
    return ACHIEVEMENTS.find(function (a) { return a.id === e.id; }) || null;
  }).filter(Boolean);
}

function _showcaseEsc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Showcase overlay open/close ───────────────────────────────────────────────

function openAchievementShowcase() {
  var overlay = document.getElementById('achievement-showcase-overlay');
  if (!overlay) return;
  _renderShowcaseCard(overlay, null, false);
  overlay.style.display = 'flex';
}

function closeAchievementShowcase() {
  var overlay = document.getElementById('achievement-showcase-overlay');
  if (overlay) overlay.style.display = 'none';
}

// Opens the showcase displaying a friend's locally-cached profile data.
// friendData: { name, friendCode, presence }
function openFriendProfileShowcase(friendData) {
  var overlay = document.getElementById('achievement-showcase-overlay');
  if (!overlay) return;
  _renderShowcaseCard(overlay, friendData, true);
  overlay.style.display = 'flex';
}

// ── Main card renderer ────────────────────────────────────────────────────────

function _renderShowcaseCard(overlay, friendData, isReadOnly) {
  var isOwn = !isReadOnly;
  var stats = typeof loadLifetimeStats === 'function' ? loadLifetimeStats() : {};
  var unlocked = typeof loadAchievements === 'function' ? loadAchievements() : {};
  var displayName = typeof loadDisplayName === 'function' ? loadDisplayName() : 'PLAYER';
  var level = typeof getPlayerLevel === 'function' ? getPlayerLevel() : 1;
  var prestigeStars = typeof getPrestigeStarsHtml === 'function' ? getPrestigeStarsHtml() : '';
  var featuredId = loadFeaturedBadge();
  var featuredAch = featuredId
    ? (ACHIEVEMENTS.find(function (a) { return a.id === featuredId; }) || null)
    : null;

  if (friendData) {
    displayName = friendData.name || 'Friend';
    // Friends don't share their full stats locally — show basic info only
    unlocked = {};
    stats = {};
    level = 0;
    prestigeStars = '';
    featuredAch = null;
  }

  var totalPlay = _showcaseFmtTime(stats.timePlayed);
  var favMode = _showcaseFavoriteMode(stats);
  var gamesPlayed = stats.gamesPlayed || 0;
  var topAchs = _showcaseTopAchievements(unlocked, 3);
  var unlockedCount = Object.keys(unlocked).length;
  var totalAchs = typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS.length : 0;

  var html = '<div id="showcase-card">';

  // ── Header ────────────────────────────────────────────────────────────────
  html += '<div class="showcase-header">';
  if (featuredAch && isOwn) {
    html += '<span class="showcase-featured-icon" title="Featured Badge: ' + _showcaseEsc(featuredAch.name) + '">' + featuredAch.icon + '</span>';
  }
  html += '<div class="showcase-name-row">';
  if (isOwn) {
    html += '<span class="showcase-player-name" id="showcase-name-display">' + _showcaseEsc(displayName || 'PLAYER') + '</span>';
    html += '<button class="showcase-edit-name-btn" id="showcase-edit-name-btn" title="Edit display name">&#9998;</button>';
    html += '<input class="showcase-name-input" id="showcase-name-input" maxlength="16" style="display:none" value="' + _showcaseEsc(displayName || '') + '" />';
    html += '<button class="showcase-save-name-btn" id="showcase-save-name-btn" style="display:none">&#10003;</button>';
  } else {
    html += '<span class="showcase-player-name">' + _showcaseEsc(displayName) + '</span>';
    html += '<span class="showcase-friend-tag">&#128101; Friend</span>';
  }
  if (prestigeStars) html += '<span class="showcase-prestige">' + prestigeStars + '</span>';
  html += '</div>';
  if (level > 0) {
    html += '<div class="showcase-level">Level ' + level + '</div>';
  }
  html += '</div>'; // .showcase-header

  // ── Quick stats ───────────────────────────────────────────────────────────
  if (isOwn) {
    html += '<div class="showcase-stats-row">';
    html += '<div class="showcase-stat"><div class="showcase-stat-val">' + totalPlay + '</div><div class="showcase-stat-lbl">PLAYTIME</div></div>';
    html += '<div class="showcase-stat"><div class="showcase-stat-val">' + gamesPlayed.toLocaleString() + '</div><div class="showcase-stat-lbl">GAMES</div></div>';
    html += '<div class="showcase-stat"><div class="showcase-stat-val">' + favMode + '</div><div class="showcase-stat-lbl">FAV MODE</div></div>';
    html += '<div class="showcase-stat"><div class="showcase-stat-val">' + unlockedCount + '/' + totalAchs + '</div><div class="showcase-stat-lbl">BADGES</div></div>';
    html += '</div>';
  } else {
    html += '<div class="showcase-friend-note">&#128274; Detailed stats are private</div>';
  }

  // ── Top 3 achievements ────────────────────────────────────────────────────
  if (isOwn) {
    html += '<div class="showcase-section-title">RECENT ACHIEVEMENTS</div>';
    if (topAchs.length === 0) {
      html += '<div class="showcase-empty">No achievements yet — play some games!</div>';
    } else {
      html += '<div class="showcase-top-achs">';
      topAchs.forEach(function (ach) {
        var earnedDate = (unlocked[ach.id] && unlocked[ach.id].date) || '';
        html += '<div class="showcase-top-ach" title="' + _showcaseEsc(ach.desc) + (earnedDate ? '\nEarned: ' + earnedDate : '') + '">';
        html += '<span class="showcase-top-ach-icon">' + ach.icon + '</span>';
        html += '<div class="showcase-top-ach-info"><div class="showcase-top-ach-name">' + _showcaseEsc(ach.name) + '</div>';
        if (earnedDate) html += '<div class="showcase-top-ach-date">' + earnedDate + '</div>';
        html += '</div></div>';
      });
      html += '</div>';
    }
  }

  // ── Badge shelf ───────────────────────────────────────────────────────────
  if (isOwn) {
    html += '<div class="showcase-section-title">BADGE SHELF';
    html += ' <span class="showcase-badge-count">(' + unlockedCount + ' earned)</span></div>';
    html += '<div class="showcase-badge-shelf">';
    if (typeof ACHIEVEMENTS !== 'undefined') {
      ACHIEVEMENTS.forEach(function (ach) {
        var isEarned = !!unlocked[ach.id];
        var isFeatured = (ach.id === featuredId);
        var earnedDate = (unlocked[ach.id] && unlocked[ach.id].date) || '';
        var tooltip = ach.name + '\n' + ach.desc + (earnedDate ? '\nEarned: ' + earnedDate : '\nNot yet earned');
        var cls = 'showcase-badge' + (isEarned ? ' showcase-badge-earned' : ' showcase-badge-locked') + (isFeatured ? ' showcase-badge-featured' : '');
        html += '<div class="' + cls + '" title="' + _showcaseEsc(tooltip) + '" data-ach-id="' + ach.id + '" data-earned="' + (isEarned ? '1' : '0') + '">';
        html += '<span class="showcase-badge-icon">' + ach.icon + '</span>';
        if (isFeatured) html += '<span class="showcase-badge-star">&#9733;</span>';
        html += '</div>';
      });
    }
    html += '</div>';
    html += '<div class="showcase-badge-hint">Click an earned badge to feature it on leaderboards.</div>';
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  html += '<div class="showcase-actions">';
  if (isOwn) {
    html += '<button class="showcase-btn showcase-share-btn" id="showcase-share-btn">&#128247; Share Card</button>';
  }
  html += '<button class="showcase-btn showcase-close-btn" id="showcase-close-btn">Close</button>';
  html += '</div>';

  html += '</div>'; // #showcase-card

  var container = overlay.querySelector('#showcase-content');
  if (!container) container = overlay;
  container.innerHTML = html;

  _showcaseBindEvents(overlay, isOwn, unlocked);
}

// ── Event binding ─────────────────────────────────────────────────────────────

function _showcaseBindEvents(overlay, isOwn, unlocked) {
  var closeBtn = overlay.querySelector('#showcase-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeAchievementShowcase);

  if (!isOwn) return;

  // Inline name editing
  var editBtn = overlay.querySelector('#showcase-edit-name-btn');
  var nameDisplay = overlay.querySelector('#showcase-name-display');
  var nameInput = overlay.querySelector('#showcase-name-input');
  var saveBtn = overlay.querySelector('#showcase-save-name-btn');

  if (editBtn && nameInput && saveBtn) {
    editBtn.addEventListener('click', function () {
      nameDisplay.style.display = 'none';
      editBtn.style.display = 'none';
      nameInput.style.display = 'inline-block';
      saveBtn.style.display = 'inline-block';
      nameInput.focus();
    });
    saveBtn.addEventListener('click', function () {
      _showcaseSaveName(nameInput.value, nameDisplay, nameInput, editBtn, saveBtn);
    });
    nameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        _showcaseSaveName(nameInput.value, nameDisplay, nameInput, editBtn, saveBtn);
      }
    });
  }

  // Badge selection
  var badges = overlay.querySelectorAll('.showcase-badge[data-earned="1"]');
  badges.forEach(function (badgeEl) {
    badgeEl.addEventListener('click', function () {
      var id = badgeEl.getAttribute('data-ach-id');
      var currentFeatured = loadFeaturedBadge();
      // Toggle off if already featured
      if (id === currentFeatured) {
        saveFeaturedBadge(null);
      } else {
        saveFeaturedBadge(id);
      }
      // Re-render
      _renderShowcaseCard(overlay, null, false);
      // Update leaderboard header if visible
      if (typeof _showcaseRefreshLeaderboardName === 'function') {
        _showcaseRefreshLeaderboardName();
      }
    });
  });

  // Share button
  var shareBtn = overlay.querySelector('#showcase-share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', downloadProfileCard);
  }
}

function _showcaseSaveName(rawVal, nameDisplay, nameInput, editBtn, saveBtn) {
  var val = rawVal.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16);
  if (!val) return;
  if (typeof saveDisplayName === 'function') {
    saveDisplayName(val);
  } else {
    localStorage.setItem('mineCtris_displayName', val);
  }
  nameDisplay.textContent = val;
  nameDisplay.style.display = 'inline';
  editBtn.style.display = 'inline-block';
  nameInput.style.display = 'none';
  saveBtn.style.display = 'none';
}

// ── Canvas PNG export ─────────────────────────────────────────────────────────

function drawProfileCardCanvas() {
  var W = 600, H = 480;
  var canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  var ctx = canvas.getContext('2d');

  var stats = typeof loadLifetimeStats === 'function' ? loadLifetimeStats() : {};
  var unlocked = typeof loadAchievements === 'function' ? loadAchievements() : {};
  var displayName = typeof loadDisplayName === 'function' ? loadDisplayName() : 'PLAYER';
  var level = typeof getPlayerLevel === 'function' ? getPlayerLevel() : 1;
  var featuredId = loadFeaturedBadge();
  var featuredAch = featuredId
    ? (ACHIEVEMENTS.find(function (a) { return a.id === featuredId; }) || null)
    : null;
  var topAchs = _showcaseTopAchievements(unlocked, 3);
  var unlockedCount = Object.keys(unlocked).length;
  var totalAchs = typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS.length : 0;
  var totalPlay = _showcaseFmtTime(stats.timePlayed);
  var favMode = _showcaseFavoriteMode(stats);
  var gamesPlayed = stats.gamesPlayed || 0;

  // Background
  ctx.fillStyle = '#0a0f0a';
  ctx.fillRect(0, 0, W, H);

  // Border
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, W - 4, H - 4);

  // Inner accent border
  ctx.strokeStyle = 'rgba(34,197,94,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 8, W - 16, H - 16);

  // Title bar
  ctx.fillStyle = 'rgba(34,197,94,0.12)';
  ctx.fillRect(0, 0, W, 64);
  ctx.strokeStyle = 'rgba(34,197,94,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 64); ctx.lineTo(W, 64); ctx.stroke();

  // MINETRIS watermark
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.fillStyle = 'rgba(34,197,94,0.35)';
  ctx.textAlign = 'right';
  ctx.fillText('MINETRIS', W - 18, H - 14);

  // Avatar thumbnail (48×48 drawn at top-left of header)
  if (typeof createAvatarCanvas === 'function') {
    try {
      var avC = createAvatarCanvas(
        typeof getSelectedAvatar === 'function' ? getSelectedAvatar() : 'steve',
        typeof getSelectedFrame  === 'function' ? getSelectedFrame()  : 'none',
        48
      );
      ctx.drawImage(avC, 16, 8, 48, 48);
    } catch (_) {}
  }

  // Player name
  ctx.textAlign = 'left';
  var nameX = typeof createAvatarCanvas === 'function' ? 72 : 20;
  var nameStr = (displayName || 'PLAYER').toUpperCase();
  if (featuredAch) {
    // Draw featured badge emoji before name
    ctx.font = '26px sans-serif';
    ctx.fillText(featuredAch.icon, nameX, 44);
    nameX += 36;
  }
  ctx.font = 'bold 18px "Press Start 2P", monospace';
  ctx.fillStyle = '#4ade80';
  ctx.fillText(nameStr, nameX, 44);

  // Level badge
  ctx.font = '9px "Press Start 2P", monospace';
  ctx.fillStyle = '#6b8a6b';
  ctx.fillText('LVL ' + level, W - 80, 44);

  // Divider
  var dy = 80;

  // Stats row
  var statItems = [
    { label: 'PLAYTIME', value: totalPlay },
    { label: 'GAMES',    value: gamesPlayed.toLocaleString() },
    { label: 'FAV MODE', value: favMode },
    { label: 'BADGES',   value: unlockedCount + '/' + totalAchs },
  ];
  var colW = W / statItems.length;
  for (var si = 0; si < statItems.length; si++) {
    var sx = si * colW + colW / 2;
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px "Press Start 2P", monospace';
    ctx.fillStyle = '#4ade80';
    ctx.fillText(statItems[si].value, sx, dy + 16);
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = '#6b8a6b';
    ctx.fillText(statItems[si].label, sx, dy + 32);
  }

  // Section: Recent Achievements
  dy += 60;
  ctx.textAlign = 'left';
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillStyle = '#6b8a6b';
  ctx.fillText('RECENT ACHIEVEMENTS', 20, dy);
  dy += 16;

  if (topAchs.length === 0) {
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = '#3d5c3d';
    ctx.fillText('No achievements yet', 20, dy + 14);
    dy += 30;
  } else {
    for (var ai = 0; ai < topAchs.length; ai++) {
      var ach = topAchs[ai];
      var achX = 20 + ai * 190;
      ctx.fillStyle = 'rgba(34,197,94,0.08)';
      ctx.fillRect(achX, dy, 180, 44);
      ctx.strokeStyle = 'rgba(34,197,94,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(achX, dy, 180, 44);
      // Icon
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(ach.icon, achX + 8, dy + 30);
      // Name
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.fillStyle = '#4ade80';
      ctx.fillText(_truncText(ach.name, 16), achX + 36, dy + 20);
      // Desc
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.fillStyle = '#6b8a6b';
      ctx.fillText(_truncText(ach.desc, 22), achX + 36, dy + 34);
    }
    dy += 52;
  }

  // Section: Badge shelf (earned badges as a row of icons)
  dy += 8;
  ctx.textAlign = 'left';
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillStyle = '#6b8a6b';
  ctx.fillText('BADGE SHELF', 20, dy);
  dy += 16;

  if (typeof ACHIEVEMENTS !== 'undefined') {
    var earnedBadges = ACHIEVEMENTS.filter(function (a) { return !!unlocked[a.id]; });
    var maxVisible = Math.floor((W - 40) / 34);
    var shown = earnedBadges.slice(0, maxVisible);
    for (var bi = 0; bi < shown.length; bi++) {
      var bx = 20 + bi * 34;
      var isFeat = (shown[bi].id === featuredId);
      if (isFeat) {
        ctx.fillStyle = 'rgba(250,204,21,0.15)';
        ctx.fillRect(bx - 2, dy - 2, 30, 30);
      }
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(shown[bi].icon, bx, dy + 22);
    }
    var remaining = earnedBadges.length - shown.length;
    if (remaining > 0) {
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#3d5c3d';
      ctx.textAlign = 'left';
      ctx.fillText('+' + remaining + ' more', 20 + shown.length * 34 + 4, dy + 18);
    }
    if (earnedBadges.length === 0) {
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#3d5c3d';
      ctx.fillText('No badges earned yet', 20, dy + 18);
    }
  }

  return canvas;
}

function _truncText(str, maxLen) {
  str = str || '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '\u2026' : str;
}

function downloadProfileCard() {
  var canvas = drawProfileCardCanvas();
  var link = document.createElement('a');
  var name = typeof loadDisplayName === 'function' ? loadDisplayName() : 'player';
  link.download = 'minetris-profile-' + (name || 'card') + '.png';
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Friend profile viewer ─────────────────────────────────────────────────────

// Called from friends panel — opens a read-only showcase for a friend.
function friendsViewProfile(friendCode) {
  var list = typeof friendsGetList === 'function' ? friendsGetList() : [];
  var friend = list.find(function (f) { return f.code === friendCode; });
  if (!friend) return;
  openFriendProfileShowcase({ name: friend.name || friendCode, friendCode: friendCode });
}

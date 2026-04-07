// Player avatar skins (12 Minecraft character heads) and profile frames (8 styles).
// Renders 8×8 pixel-art heads to canvas at any size.
// Depends on: leveling.js (getPlayerLevel), mastery.js (loadMastery), missions.js (MISSIONS_KEY)
//
// Storage keys:
//   mineCtris_avatarSkin  — selected avatar skin id (default: 'steve')
//   mineCtris_avatarFrame — selected frame id (default: 'none')

const AVATAR_SKIN_KEY  = 'mineCtris_avatarSkin';
const AVATAR_FRAME_KEY = 'mineCtris_avatarFrame';

// ── Pixel art definitions ────────────────────────────────────────────────────
// Each avatar: { palette: {char: hexColor}, pixels: string[64] }
// Pixels are 8×8 row-major (top-left → bottom-right).

const _AVATAR_DEFS = {

  steve: {
    p: { H:'#7B4F2E', S:'#F3AD85', E:'#3D2B1F', W:'#D4A070', M:'#8B3A1A', B:'#5B8DD9' },
    g: 'HHHHHHHH' +
       'HHHHHHHH' +
       'SSSSSSSS' +
       'SEWSSEWS' +
       'SSSSSSSS' +
       'SSMMSSS' + 'S' +
       'SMMMMMSS' +
       'BBBBBBBB'
  },

  alex: {
    p: { O:'#C86428', S:'#F3AD85', E:'#3D2B1F', W:'#D4A070', M:'#8B3A1A', G:'#5BA65B' },
    g: 'SOOOOOS' + 'S' +
       'SOOOOS' + 'SS' +
       'SSSSSSSS' +
       'SEWSSEWS' +
       'SSSSSSSS' +
       'SSSSSSSS' +
       'SMMMMSSS' +
       'GGGGGGGG'
  },

  creeper: {
    p: { L:'#60A84F', D:'#2A6B1A', B:'#1A1A12' },
    g: 'LLLLLLLL' +
       'LLLLLLLL' +
       'LBBLLBBL' +
       'LBBLLBBL' +
       'LLLLLLLL' +
       'LLBBBBLL' +
       'LBBLLBBL' +
       'LLLLLLLL'
  },

  enderman: {
    p: { K:'#1A0A2E', P:'#9B4FCC', D:'#120726' },
    g: 'KKKKKKKK' +
       'KKKKKKKK' +
       'KKKKKKKK' +
       'KPPKKPPK' +
       'KKKKKKKK' +
       'KKKKKKKK' +
       'KKKKKKKK' +
       'KKKKKKKK'
  },

  skeleton: {
    p: { W:'#E8E8E0', G:'#B0B0A8', E:'#111111', S:'#D0D0C8' },
    g: 'WWWWWWWW' +
       'WGWWWWGW' +
       'WGWWWWGW' +
       'EEGWWGEE' +
       'WWWWWWWW' +
       'WWWWWWWW' +
       'WGGWWGGW' +
       'WGGWWGGW'
  },

  zombie: {
    p: { G:'#7AB87A', D:'#4A8A4A', R:'#DD4444', B:'#6080B0' },
    g: 'GGGGGGGG' +
       'GGGGGGGG' +
       'GGGGGGGG' +
       'GRGGGRRG' + // zombie: one red eye, one sunken
       'GGGGGGGG' +
       'GDGGGDGG' +
       'GDDDDDDG' +
       'BBBBBBBB'
  },

  blaze: {
    p: { Y:'#F5C518', O:'#E07010', R:'#C04010', K:'#1A0A00' },
    g: 'YRROOORY' +
       'ORYYYORO' +
       'YYYYYYYY' +
       'OKKOOOKK' +
       'YYYYYYYY' +
       'OOORROO' + 'O' +
       'ROYYYYOR' +
       'YROOOOOY'
  },

  ghast: {
    p: { W:'#F8F8F8', G:'#D0D0D0', E:'#1A1A1A', M:'#AA4444' },
    g: 'WWWWWWWW' +
       'WWWWWWWW' +
       'WWWWWWWW' +
       'WEEWWEEW' +
       'WEWWWEWW' +
       'WWWWWWWW' +
       'WGMMMMGW' +
       'GGGGGGGG'
  },

  iron_golem: {
    p: { I:'#B8B8B0', D:'#8A8A82', V:'#6A8A5A', R:'#CC4444' },
    g: 'IIIIIIII' +
       'IVIIIIVI' +
       'IIIIIIII' +
       'IRDIIRID' +
       'IIIIIIII' +
       'DDDIDDID' +
       'IIIDDDII' +
       'DIIIIIID'
  },

  villager: {
    p: { T:'#C8A070', R:'#6A3A1A', E:'#2A1A0A', H:'#4A2A0A', N:'#B88060' },
    g: 'HHHHHHHH' +
       'HTTTTTTH' +
       'TTTTTTTT' +
       'TETTTTET' +
       'TTNNNTTT' +
       'TTNNNTTT' +
       'TTTTTTTT' +
       'RRRRRRRR'
  },

  wither: {
    p: { K:'#1A0A0A', B:'#3A2A2A', W:'#C8C8C0', P:'#6600CC' },
    g: 'KKWWWWKK' +
       'KWKKKKWK' +
       'BBBBBBBB' +
       'KPPKKPPK' +
       'BBBBBBBB' +
       'KKWKKWKK' +
       'BKKKKKK' + 'B' +
       'KKBBBBKK'
  },

  ender_dragon: {
    p: { P:'#7B2FBE', D:'#2A0044', E:'#FF66FF', B:'#180028', L:'#9E5DD8' },
    g: 'DPPDDPPD' +
       'PDPDPDPD' +
       'BBBBBBBB' +
       'BEEBBEEB' +
       'PLBBBLPP' + // wing-like purple accents
       'BBLBBLBB' +
       'DPBDDBPD' +
       'LLLLLLLL'
  },

};

// ── Avatar skin catalogue ────────────────────────────────────────────────────

const AVATAR_SKINS = [
  { id: 'custom',       name: 'Custom',       icon: '\uD83C\uDFA8' },
  { id: 'steve',        name: 'Steve',        icon: '\uD83E\uDDD1' },
  { id: 'alex',         name: 'Alex',         icon: '\uD83D\uDC69' },
  { id: 'creeper',      name: 'Creeper',      icon: '\uD83D\uDC9A' },
  { id: 'enderman',     name: 'Enderman',     icon: '\uD83D\uDC41\uFE0F' },
  { id: 'skeleton',     name: 'Skeleton',     icon: '\uD83D\uDC80' },
  { id: 'zombie',       name: 'Zombie',       icon: '\uD83E\uDDDF' },
  { id: 'blaze',        name: 'Blaze',        icon: '\uD83D\uDD25' },
  { id: 'ghast',        name: 'Ghast',        icon: '\uD83D\uDC7B' },
  { id: 'iron_golem',   name: 'Iron Golem',   icon: '\uD83E\uDD16' },
  { id: 'villager',     name: 'Villager',     icon: '\uD83D\uDC68\u200D\uD83C\uDF3E' },
  { id: 'wither',       name: 'Wither',       icon: '\uD83D\uDC7F' },
  { id: 'ender_dragon', name: 'Ender Dragon', icon: '\uD83D\uDC09' },
];

// ── Profile frame catalogue ──────────────────────────────────────────────────
// unlockCondition: null = always available, else evaluated by _checkFrameUnlock.

const AVATAR_FRAMES = [
  {
    id:   'none',
    name: 'None',
    hint: '',
    unlockCondition: null,
    style: null,
  },
  {
    id:   'bronze',
    name: 'Bronze',
    hint: 'Reach Level 10',
    unlockCondition: { type: 'level', value: 10 },
    style: { color: '#CD7F32', glow: 'rgba(205,127,50,0.45)', width: 3 },
  },
  {
    id:   'silver',
    name: 'Silver',
    hint: 'Reach Level 25',
    unlockCondition: { type: 'level', value: 25 },
    style: { color: '#C0C0C0', glow: 'rgba(192,192,192,0.4)', width: 3 },
  },
  {
    id:   'gold',
    name: 'Gold',
    hint: 'Reach Level 50',
    unlockCondition: { type: 'level', value: 50 },
    style: { color: '#FFD700', glow: 'rgba(255,215,0,0.6)', width: 3 },
  },
  {
    id:   'diamond',
    name: 'Diamond',
    hint: 'Reach Level 100',
    unlockCondition: { type: 'level', value: 100 },
    style: { color: '#B9F2FF', glow: 'rgba(185,242,255,0.7)', width: 3 },
  },
  {
    id:   'marathon',
    name: 'Marathon Runner',
    hint: 'Complete 50 marathon levels',
    unlockCondition: { type: 'marathon_level', value: 50 },
    style: { color: '#4CAF50', glow: 'rgba(76,175,80,0.5)', width: 3 },
  },
  {
    id:   'zen',
    name: 'Zen Master',
    hint: 'Complete a 30-minute zen session',
    unlockCondition: { type: 'zen_duration', value: 1800 },
    style: { color: '#9B59B6', glow: 'rgba(155,89,182,0.5)', width: 3 },
  },
  {
    id:   'combo_king',
    name: 'Combo King',
    hint: 'Achieve a 10x combo',
    unlockCondition: { type: 'best_combo', value: 10 },
    style: { color: '#FF8C00', glow: 'rgba(255,140,0,0.65)', width: 3 },
  },
  {
    id:   'champion',
    name: 'Champion',
    hint: 'Win 25 battle matches',
    unlockCondition: { type: 'battle_wins', value: 25 },
    style: { color: '#FF4500', glow: 'rgba(255,69,0,0.65)', width: 4, double: true },
  },
];

// ── Storage ──────────────────────────────────────────────────────────────────

function getSelectedAvatar() {
  if (typeof isUsingCustomAvatar === 'function' && isUsingCustomAvatar()) return 'custom';
  try { return localStorage.getItem(AVATAR_SKIN_KEY) || 'steve'; } catch (_) { return 'steve'; }
}

function setSelectedAvatar(id) {
  if (!AVATAR_SKINS.find(function(s) { return s.id === id; })) return;
  if (id === 'custom') {
    // 'custom' is activated by the avatar editor — just reflect via isUsingCustomAvatar()
    if (typeof setUseCustomAvatar === 'function') setUseCustomAvatar(true);
  } else {
    if (typeof setUseCustomAvatar === 'function') setUseCustomAvatar(false);
    try { localStorage.setItem(AVATAR_SKIN_KEY, id); } catch (_) {}
  }
  if (typeof onAutoSync === 'function') onAutoSync();
}

function getSelectedFrame() {
  try { return localStorage.getItem(AVATAR_FRAME_KEY) || 'none'; } catch (_) { return 'none'; }
}

function setSelectedFrame(id) {
  if (!AVATAR_FRAMES.find(function(f) { return f.id === id; })) return;
  try { localStorage.setItem(AVATAR_FRAME_KEY, id); } catch (_) {}
  if (typeof onAutoSync === 'function') onAutoSync();
}

// ── Frame unlock checking ────────────────────────────────────────────────────

function isFrameUnlocked(frameId) {
  var frame = AVATAR_FRAMES.find(function(f) { return f.id === frameId; });
  if (!frame) return false;
  if (!frame.unlockCondition) return true;
  return _checkFrameUnlock(frame.unlockCondition);
}

function _checkFrameUnlock(cond) {
  try {
    switch (cond.type) {
      case 'level': {
        if (typeof getPlayerLevel !== 'function') return false;
        return getPlayerLevel() >= cond.value;
      }
      case 'marathon_level': {
        var raw = localStorage.getItem('mineCtris_marathonBest');
        if (!raw) return false;
        var best = JSON.parse(raw);
        return (best.level || 0) >= cond.value;
      }
      case 'zen_duration': {
        var zraw = localStorage.getItem('mineCtris_zenBest');
        if (!zraw) return false;
        var zbest = JSON.parse(zraw);
        return (zbest.durationSecs || 0) >= cond.value;
      }
      case 'best_combo': {
        // Classic mastery tracks bestCombo in progress object.
        if (typeof loadMastery !== 'function') return false;
        var mastery = loadMastery();
        var modes = ['classic', 'sprint', 'blitz', 'daily', 'survival', 'battle', 'expedition'];
        for (var i = 0; i < modes.length; i++) {
          var ms = mastery[modes[i]];
          if (ms && ms.progress && (ms.progress.bestCombo || 0) >= cond.value) return true;
        }
        return false;
      }
      case 'battle_wins': {
        var mraw = localStorage.getItem('mineCtris_missions');
        if (!mraw) return false;
        var mstate = JSON.parse(mraw);
        return (mstate.progress && (mstate.progress.battle_wins || 0) >= cond.value);
      }
      default: return false;
    }
  } catch (_) { return false; }
}

// ── Canvas rendering ─────────────────────────────────────────────────────────

/**
 * Draw an 8×8 pixel-art avatar (plus optional frame border) onto a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {string} skinId
 * @param {string} frameId
 */
function renderAvatarToCanvas(canvas, skinId, frameId) {
  // Delegate custom avatar to avatar.js renderer
  if (skinId === 'custom') {
    if (typeof renderCustomAvatarToCanvas === 'function') {
      var px = typeof getCustomAvatarPixels === 'function' ? getCustomAvatarPixels() : null;
      renderCustomAvatarToCanvas(canvas, px, frameId);
      return;
    }
    skinId = 'steve'; // graceful fallback if avatar.js not loaded
  }

  var size = canvas.width; // assumes square
  var ctx  = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  // Background
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, size, size);

  // Pixel art face
  var def = _AVATAR_DEFS[skinId] || _AVATAR_DEFS['steve'];
  var cellSize = Math.floor(size / 8);
  var offsetX  = Math.floor((size - cellSize * 8) / 2);
  var offsetY  = offsetX;
  var g = def.g, pal = def.p;
  for (var i = 0; i < 64; i++) {
    var ch = g[i];
    var color = pal[ch];
    if (!color) continue;
    var col = i % 8;
    var row = Math.floor(i / 8);
    ctx.fillStyle = color;
    ctx.fillRect(offsetX + col * cellSize, offsetY + row * cellSize, cellSize, cellSize);
  }

  // Frame border
  if (frameId && frameId !== 'none') {
    _drawFrame(ctx, size, frameId);
  }
}

function _drawFrame(ctx, size, frameId) {
  var frame = AVATAR_FRAMES.find(function(f) { return f.id === frameId; });
  if (!frame || !frame.style) return;
  var s = frame.style;
  var w = s.width || 3;
  var half = Math.floor(w / 2);

  // Outer glow
  ctx.save();
  ctx.shadowColor  = s.glow || s.color;
  ctx.shadowBlur   = 8;
  ctx.strokeStyle  = s.color;
  ctx.lineWidth    = w;
  ctx.strokeRect(half, half, size - w, size - w);

  if (s.double) {
    ctx.shadowBlur  = 4;
    ctx.lineWidth   = 1;
    ctx.strokeRect(half + w + 1, half + w + 1, size - (w + 1) * 2 - w, size - (w + 1) * 2 - w);
  }
  ctx.restore();
}

/**
 * Return a canvas element with the avatar rendered at the given size.
 * Caller can use .toDataURL() or append to DOM.
 */
function createAvatarCanvas(skinId, frameId, size) {
  var c = document.createElement('canvas');
  c.width  = size;
  c.height = size;
  renderAvatarToCanvas(c, skinId || getSelectedAvatar(), frameId !== undefined ? frameId : getSelectedFrame(), size);
  return c;
}

// ── Profile UI: avatar selector ──────────────────────────────────────────────

function renderAvatarSelectorHtml() {
  var selectedSkin  = getSelectedAvatar();
  var selectedFrame = getSelectedFrame();

  var html = '<div class="av-section">';
  html += '<div class="av-preview-area">';
  html += '<canvas id="av-preview-canvas" width="96" height="96" class="av-preview-canvas"></canvas>';
  html += '</div>';

  // Edit custom avatar button (always shown)
  html += '<button class="av-edit-custom-btn" id="av-edit-custom-btn">&#9998; Create / Edit Custom Avatar</button>';

  // Skin grid
  html += '<div class="av-label">AVATAR SKIN</div>';
  html += '<div class="av-skin-grid">';
  for (var i = 0; i < AVATAR_SKINS.length; i++) {
    var skin = AVATAR_SKINS[i];
    var active = skin.id === selectedSkin ? ' av-skin-active' : '';
    html += '<div class="av-skin-card' + active + '" data-skin-id="' + skin.id + '" title="' + skin.name + '">';
    html += '<canvas class="av-skin-mini" data-skin="' + skin.id + '" width="32" height="32"></canvas>';
    html += '<div class="av-skin-name">' + skin.name + '</div>';
    html += '</div>';
  }
  html += '</div>';

  // Frame grid
  html += '<div class="av-label">PROFILE FRAME</div>';
  html += '<div class="av-frame-grid">';
  for (var j = 0; j < AVATAR_FRAMES.length; j++) {
    var frame  = AVATAR_FRAMES[j];
    var locked = !isFrameUnlocked(frame.id);
    var activeF = frame.id === selectedFrame ? ' av-frame-active' : '';
    var lockedCls = locked ? ' av-frame-locked' : '';
    html += '<div class="av-frame-card' + activeF + lockedCls + '" data-frame-id="' + frame.id + '" title="' + frame.name + (locked ? ' \uD83D\uDD12 ' + frame.hint : '') + '">';
    html += '<canvas class="av-frame-mini" data-frame="' + frame.id + '" width="32" height="32"></canvas>';
    html += '<div class="av-frame-name">' + frame.name + '</div>';
    if (locked) html += '<div class="av-frame-lock">\uD83D\uDD12 ' + frame.hint + '</div>';
    html += '</div>';
  }
  html += '</div>';

  html += '</div>';
  return html;
}

function mountAvatarSelector(containerEl) {
  if (!containerEl) return;

  // Wire "Edit custom avatar" button
  var editBtn = containerEl.querySelector('#av-edit-custom-btn');
  if (editBtn) {
    editBtn.addEventListener('click', function () {
      if (typeof openAvatarCreator === 'function') openAvatarCreator();
    });
  }

  // Render mini canvases for skins
  var skinMinis = containerEl.querySelectorAll('.av-skin-mini');
  for (var i = 0; i < skinMinis.length; i++) {
    renderAvatarToCanvas(skinMinis[i], skinMinis[i].getAttribute('data-skin'), 'none');
  }

  // Render mini canvases for frames
  var frameMinis = containerEl.querySelectorAll('.av-frame-mini');
  var previewSkin = getSelectedAvatar();
  for (var j = 0; j < frameMinis.length; j++) {
    var fid = frameMinis[j].getAttribute('data-frame');
    renderAvatarToCanvas(frameMinis[j], previewSkin, fid);
  }

  // Render preview
  var preview = containerEl.querySelector('#av-preview-canvas');
  if (preview) renderAvatarToCanvas(preview, getSelectedAvatar(), getSelectedFrame());

  // Skin click handlers
  var skinCards = containerEl.querySelectorAll('.av-skin-card');
  for (var k = 0; k < skinCards.length; k++) {
    skinCards[k].addEventListener('click', function(e) {
      var card = e.currentTarget;
      var skinId = card.getAttribute('data-skin-id');
      setSelectedAvatar(skinId);
      var allSkins = containerEl.querySelectorAll('.av-skin-card');
      for (var m = 0; m < allSkins.length; m++) {
        allSkins[m].classList.toggle('av-skin-active', allSkins[m].getAttribute('data-skin-id') === skinId);
      }
      var prev2 = containerEl.querySelector('#av-preview-canvas');
      if (prev2) renderAvatarToCanvas(prev2, skinId, getSelectedFrame());
      // Re-render frame minis with new skin
      var fMinis = containerEl.querySelectorAll('.av-frame-mini');
      for (var n = 0; n < fMinis.length; n++) {
        renderAvatarToCanvas(fMinis[n], skinId, fMinis[n].getAttribute('data-frame'));
      }
    });
  }

  // Frame click handlers
  var frameCards = containerEl.querySelectorAll('.av-frame-card:not(.av-frame-locked)');
  for (var f = 0; f < frameCards.length; f++) {
    frameCards[f].addEventListener('click', function(e) {
      var card = e.currentTarget;
      var frameId = card.getAttribute('data-frame-id');
      setSelectedFrame(frameId);
      var allFrames = containerEl.querySelectorAll('.av-frame-card');
      for (var m = 0; m < allFrames.length; m++) {
        allFrames[m].classList.toggle('av-frame-active', allFrames[m].getAttribute('data-frame-id') === frameId);
      }
      var prev3 = containerEl.querySelector('#av-preview-canvas');
      if (prev3) renderAvatarToCanvas(prev3, getSelectedAvatar(), frameId);
    });
  }
}

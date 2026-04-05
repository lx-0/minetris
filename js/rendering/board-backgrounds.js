// Board backgrounds — animated canvas scenes behind the game board.
// Canvas sits above the CSS parallax layers but below the Three.js renderer.
// Throttled to 30fps. Five biome scenes with 3-layer parallax + particles.
// Requires: state.js (isZenMode, isBattleMode, isMarathonMode, marathonLevel,
//           activeBiomeId), parallax-background.js (PARALLAX_BIOME_KEY)

const BB_STYLE_KEY   = 'mineCtris_boardBgStyle';   // 'animated' | 'static' | 'off'
const BB_SCENE_KEY   = 'mineCtris_boardBgScene';   // 'random' | scene id

// ── Constants ─────────────────────────────────────────────────────────────────

const BB_FPS      = 30;
const BB_INTERVAL = 1 / BB_FPS; // seconds between frames

// Parallax multipliers for each depth layer
const BB_PAR_FAR  = 0.08;
const BB_PAR_MID  = 0.28;
const BB_PAR_NEAR = 0.60;

// Auto-scroll speed (px/s) when mouse hasn't moved for 3 seconds
const BB_AUTO_SCROLL_SPEED = 20;
const BB_MOUSE_IDLE_SEC    = 3;

// Marathon level thresholds for scene transition
const BB_MARATHON_NETHER = 15;
const BB_MARATHON_END    = 30;

const BB_SCENES = ['forest', 'ocean', 'nether', 'desert', 'end'];

// Expedition biome → board background scene
const BB_BIOME_MAP = {
  forest: 'forest',
  stone:  'forest',
  nether: 'nether',
  ice:    'forest',
  desert: 'desert',
};

// ── Module state ──────────────────────────────────────────────────────────────

let _bbCanvas      = null;
let _bbCtx         = null;
let _bbStyle       = 'animated'; // 'animated' | 'static' | 'off'
let _bbScenePref   = 'random';   // player preference
let _bbScene       = 'forest';   // actively rendered scene
let _bbInitialized = false;
let _bbAcc         = 0;          // throttle accumulator (seconds)
let _bbStaticDone  = false;      // static frame already drawn

// Mouse / auto-scroll parallax
let _bbMouseNX      = 0.5;  // normalized 0..1
let _bbMouseLastSec = 0;    // elapsed time when mouse last moved
let _bbAutoScroll   = 0;    // accumulated px

// Particles
let _bbParticles = [];

// ── Init & teardown ───────────────────────────────────────────────────────────

function initBoardBg() {
  _bbCanvas = document.getElementById('board-bg-canvas');
  if (!_bbCanvas) return;

  _bbCtx = _bbCanvas.getContext('2d');
  _bbResizeCanvas();

  _bbLoadSettings();

  // Listen for mouse move to drive parallax
  document.addEventListener('mousemove', function(e) {
    _bbMouseNX      = Math.max(0, Math.min(1, e.clientX / window.innerWidth));
    _bbMouseLastSec = typeof clock !== 'undefined' ? clock.getElapsedTime() : (performance.now() / 1000);
  });

  window.addEventListener('resize', _bbResizeCanvas);

  _bbPickScene();
  _bbSpawnInitialParticles();
  _bbInitialized = true;
}

function _bbResizeCanvas() {
  if (!_bbCanvas) return;
  _bbCanvas.width  = window.innerWidth;
  _bbCanvas.height = window.innerHeight;
  _bbStaticDone = false; // redraw static on resize
}

// ── Settings ──────────────────────────────────────────────────────────────────

function _bbLoadSettings() {
  try {
    const s = localStorage.getItem(BB_STYLE_KEY);
    if (s === 'animated' || s === 'static' || s === 'off') _bbStyle = s;
    const sc = localStorage.getItem(BB_SCENE_KEY);
    if (sc && (sc === 'random' || BB_SCENES.includes(sc))) _bbScenePref = sc;
  } catch (_) {}
  _bbApplyVisibility();
  _bbUpdateSettingsUI();
}

function setBoardBgStyle(style) {
  _bbStyle = style;
  try { localStorage.setItem(BB_STYLE_KEY, style); } catch (_) {}
  _bbStaticDone = false;
  _bbApplyVisibility();
  _bbUpdateSettingsUI();
}

function setBoardBgScene(sceneId) {
  _bbScenePref = sceneId;
  try { localStorage.setItem(BB_SCENE_KEY, sceneId); } catch (_) {}
  if (sceneId !== 'random') {
    _bbScene = sceneId;
    _bbSpawnInitialParticles();
    _bbStaticDone = false;
  } else {
    _bbPickScene();
  }
}

function _bbApplyVisibility() {
  if (!_bbCanvas) return;
  _bbCanvas.style.display = (_bbStyle === 'off') ? 'none' : 'block';
}

function _bbUpdateSettingsUI() {
  document.querySelectorAll('.bb-scene-btn').forEach(function(btn) {
    btn.classList.toggle('bb-scene-btn-selected', btn.dataset.scene === _bbScenePref);
  });
  const styleSelect = document.getElementById('board-bg-style-select');
  if (styleSelect) styleSelect.value = _bbStyle;
}

// ── Scene selection ───────────────────────────────────────────────────────────

function _bbPickScene() {
  if (_bbScenePref === 'random') {
    _bbScene = BB_SCENES[Math.floor(Math.random() * BB_SCENES.length)];
  } else {
    _bbScene = _bbScenePref;
  }
  _bbSpawnInitialParticles();
  _bbStaticDone = false;
}

/**
 * Derive the scene to render this frame, taking game mode into account.
 * Marathon overrides progress: Forest → Nether (lvl 15) → End (lvl 30).
 */
function _bbResolveScene() {
  // Expedition biome takes priority
  if (typeof activeBiomeId !== 'undefined' && activeBiomeId) {
    return BB_BIOME_MAP[activeBiomeId] || 'forest';
  }
  // Marathon evolution
  if (typeof isMarathonMode !== 'undefined' && isMarathonMode) {
    const lvl = typeof marathonLevel !== 'undefined' ? marathonLevel : 1;
    if (lvl >= BB_MARATHON_END)    return 'end';
    if (lvl >= BB_MARATHON_NETHER) return 'nether';
    return 'forest';
  }
  return _bbScene;
}

// Called when a new game starts (randomise if in random mode)
function onBoardBgGameStart() {
  if (_bbScenePref === 'random') _bbPickScene();
  _bbAutoScroll = 0;
  _bbStaticDone = false;
}

// ── Update (called from game-loop.js at 30fps) ────────────────────────────────

function updateBoardBg(delta) {
  if (!_bbInitialized || !_bbCtx) return;
  if (_bbStyle === 'off') return;

  if (_bbStyle === 'static') {
    if (!_bbStaticDone) {
      _bbRenderFrame(0, 0.5, false);
      _bbStaticDone = true;
    }
    return;
  }

  // Throttle to BB_FPS
  _bbAcc += delta;
  if (_bbAcc < BB_INTERVAL) return;
  const dt = _bbAcc;
  _bbAcc = 0;

  // Check reduced motion preference
  const prefReduced = typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefReduced) {
    if (!_bbStaticDone) {
      _bbRenderFrame(0, 0.5, false);
      _bbStaticDone = true;
    }
    return;
  }

  // Update auto-scroll when mouse idle
  const nowSec = typeof clock !== 'undefined' ? clock.getElapsedTime() : (performance.now() / 1000);
  const mouseIdle = (nowSec - _bbMouseLastSec) > BB_MOUSE_IDLE_SEC;
  if (mouseIdle) {
    _bbAutoScroll += dt * BB_AUTO_SCROLL_SPEED;
  }

  // Update particles
  _bbTickParticles(dt, _bbResolveScene());

  // Render
  _bbRenderFrame(nowSec, dt, true);
}

// ── Render dispatcher ─────────────────────────────────────────────────────────

function _bbRenderFrame(t, dt, animated) {
  if (!_bbCtx) return;
  const w = _bbCanvas.width;
  const h = _bbCanvas.height;
  const scene = _bbResolveScene();

  // Mode config
  const isZen    = typeof isZenMode    !== 'undefined' && isZenMode;
  const isBattle = typeof isBattleMode !== 'undefined' && isBattleMode;
  const modeSpeed = isZen ? 0.4 : (isBattle ? 1.8 : 1.0);
  const modeDark  = isBattle ? 0.35 : 0.0;  // darken factor 0..1

  // Parallax offsets
  const mouseNX  = _bbMouseNX;
  const scrollPx = _bbAutoScroll;
  const farX  = (mouseNX - 0.5) * -w * 0.05 - scrollPx * BB_PAR_FAR;
  const midX  = (mouseNX - 0.5) * -w * 0.18 - scrollPx * BB_PAR_MID;
  const nearX = (mouseNX - 0.5) * -w * 0.40 - scrollPx * BB_PAR_NEAR;

  _bbCtx.clearRect(0, 0, w, h);

  switch (scene) {
    case 'forest':  _bbDrawForest(w, h, t, farX, midX, nearX, animated, modeSpeed, modeDark); break;
    case 'ocean':   _bbDrawOcean( w, h, t, farX, midX, nearX, animated, modeSpeed, modeDark); break;
    case 'nether':  _bbDrawNether(w, h, t, farX, midX, nearX, animated, modeSpeed, modeDark); break;
    case 'desert':  _bbDrawDesert(w, h, t, farX, midX, nearX, animated, modeSpeed, modeDark); break;
    case 'end':     _bbDrawEnd(   w, h, t, farX, midX, nearX, animated, modeSpeed, modeDark); break;
    default:        _bbDrawForest(w, h, t, farX, midX, nearX, animated, modeSpeed, modeDark); break;
  }

  // Render particles on top of near layer
  _bbRenderParticles(w, h, scene);

  // Battle darkening vignette
  if (modeDark > 0) {
    _bbCtx.fillStyle = `rgba(0,0,0,${modeDark * 0.6})`;
    _bbCtx.fillRect(0, 0, w, h);
  }
}

// ── Forest scene ──────────────────────────────────────────────────────────────

function _bbDrawForest(w, h, t, farX, midX, nearX, animated, spd, dark) {
  const ctx = _bbCtx;

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0,   '#1a3a6e');
  sky.addColorStop(0.5, '#3a7fbf');
  sky.addColorStop(0.72, '#6baad8');
  sky.addColorStop(0.72, '#3d7a28');
  sky.addColorStop(1,   '#2d5c1e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // FAR: Distant cloud silhouettes + distant hills
  ctx.save();
  ctx.translate(((farX % w) + w) % w - w, 0);
  for (let rep = 0; rep < 3; rep++) {
    const ox = rep * w;
    // Distant hill silhouette
    ctx.fillStyle = '#2a5e1a';
    ctx.beginPath();
    ctx.moveTo(ox, h);
    ctx.bezierCurveTo(ox + w * 0.1, h * 0.58, ox + w * 0.25, h * 0.48, ox + w * 0.38, h * 0.55);
    ctx.bezierCurveTo(ox + w * 0.5,  h * 0.45, ox + w * 0.65, h * 0.52, ox + w * 0.78, h * 0.48);
    ctx.bezierCurveTo(ox + w * 0.88, h * 0.44, ox + w * 0.95, h * 0.5, ox + w, h * 0.55);
    ctx.lineTo(ox + w, h);
    ctx.closePath();
    ctx.fill();
    // Clouds
    _bbCloud(ctx, ox + w * 0.15, h * 0.18, 1.0, animated ? Math.sin(t * 0.08 + 0.5) * 3 : 0);
    _bbCloud(ctx, ox + w * 0.55, h * 0.10, 0.7, animated ? Math.sin(t * 0.06 + 1.2) * 2 : 0);
    _bbCloud(ctx, ox + w * 0.82, h * 0.22, 0.85, animated ? Math.sin(t * 0.07 + 2.0) * 2.5 : 0);
  }
  ctx.restore();

  // MID: Trees
  ctx.save();
  ctx.translate(((midX % w) + w) % w - w, 0);
  for (let rep = 0; rep < 3; rep++) {
    const ox = rep * w;
    _bbForestMid(ctx, ox, w, h, t, animated, spd);
  }
  ctx.restore();

  // NEAR: Foreground shrubs
  ctx.save();
  ctx.translate(((nearX % w) + w) % w - w, 0);
  for (let rep = 0; rep < 3; rep++) {
    const ox = rep * w;
    ctx.fillStyle = '#1a4a0d';
    ctx.beginPath();
    ctx.moveTo(ox, h);
    ctx.bezierCurveTo(ox + w * 0.08, h * 0.85, ox + w * 0.18, h * 0.82, ox + w * 0.25, h * 0.88);
    ctx.bezierCurveTo(ox + w * 0.35, h * 0.80, ox + w * 0.5,  h * 0.84, ox + w * 0.6,  h * 0.82);
    ctx.bezierCurveTo(ox + w * 0.72, h * 0.78, ox + w * 0.85, h * 0.84, ox + w, h * 0.82);
    ctx.lineTo(ox + w, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function _bbForestMid(ctx, ox, w, h, t, animated, spd) {
  const trees = [0.08, 0.18, 0.30, 0.42, 0.54, 0.66, 0.78, 0.90];
  trees.forEach(function(frac, i) {
    const x  = ox + frac * w;
    const th = h * (0.38 + (i % 3) * 0.05);
    const tw = th * 0.28;
    const sway = animated ? Math.sin(t * 0.6 * spd + i * 1.3) * 3 : 0;

    // Trunk
    ctx.fillStyle = '#3d2210';
    const trunkW = tw * 0.18;
    ctx.fillRect(x - trunkW / 2 + sway * 0.2, h - th * 0.3, trunkW, th * 0.32);

    // Canopy layers
    const greens = ['#1a5c0e', '#247a14', '#2d9018'];
    greens.forEach(function(clr, li) {
      const ly  = h - th * (0.3 + li * 0.28) - sway * (li + 1) * 0.4;
      const lw  = tw * (1.1 - li * 0.22);
      const lh  = th * 0.32;
      ctx.fillStyle = clr;
      ctx.beginPath();
      ctx.moveTo(x + sway * (li + 1) * 0.3, ly - lh);
      ctx.lineTo(x - lw / 2, ly);
      ctx.lineTo(x + lw / 2, ly);
      ctx.closePath();
      ctx.fill();
    });
  });
}

// ── Ocean scene ───────────────────────────────────────────────────────────────

function _bbDrawOcean(w, h, t, farX, midX, nearX, animated, spd, dark) {
  const ctx = _bbCtx;

  // Underwater gradient
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0,   '#001a3a');
  bg.addColorStop(0.3, '#012a5c');
  bg.addColorStop(0.7, '#023878');
  bg.addColorStop(1,   '#011d4a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Surface light rays (far layer)
  if (animated) {
    ctx.save();
    ctx.globalAlpha = 0.07 + Math.sin(t * 0.5) * 0.03;
    ctx.fillStyle = '#7aaee8';
    const rayCount = 6;
    for (let i = 0; i < rayCount; i++) {
      const rx = ((farX + (i * w / rayCount)) % w + w) % w;
      const angle = (i % 2 === 0 ? -1 : 1) * 0.12 + Math.sin(t * 0.2 + i) * 0.04;
      ctx.save();
      ctx.translate(rx, 0);
      ctx.rotate(angle);
      ctx.fillRect(-18, 0, 36, h * 0.6);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // MID: Coral silhouettes + sea floor
  ctx.save();
  ctx.translate(((midX % w) + w) % w - w, 0);
  for (let rep = 0; rep < 3; rep++) {
    const ox = rep * w;
    // Sea floor
    ctx.fillStyle = '#022040';
    ctx.beginPath();
    ctx.moveTo(ox, h);
    ctx.bezierCurveTo(ox + w * 0.2, h * 0.88, ox + w * 0.45, h * 0.85, ox + w * 0.6, h * 0.88);
    ctx.bezierCurveTo(ox + w * 0.75, h * 0.91, ox + w * 0.9, h * 0.87, ox + w, h * 0.89);
    ctx.lineTo(ox + w, h);
    ctx.closePath();
    ctx.fill();

    // Coral
    const corals = [0.1, 0.25, 0.45, 0.62, 0.8];
    corals.forEach(function(frac, i) {
      const cx  = ox + frac * w;
      const ch  = h * (0.12 + (i % 3) * 0.04);
      const sway = animated ? Math.sin(t * 0.4 * spd + i * 1.1) * 4 : 0;
      ctx.strokeStyle = i % 2 === 0 ? '#a0264a' : '#e05a20';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, h * 0.88);
      ctx.bezierCurveTo(cx + sway, h * 0.88 - ch * 0.5, cx - sway, h * 0.88 - ch * 0.8, cx + sway * 0.5, h * 0.88 - ch);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + sway * 0.5, h * 0.88 - ch, 5 + i % 3 * 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    });
  }
  ctx.restore();

  // NEAR: Seaweed
  ctx.save();
  ctx.translate(((nearX % w) + w) % w - w, 0);
  for (let rep = 0; rep < 3; rep++) {
    const ox = rep * w;
    [0.05, 0.22, 0.4, 0.58, 0.75, 0.92].forEach(function(frac, i) {
      const sx   = ox + frac * w;
      const sh   = h * (0.14 + (i % 3) * 0.06);
      const sway = animated ? Math.sin(t * 0.5 * spd + i * 0.9) * 8 : 0;
      ctx.strokeStyle = i % 3 === 0 ? '#0a5a2a' : '#0e7a38';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sx, h);
      ctx.bezierCurveTo(sx + sway, h - sh * 0.4, sx - sway, h - sh * 0.7, sx + sway * 0.3, h - sh);
      ctx.stroke();
    });
  }
  ctx.restore();
}

// ── Nether scene ──────────────────────────────────────────────────────────────

function _bbDrawNether(w, h, t, farX, midX, nearX, animated, spd, dark) {
  const ctx = _bbCtx;

  // Red-orange gradient
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0,   '#1a0000');
  bg.addColorStop(0.4, '#3a0800');
  bg.addColorStop(0.75, '#6e1200');
  bg.addColorStop(1,   '#8f2000');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Lava glow at horizon
  if (animated) {
    const glow = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, w * 0.7);
    glow.addColorStop(0,   'rgba(255,100,0,0.25)');
    glow.addColorStop(0.5, 'rgba(200,40,0,0.10)');
    glow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }

  // FAR: Basalt column silhouettes
  ctx.save();
  ctx.translate(((farX % w) + w) % w - w, 0);
  ctx.fillStyle = '#0d0000';
  for (let rep = 0; rep < 3; rep++) {
    const ox = rep * w;
    [0.05, 0.15, 0.28, 0.38, 0.52, 0.64, 0.76, 0.88].forEach(function(frac, i) {
      const bx = ox + frac * w;
      const bh = h * (0.25 + (i % 4) * 0.07);
      const bw = w * 0.03;
      ctx.fillRect(bx, h - bh, bw, bh);
    });
  }
  ctx.restore();

  // MID: Lava pool + netherrack silhouette
  ctx.save();
  ctx.translate(((midX % w) + w) % w - w, 0);
  for (let rep = 0; rep < 3; rep++) {
    const ox = rep * w;
    // Netherrack floor
    ctx.fillStyle = '#1a0500';
    ctx.beginPath();
    ctx.moveTo(ox, h);
    ctx.bezierCurveTo(ox + w * 0.12, h * 0.82, ox + w * 0.28, h * 0.78, ox + w * 0.4, h * 0.82);
    ctx.bezierCurveTo(ox + w * 0.55, h * 0.75, ox + w * 0.7,  h * 0.80, ox + w * 0.85, h * 0.76);
    ctx.bezierCurveTo(ox + w * 0.92, h * 0.74, ox + w, h * 0.78, ox + w, h);
    ctx.closePath();
    ctx.fill();

    // Lava glow pools
    const lavaY  = h * 0.82;
    const pulse  = animated ? 0.12 + Math.sin(t * 1.2 * spd) * 0.04 : 0.12;
    const lavaGrad = ctx.createLinearGradient(ox, lavaY - 10, ox, lavaY + 20);
    lavaGrad.addColorStop(0, `rgba(255,120,0,${pulse})`);
    lavaGrad.addColorStop(1, 'rgba(180,40,0,0)');
    ctx.fillStyle = lavaGrad;
    ctx.fillRect(ox, lavaY - 10, w, 30);
  }
  ctx.restore();

  // NEAR: Dark foreground rocks
  ctx.save();
  ctx.translate(((nearX % w) + w) % w - w, 0);
  for (let rep = 0; rep < 3; rep++) {
    const ox = rep * w;
    ctx.fillStyle = '#0a0000';
    ctx.beginPath();
    ctx.moveTo(ox, h);
    ctx.bezierCurveTo(ox + w * 0.1, h * 0.90, ox + w * 0.2, h * 0.88, ox + w * 0.3, h * 0.92);
    ctx.bezierCurveTo(ox + w * 0.42, h * 0.86, ox + w * 0.55, h * 0.90, ox + w * 0.65, h * 0.88);
    ctx.bezierCurveTo(ox + w * 0.78, h * 0.84, ox + w * 0.9, h * 0.90, ox + w, h * 0.88);
    ctx.lineTo(ox + w, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ── Desert scene ──────────────────────────────────────────────────────────────

function _bbDrawDesert(w, h, t, farX, midX, nearX, animated, spd, dark) {
  const ctx = _bbCtx;

  // Sandy sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0,   '#1a3060');
  sky.addColorStop(0.45, '#e8902a');
  sky.addColorStop(0.65, '#f0c060');
  sky.addColorStop(0.65, '#c8a040');
  sky.addColorStop(1,   '#9a7828');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Sun disc (far layer)
  ctx.save();
  ctx.translate(farX * 0.3, 0);
  ctx.fillStyle = '#ffe060';
  ctx.beginPath();
  ctx.arc(w * 0.75, h * 0.22, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,220,80,0.25)';
  ctx.beginPath();
  ctx.arc(w * 0.75, h * 0.22, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // FAR: Distant dunes
  ctx.save();
  ctx.translate(((farX % w) + w) % w - w, 0);
  for (let rep = 0; rep < 3; rep++) {
    const ox = rep * w;
    ctx.fillStyle = '#b08020';
    ctx.beginPath();
    ctx.moveTo(ox, h);
    ctx.bezierCurveTo(ox + w * 0.15, h * 0.60, ox + w * 0.3, h * 0.54, ox + w * 0.45, h * 0.62);
    ctx.bezierCurveTo(ox + w * 0.58, h * 0.52, ox + w * 0.72, h * 0.58, ox + w * 0.85, h * 0.55);
    ctx.bezierCurveTo(ox + w * 0.92, h * 0.52, ox + w, h * 0.56, ox + w, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // MID: Closer dunes + cactus
  ctx.save();
  ctx.translate(((midX % w) + w) % w - w, 0);
  for (let rep = 0; rep < 3; rep++) {
    const ox = rep * w;
    ctx.fillStyle = '#c89030';
    ctx.beginPath();
    ctx.moveTo(ox, h);
    ctx.bezierCurveTo(ox + w * 0.1, h * 0.72, ox + w * 0.25, h * 0.66, ox + w * 0.38, h * 0.74);
    ctx.bezierCurveTo(ox + w * 0.5,  h * 0.64, ox + w * 0.65, h * 0.70, ox + w * 0.8,  h * 0.66);
    ctx.bezierCurveTo(ox + w * 0.9,  h * 0.62, ox + w, h * 0.68, ox + w, h);
    ctx.closePath();
    ctx.fill();

    // Cacti
    [0.15, 0.42, 0.70].forEach(function(frac, i) {
      const cx = ox + frac * w;
      const ch = h * (0.14 + (i % 2) * 0.04);
      ctx.fillStyle = '#2d6e28';
      ctx.fillRect(cx - 8, h * 0.68 - ch, 16, ch);
      ctx.fillRect(cx - 22, h * 0.68 - ch * 0.6, 14, 12);
      ctx.fillRect(cx + 8,  h * 0.68 - ch * 0.5, 14, 12);
    });
  }
  ctx.restore();

  // NEAR: Sandstorm haze at ground
  if (animated) {
    const haze = ctx.createLinearGradient(0, h * 0.82, 0, h);
    haze.addColorStop(0, 'rgba(200,160,60,0)');
    haze.addColorStop(1, `rgba(180,140,40,${0.18 + Math.sin(t * 0.8 * spd) * 0.06})`);
    ctx.fillStyle = haze;
    ctx.fillRect(0, h * 0.82, w, h * 0.18);
  }

  // NEAR: Near dune
  ctx.save();
  ctx.translate(((nearX % w) + w) % w - w, 0);
  for (let rep = 0; rep < 3; rep++) {
    const ox = rep * w;
    ctx.fillStyle = '#a87828';
    ctx.beginPath();
    ctx.moveTo(ox, h);
    ctx.bezierCurveTo(ox + w * 0.12, h * 0.84, ox + w * 0.28, h * 0.80, ox + w * 0.4, h * 0.86);
    ctx.bezierCurveTo(ox + w * 0.55, h * 0.78, ox + w * 0.7, h * 0.84, ox + w * 0.85, h * 0.80);
    ctx.bezierCurveTo(ox + w * 0.93, h * 0.77, ox + w, h * 0.82, ox + w, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ── End scene ─────────────────────────────────────────────────────────────────

function _bbDrawEnd(w, h, t, farX, midX, nearX, animated, spd, dark) {
  const ctx = _bbCtx;

  // Deep void
  ctx.fillStyle = '#04001a';
  ctx.fillRect(0, 0, w, h);

  // Star field (static-ish)
  ctx.save();
  ctx.translate(((farX * 0.5) % w + w) % w - w, 0);
  const rng = _bbSeededRng(42);
  for (let i = 0; i < 120; i++) {
    const sx  = rng() * w * 2;
    const sy  = rng() * h * 0.75;
    const sr  = rng() * 1.5 + 0.3;
    const sa  = animated ? 0.4 + Math.sin(t * 0.5 * spd + i) * 0.25 : 0.5;
    const hue = rng() > 0.7 ? '#cc88ff' : '#ffffff';
    ctx.globalAlpha = sa;
    ctx.fillStyle = hue;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // End portal glow (ambient)
  const glowPulse = animated ? 0.18 + Math.sin(t * 0.4 * spd) * 0.06 : 0.18;
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, w * 0.35);
  glow.addColorStop(0, `rgba(80,0,160,${glowPulse})`);
  glow.addColorStop(0.5, `rgba(40,0,80,${glowPulse * 0.5})`);
  glow.addColorStop(1,  'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // MID: Floating island fragments
  ctx.save();
  ctx.translate(((midX % w) + w) % w - w, 0);
  const islandRng = _bbSeededRng(77);
  for (let rep = 0; rep < 3; rep++) {
    const ox = rep * w;
    for (let i = 0; i < 5; i++) {
      const ix = ox + islandRng() * w;
      const iy = h * (0.3 + islandRng() * 0.35);
      const iw = w * (0.04 + islandRng() * 0.06);
      const ih = iw * 0.4;
      const bob = animated ? Math.sin(t * 0.3 * spd + i * 1.5) * 4 : 0;

      ctx.fillStyle = '#1a0038';
      ctx.beginPath();
      ctx.ellipse(ix, iy + bob, iw, ih, 0, 0, Math.PI * 2);
      ctx.fill();
      // Grass top
      ctx.fillStyle = '#3a0080';
      ctx.fillRect(ix - iw, iy + bob - ih * 0.6, iw * 2, ih * 0.4);
    }
  }
  ctx.restore();

  // NEAR: Void mist at bottom
  const mist = ctx.createLinearGradient(0, h * 0.75, 0, h);
  mist.addColorStop(0, 'rgba(20,0,50,0)');
  mist.addColorStop(1, 'rgba(10,0,40,0.6)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, h * 0.75, w, h * 0.25);
}

// ── Particle system ───────────────────────────────────────────────────────────

const BB_MAX_PARTICLES = 60;

function _bbSpawnInitialParticles() {
  _bbParticles = [];
  const scene = _bbScene;
  const count = scene === 'ocean' ? 40 : (scene === 'end' ? 50 : 30);
  for (let i = 0; i < count; i++) {
    _bbParticles.push(_bbMakeParticle(scene, true));
  }
}

function _bbMakeParticle(scene, spread) {
  const w = _bbCanvas ? _bbCanvas.width  : window.innerWidth;
  const h = _bbCanvas ? _bbCanvas.height : window.innerHeight;
  const x = spread ? Math.random() * w : (Math.random() < 0.5 ? -10 : w + 10);
  let p = { x, y: Math.random() * h, life: 1, maxLife: 1, r: 2, vx: 0, vy: 0, color: '#fff', alpha: 0.6 };

  switch (scene) {
    case 'forest':
      p.y     = spread ? Math.random() * h * 0.6 : -10;
      p.x     = Math.random() * w;
      p.vy    = 25 + Math.random() * 20;
      p.vx    = (Math.random() - 0.5) * 15;
      p.r     = 3 + Math.random() * 3;
      p.color = Math.random() > 0.5 ? '#3a9922' : '#f0a030';
      p.maxLife = 4 + Math.random() * 4;
      p.life  = spread ? Math.random() * p.maxLife : p.maxLife;
      break;
    case 'ocean':
      p.y  = spread ? h * 0.3 + Math.random() * h * 0.65 : h + 10;
      p.vy = -(15 + Math.random() * 25);
      p.vx = (Math.random() - 0.5) * 8;
      p.r  = 2 + Math.random() * 3;
      p.color = '#88ccff';
      p.alpha = 0.3 + Math.random() * 0.4;
      p.maxLife = 3 + Math.random() * 5;
      p.life = spread ? Math.random() * p.maxLife : p.maxLife;
      break;
    case 'nether':
      p.y  = spread ? h * 0.4 + Math.random() * h * 0.5 : h * 0.9 + 10;
      p.vy = -(30 + Math.random() * 50);
      p.vx = (Math.random() - 0.5) * 20;
      p.r  = 1 + Math.random() * 2.5;
      p.color = Math.random() > 0.4 ? '#ff8020' : '#ffcc00';
      p.alpha = 0.7 + Math.random() * 0.3;
      p.maxLife = 1.5 + Math.random() * 2;
      p.life = spread ? Math.random() * p.maxLife : p.maxLife;
      break;
    case 'desert':
      p.y  = h * 0.75 + Math.random() * h * 0.25;
      p.vx = 40 + Math.random() * 60;
      p.vy = (Math.random() - 0.5) * 10;
      p.r  = 1 + Math.random() * 2;
      p.color = '#d4a840';
      p.alpha = 0.2 + Math.random() * 0.4;
      p.maxLife = 2 + Math.random() * 3;
      p.life = spread ? Math.random() * p.maxLife : p.maxLife;
      break;
    case 'end':
      p.y  = Math.random() * h;
      p.vx = (Math.random() - 0.5) * 15;
      p.vy = (Math.random() - 0.5) * 15;
      p.r  = 1 + Math.random() * 2;
      p.color = Math.random() > 0.5 ? '#cc88ff' : '#8844ff';
      p.alpha = 0.4 + Math.random() * 0.6;
      p.maxLife = 3 + Math.random() * 6;
      p.life = spread ? Math.random() * p.maxLife : p.maxLife;
      break;
  }
  p._scene = scene;
  return p;
}

function _bbTickParticles(dt, scene) {
  const isZen    = typeof isZenMode    !== 'undefined' && isZenMode;
  const isBattle = typeof isBattleMode !== 'undefined' && isBattleMode;
  const spd = isZen ? 0.45 : (isBattle ? 1.7 : 1.0);

  const w = _bbCanvas ? _bbCanvas.width  : window.innerWidth;
  const h = _bbCanvas ? _bbCanvas.height : window.innerHeight;

  // Re-spawn if scene changed
  if (_bbParticles.length > 0 && _bbParticles[0]._scene !== scene) {
    _bbScene = scene;
    _bbSpawnInitialParticles();
    return;
  }

  for (let i = _bbParticles.length - 1; i >= 0; i--) {
    const p = _bbParticles[i];
    p.life -= dt * spd;
    p.x += p.vx * dt * spd;
    p.y += p.vy * dt * spd;
    if (p.life <= 0 || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
      _bbParticles.splice(i, 1);
    }
  }

  // Maintain particle count
  const target = isZen ? Math.floor(BB_MAX_PARTICLES * 0.5) : BB_MAX_PARTICLES;
  while (_bbParticles.length < target) {
    _bbParticles.push(_bbMakeParticle(scene, false));
  }
}

function _bbRenderParticles(w, h, scene) {
  const ctx = _bbCtx;
  _bbParticles.forEach(function(p) {
    const lifeFrac = p.life / p.maxLife;
    const alpha    = p.alpha * Math.min(lifeFrac * 3, 1) * Math.min((1 - lifeFrac) * 4, 1);
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = p.color;
    if (scene === 'forest') {
      // Leaf shape (small rotated rect)
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.life * 2);
      ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _bbCloud(ctx, x, y, scale, bob) {
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.beginPath();
  ctx.ellipse(0,    0,    55 * scale, 22 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(-30 * scale, 8 * scale,  30 * scale, 16 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse( 30 * scale, 5 * scale,  36 * scale, 18 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Tiny seeded deterministic RNG (mulberry32). */
function _bbSeededRng(seed) {
  let s = seed >>> 0;
  return function() {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Public API summary ────────────────────────────────────────────────────────
// initBoardBg()           — call once after DOM ready
// updateBoardBg(delta)    — call from game-loop at 30fps
// onBoardBgGameStart()    — call when a new game session starts
// setBoardBgStyle(s)      — 'animated' | 'static' | 'off'
// setBoardBgScene(s)      — 'random' | 'forest' | 'ocean' | 'nether' | 'desert' | 'end'

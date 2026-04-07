// Particle effects system — canvas-based overlay for gameplay visual polish.
// Handles: line-clear bursts, Tetris explosions, T-Spin vortex, combo escalation,
// perfect-clear confetti, level-up radial burst, back-to-back glow trail.
//
// Requires: settings.js (particleIntensityLevel), loaded before this file.

// ── Constants ──────────────────────────────────────────────────────────────────
const PT_MAX = 500;

// ── Global state ──────────────────────────────────────────────────────────────
let particleIntensityLevel = 'medium'; // 'off' | 'low' | 'medium' | 'high'

let _ptCanvas   = null;
let _ptCtx      = null;
let _ptPool     = [];  // { x,y,vx,vy,life,maxLife,color,size,alpha,gravity,rot,rotVel,shape }
let _ptActive   = 0;   // count of live particles at front of pool (dense layout)
let _ptInited   = false;

// ── Init / resize ─────────────────────────────────────────────────────────────

function initParticleSystem() {
  _ptCanvas = document.getElementById('particle-overlay-canvas');
  if (!_ptCanvas) return;
  _ptCtx    = _ptCanvas.getContext('2d');
  // Pre-allocate pool
  for (let i = 0; i < PT_MAX; i++) {
    _ptPool.push({ x:0,y:0,vx:0,vy:0,life:0,maxLife:1,color:'#fff',size:3,alpha:1,gravity:0,rot:0,rotVel:0,shape:'circle' });
  }
  resizeParticleOverlay();
  _ptInited = true;
}

function resizeParticleOverlay() {
  if (!_ptCanvas) return;
  const parent = _ptCanvas.parentElement;
  if (!parent) return;
  _ptCanvas.width  = parent.clientWidth;
  _ptCanvas.height = parent.clientHeight;
}

// ── Intensity helpers ──────────────────────────────────────────────────────────

function _ptMult() {
  if (particleIntensityLevel === 'off')    return 0;
  if (particleIntensityLevel === 'low')    return 0.35;
  if (particleIntensityLevel === 'high')   return 1.0;
  return 0.65; // medium
}

function _ptEnabled() {
  if (typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled) return false;
  return particleIntensityLevel !== 'off';
}

// ── Board coordinate helpers ───────────────────────────────────────────────────
// Board occupies the center ~40% of canvas width and ~84% of canvas height.

function _ptBoardBounds() {
  const W = _ptCanvas.width, H = _ptCanvas.height;
  return {
    left:  W * 0.30, right: W * 0.70,
    top:   H * 0.08, bot:   H * 0.92,
    cx:    W * 0.50, cy:    H * 0.50,
    W, H,
  };
}

// ── Particle spawn ─────────────────────────────────────────────────────────────

function _ptSpawn(x, y, vx, vy, maxLife, color, size, gravity, shape) {
  if (_ptActive >= PT_MAX) return;
  const p       = _ptPool[_ptActive++];
  p.x           = x;
  p.y           = y;
  p.vx          = vx;
  p.vy          = vy;
  p.life        = maxLife;
  p.maxLife     = maxLife;
  p.color       = color || '#ffffff';
  p.size        = size  || 3;
  p.alpha       = 1.0;
  p.gravity     = gravity || 0;
  p.rot         = Math.random() * Math.PI * 2;
  p.rotVel      = (Math.random() - 0.5) * 6;
  p.shape       = shape || 'circle';
}

// ── Update / render ────────────────────────────────────────────────────────────

function updateParticles(delta) {
  if (!_ptInited || !_ptCanvas || !_ptCtx) return;
  if (_ptActive === 0) return;

  const ctx = _ptCtx;
  ctx.clearRect(0, 0, _ptCanvas.width, _ptCanvas.height);

  let alive = 0;
  for (let i = 0; i < _ptActive; i++) {
    const p = _ptPool[i];
    p.life -= delta;
    if (p.life <= 0) continue;

    // Physics
    p.vx  *= 0.97;
    p.vy  += p.gravity * delta;
    p.x   += p.vx * delta;
    p.y   += p.vy * delta;
    p.rot += p.rotVel * delta;

    // Fade out over last 40% of life
    const t = p.life / p.maxLife;
    p.alpha = t < 0.4 ? (t / 0.4) : 1.0;

    // Draw
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.shape === 'rect') {
      ctx.fillRect(-p.size * 0.5, -p.size * 0.25, p.size, p.size * 0.5);
    } else if (p.shape === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(p.size, 0);
      ctx.lineTo(0, p.size);
      ctx.lineTo(-p.size, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Compact: swap live particle to front, keep dead object in pool for reuse
    if (alive !== i) {
      const tmp      = _ptPool[alive];
      _ptPool[alive] = _ptPool[i];
      _ptPool[i]     = tmp;
    }
    alive++;
  }
  _ptActive = alive;
}

// ── Effect: Line Clear Burst ──────────────────────────────────────────────────
// rowFraction: 0=top of board, 1=bottom. hexColor: 0xRRGGBB dominant block color.

function ptLineClearBurst(rowFraction, hexColor, numLines) {
  if (!_ptInited || !_ptEnabled()) return;
  const mult = _ptMult();
  const b    = _ptBoardBounds();
  const y    = b.top + rowFraction * (b.bot - b.top);
  const color = _hexToRgba(hexColor, 1.0);
  const count = Math.round(20 * numLines * mult);

  for (let i = 0; i < count; i++) {
    const fromLeft = Math.random() < 0.5;
    const spawnX   = fromLeft
      ? b.left  + Math.random() * (b.right - b.left) * 0.4
      : b.right - Math.random() * (b.right - b.left) * 0.4;
    const spawnY   = y + (Math.random() - 0.5) * 14;
    const speed    = 80 + Math.random() * 160;
    const angle    = fromLeft
      ? (Math.random() - 0.5) * 1.4 - Math.PI * 0.5
      : (Math.random() - 0.5) * 1.4 + Math.PI * 0.5;
    _ptSpawn(spawnX, spawnY,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      0.4 + Math.random() * 0.25,
      color,
      1.5 + Math.random() * 2.5,
      120, 'circle');
  }
}

// ── Effect: Tetris Explosion ──────────────────────────────────────────────────
// Screen-wide golden burst.

function ptTetrisExplosion() {
  if (!_ptInited || !_ptEnabled()) return;
  const mult  = _ptMult();
  const b     = _ptBoardBounds();
  const count = Math.round(80 * mult);
  const colors = ['#ffd700', '#ffec6e', '#fff176', '#ff8f00', '#ffe57f'];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const speed = 140 + Math.random() * 280;
    const color = colors[Math.floor(Math.random() * colors.length)];
    _ptSpawn(b.cx, b.cy,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      0.6 + Math.random() * 0.5,
      color,
      3 + Math.random() * 3,
      200, 'diamond');
  }
}

// ── Effect: T-Spin Vortex ──────────────────────────────────────────────────────
// Spiral vortex of purple particles centered on board.

function ptTSpinVortex() {
  if (!_ptInited || !_ptEnabled()) return;
  const mult   = _ptMult();
  const b      = _ptBoardBounds();
  const count  = Math.round(48 * mult);
  const colors = ['#aa00ff', '#cc44ff', '#ee88ff', '#ce93d8', '#ffffff'];
  const boardW = b.right - b.left;

  for (let i = 0; i < count; i++) {
    const t      = i / count;
    const angle  = t * Math.PI * 6; // 3 full rotations
    const radius = (0.1 + t * 0.9) * boardW * 0.5;
    const x      = b.cx + Math.cos(angle) * radius;
    const y      = b.cy + Math.sin(angle) * radius * 0.5; // flatten to ellipse
    // Velocity: tangent + inward
    const tang   = angle + Math.PI * 0.5;
    const speed  = 60 + Math.random() * 80;
    const color  = colors[Math.floor(Math.random() * colors.length)];
    _ptSpawn(x, y,
      Math.cos(tang) * speed * (Math.random() < 0.5 ? 1 : -1),
      Math.sin(tang) * speed * 0.5,
      0.5 + Math.random() * 0.4,
      color,
      2 + Math.random() * 2,
      150, 'circle');
  }
}

// ── Effect: Combo Burst ───────────────────────────────────────────────────────
// Escalating intensity with combo count. Called on each combo line clear.

function ptComboBurst(combo, numLines) {
  if (!_ptInited || !_ptEnabled()) return;
  if (combo < 2) return; // only fire on actual combos
  const mult   = _ptMult();
  const b      = _ptBoardBounds();
  const step   = Math.min(combo, 10);
  const count  = Math.round(step * 6 * mult);
  const colors = combo >= 10 ? ['#cc44ff','#ee88ff','#ffffff','#9c27b0']
               : combo >= 5  ? ['#ff3300','#ff6600','#ffaa00','#ffffff']
               : combo >= 3  ? ['#ffd700','#ffee44','#ff8f00']
               :               ['#ffaa00','#ffe080'];

  for (let i = 0; i < count; i++) {
    const x     = b.left + Math.random() * (b.right - b.left);
    const y     = b.bot  - Math.random() * (b.bot - b.top) * 0.7;
    const angle = -(Math.PI * 0.5) + (Math.random() - 0.5) * Math.PI;
    const speed = 80 + Math.random() * 120 * (1 + step * 0.1);
    const color = colors[Math.floor(Math.random() * colors.length)];
    _ptSpawn(x, y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      0.35 + Math.random() * 0.3,
      color,
      2 + Math.random() * 2.5,
      180, 'circle');
  }
}

// ── Effect: Perfect Clear Confetti ────────────────────────────────────────────
// Golden confetti rain from top of screen.

function ptPerfectClearConfetti() {
  if (!_ptInited || !_ptEnabled()) return;
  const mult   = _ptMult();
  const b      = _ptBoardBounds();
  const count  = Math.round(80 * mult);
  const colors = ['#ffd700','#ffec6e','#fff9c4','#a5d6a7','#80deea','#ef9a9a','#ce93d8'];

  for (let i = 0; i < count; i++) {
    const x    = b.left + Math.random() * (b.right - b.left);
    const y    = b.top  - 10 - Math.random() * 30;
    const vx   = (Math.random() - 0.5) * 60;
    const vy   = 30 + Math.random() * 60;
    const color = colors[Math.floor(Math.random() * colors.length)];
    _ptSpawn(x, y, vx, vy, 1.2 + Math.random() * 0.8, color, 3 + Math.random() * 3, 80, 'rect');
  }
}

// ── Effect: Level Up Burst ────────────────────────────────────────────────────
// Radial burst from board center on difficulty tier increase.

function ptLevelUpBurst(level) {
  if (!_ptInited || !_ptEnabled()) return;
  const mult   = _ptMult();
  const b      = _ptBoardBounds();
  const count  = Math.round(60 * mult);
  const colors = ['#4ade80','#22c55e','#86efac','#ffffff','#bbf7d0'];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const speed = 100 + Math.random() * 200;
    const color = colors[Math.floor(Math.random() * colors.length)];
    _ptSpawn(b.cx, b.cy,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      0.5 + Math.random() * 0.5,
      color,
      2 + Math.random() * 3,
      120, i % 3 === 0 ? 'diamond' : 'circle');
  }
}

// ── Effect: Back-to-Back Glow ──────────────────────────────────────────────────
// Subtle gold glow particles along the board edges.

function ptBackToBackGlow() {
  if (!_ptInited || !_ptEnabled()) return;
  const mult   = _ptMult();
  const b      = _ptBoardBounds();
  const count  = Math.round(16 * mult);
  const colors = ['#ffd700','#ffec6e','#ffe082'];

  for (let i = 0; i < count; i++) {
    // Spawn along board edges
    const edge = Math.floor(Math.random() * 2); // 0=left, 1=right
    const x    = edge === 0 ? b.left  + (Math.random() - 0.5) * 8
                            : b.right + (Math.random() - 0.5) * 8;
    const y    = b.top + Math.random() * (b.bot - b.top);
    const vx   = edge === 0 ? -(10 + Math.random() * 20) : (10 + Math.random() * 20);
    const vy   = (Math.random() - 0.5) * 20;
    const color = colors[Math.floor(Math.random() * colors.length)];
    _ptSpawn(x, y, vx, vy, 0.6 + Math.random() * 0.4, color, 1.5 + Math.random() * 2, 0, 'circle');
  }
}

// ── Utility ────────────────────────────────────────────────────────────────────

function _hexToRgba(hex, alpha) {
  if (typeof hex !== 'number') return 'rgba(255,255,255,' + alpha + ')';
  const r = (hex >> 16) & 0xff;
  const g = (hex >>  8) & 0xff;
  const b = (hex      ) & 0xff;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

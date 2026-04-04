// Weather effects — particle-based rain, snow, thunderstorm, and sandstorm
// rendered on a 2D canvas overlay above the WebGL renderer.
// Depends on: state.js (reducedMotionEnabled), biome-themes.js (activeBiomeId)
// Public API: initWeather(), updateWeather(delta), setWeatherType(type), getWeatherType(),
//             setWeatherEnabled(bool), isWeatherEnabled()

const WEATHER_KEY          = 'mineCtris_weatherEffects';
const WEATHER_TYPES        = ['none', 'rain', 'snow', 'thunderstorm', 'sandstorm'];
const WEATHER_MAX_PARTICLES = 200;
const WEATHER_MIN_DURATION  = 120;  // 2 minutes
const WEATHER_MAX_DURATION  = 300;  // 5 minutes
const WEATHER_TRANS_DURATION = 3.0; // blend transition in seconds

// Biome → weather type for expedition/dungeon mode
const _BIOME_WEATHER = {
  forest:  'rain',
  ice:     'snow',
  desert:  'sandstorm',
  nether:  'none',
  stone:   'none',
};

// ── State ─────────────────────────────────────────────────────────────────────

let _weatherCanvas    = null;
let _weatherCtx       = null;
let _weatherEnabled   = true;
let _weatherType      = 'none';  // active target type
let _weatherPrev      = 'none';  // fading-out type
let _weatherAlpha     = 1.0;     // 0 = prev dominant, 1 = current dominant
let _weatherTimer     = 0;       // seconds until next random change
let _transitionTimer  = 0;
let _inTransition     = false;
let _snowAccum        = 0;       // 0..1 — drives bottom accumulation strip

// Lightning (thunderstorm)
let _lightningFlashTimer = 0;   // countdown to next flash
let _lightningAlpha      = 0;   // current overlay alpha (decays to 0)

// Puddle-splash pool for rain impact rings
const _splashes = [];

// ── Particle object pool ──────────────────────────────────────────────────────

const _pool = [];

function _initPool() {
  for (let i = 0; i < WEATHER_MAX_PARTICLES; i++) {
    _pool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, alpha: 1 });
  }
}

function _resetParticle(p, type, w, h) {
  p.life  = 0.001;
  p.alpha = 0.6 + Math.random() * 0.4;

  if (type === 'rain' || type === 'thunderstorm') {
    p.size    = 1 + Math.random();
    p.maxLife = 0.45 + Math.random() * 0.35;
    p.x  = Math.random() * (w + 60) - 30;
    p.y  = -8 - Math.random() * h * 0.25;
    p.vx = -20 - Math.random() * 15; // slight left drift
    p.vy = (h * 0.9 + Math.random() * h * 0.3) / p.maxLife;
  } else if (type === 'snow') {
    p.size    = 2 + Math.random() * 3;
    p.maxLife = 4 + Math.random() * 5;
    p.x  = Math.random() * w;
    p.y  = -p.size - Math.random() * h * 0.2;
    p.vx = (Math.random() - 0.5) * 25;
    p.vy = 35 + Math.random() * 35;
  } else if (type === 'sandstorm') {
    p.size    = 1.5 + Math.random() * 2;
    p.maxLife = 0.55 + Math.random() * 0.5;
    p.x  = -p.size - Math.random() * w * 0.4;
    p.y  = Math.random() * h;
    p.vx = (w * 1.8 + Math.random() * w) / p.maxLife;
    p.vy = (Math.random() - 0.4) * 50;
  }
}

function _targetCount(type) {
  switch (type) {
    case 'rain':        return 140;
    case 'snow':        return  75;
    case 'thunderstorm': return 170;
    case 'sandstorm':  return 200;
    default:           return   0;
  }
}

// ── Per-particle draw ─────────────────────────────────────────────────────────

function _drawParticle(ctx, p, type, blendAlpha) {
  const progress = p.life / p.maxLife;
  const a = p.alpha * blendAlpha * (1 - progress * 0.25);
  if (a <= 0.01) return;
  ctx.globalAlpha = a;

  if (type === 'rain' || type === 'thunderstorm') {
    ctx.strokeStyle = '#82b4ff';
    ctx.lineWidth   = p.size;
    ctx.beginPath();
    // Streak: short segment in direction of travel
    const sx = p.vx * 0.05;
    const sy = p.vy * 0.05;
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + sx, p.y + sy);
    ctx.stroke();
  } else if (type === 'snow') {
    ctx.fillStyle = '#e8f4ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'sandstorm') {
    ctx.fillStyle = '#c89050';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.size * 2.5, p.size * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

// ── Main particle update/draw for one weather type ────────────────────────────

function _tickParticles(ctx, type, w, h, delta, blendAlpha) {
  if (type === 'none' || blendAlpha <= 0.01) return;

  const target = _targetCount(type);

  // Count currently active particles for this type
  let active = 0;
  for (let i = 0; i < WEATHER_MAX_PARTICLES; i++) {
    if (_pool[i].life > 0 && _pool[i].life < _pool[i].maxLife) active++;
  }

  // Spawn new particles proportionally to target
  const spawnRate   = target * 2.5; // particles per second
  const toSpawn     = Math.min(Math.ceil(spawnRate * delta), target - active);
  let   spawned     = 0;
  for (let i = 0; i < WEATHER_MAX_PARTICLES && spawned < toSpawn; i++) {
    const p = _pool[i];
    if (p.life <= 0 || p.life >= p.maxLife) {
      _resetParticle(p, type, w, h);
      spawned++;
    }
  }

  // Update and draw
  for (let i = 0; i < WEATHER_MAX_PARTICLES; i++) {
    const p = _pool[i];
    if (p.life <= 0 || p.life >= p.maxLife) continue;

    p.life += delta;
    if (p.life >= p.maxLife) continue;

    // Horizontal sway for snow flakes
    let dx = p.vx;
    if (type === 'snow') {
      dx = p.vx + Math.sin(p.life * 1.8 + i * 0.37) * 18;
    }

    p.x += dx * delta;
    p.y += p.vy * delta;

    // Rain: spawn splash when hitting bottom edge, then recycle
    if ((type === 'rain' || type === 'thunderstorm') && p.y >= h - 6) {
      _splashes.push({ x: p.x, y: h - 3, r: 0, maxR: 6 + Math.random() * 6, life: 0, maxLife: 0.28 });
      p.life = p.maxLife;
      continue;
    }

    // Cull off-screen particles
    if (p.x > w + 30 || p.x < -30 || p.y > h + 20) {
      p.life = p.maxLife;
      continue;
    }

    _drawParticle(ctx, p, type, blendAlpha);
  }
}

// ── Splashes (rain impact rings) ──────────────────────────────────────────────

function _tickSplashes(ctx, delta, blendAlpha) {
  for (let i = _splashes.length - 1; i >= 0; i--) {
    const s = _splashes[i];
    s.life += delta;
    if (s.life >= s.maxLife) { _splashes.splice(i, 1); continue; }
    s.r = (s.life / s.maxLife) * s.maxR;
    const a = (1 - s.life / s.maxLife) * 0.45 * blendAlpha;
    ctx.globalAlpha  = a;
    ctx.strokeStyle  = '#82b4ff';
    ctx.lineWidth    = 0.8;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.r, s.r * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha  = 1;
  }
}

// ── Snow accumulation strip ───────────────────────────────────────────────────

function _drawSnowAccum(ctx, w, h, blendAlpha) {
  if (_snowAccum <= 0.01) return;
  const stripH = _snowAccum * 18;
  ctx.globalAlpha = Math.min(_snowAccum * 0.85, 0.75) * blendAlpha;
  ctx.fillStyle   = '#ddeeff';
  ctx.fillRect(0, h - stripH, w, stripH);
  ctx.globalAlpha = 1;
}

// ── Lightning flash overlay ───────────────────────────────────────────────────

function _tickLightning(ctx, w, h, delta) {
  // Countdown to next flash
  if (_lightningFlashTimer > 0) {
    _lightningFlashTimer -= delta;
    if (_lightningFlashTimer <= 0) {
      _lightningAlpha      = 0.55 + Math.random() * 0.35;
      _lightningFlashTimer = 0;
      // Schedule next flash
      _scheduleLightning();
    }
  }

  // Decay current flash
  if (_lightningAlpha > 0) {
    ctx.globalAlpha = _lightningAlpha;
    ctx.fillStyle   = '#ddeeff';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    _lightningAlpha = Math.max(_lightningAlpha - delta * 4.5, 0);
  }
}

function _scheduleLightning() {
  _lightningFlashTimer = 5 + Math.random() * 10;
}

// ── Weather scheduling ────────────────────────────────────────────────────────

function _scheduleNextWeather() {
  _weatherTimer = WEATHER_MIN_DURATION + Math.random() * (WEATHER_MAX_DURATION - WEATHER_MIN_DURATION);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Set the active weather type with a smooth transition.
 * @param {string} type — one of 'none'|'rain'|'snow'|'thunderstorm'|'sandstorm'
 */
function setWeatherType(type) {
  if (!WEATHER_TYPES.includes(type)) return;
  if (type === _weatherType) return;

  // Kill all particles from previous type so they don't bleed into new type visually
  for (let i = 0; i < WEATHER_MAX_PARTICLES; i++) _pool[i].life = 0;
  _splashes.length = 0;

  _weatherPrev     = _weatherType;
  _weatherType     = type;
  _inTransition    = true;
  _transitionTimer = 0;
  _weatherAlpha    = 0;

  if (type !== 'snow') _snowAccum = 0;
  if (type === 'thunderstorm') _scheduleLightning();
  else { _lightningFlashTimer = 0; _lightningAlpha = 0; }
}

function getWeatherType() { return _weatherType; }

function setWeatherEnabled(enabled) {
  _weatherEnabled = enabled;
  try { localStorage.setItem(WEATHER_KEY, String(enabled)); } catch (_) {}
  if (!enabled) {
    for (let i = 0; i < WEATHER_MAX_PARTICLES; i++) _pool[i].life = 0;
    _splashes.length = 0;
    _snowAccum       = 0;
    _lightningAlpha  = 0;
    if (_weatherCanvas) {
      _weatherCtx.clearRect(0, 0, _weatherCanvas.width, _weatherCanvas.height);
    }
  }
}

function isWeatherEnabled() { return _weatherEnabled; }

// ── Initialization ────────────────────────────────────────────────────────────

function initWeather() {
  // Load persisted preference
  try {
    const raw = localStorage.getItem(WEATHER_KEY);
    _weatherEnabled = raw !== 'false'; // default ON
  } catch (_) {}

  _initPool();

  // Create 2D canvas overlay
  _weatherCanvas = document.createElement('canvas');
  _weatherCanvas.id         = 'weather-overlay';
  _weatherCanvas.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';

  const container = document.getElementById('renderer-container');
  if (container) container.appendChild(_weatherCanvas);
  _weatherCtx = _weatherCanvas.getContext('2d');

  _resizeWeatherCanvas();
  window.addEventListener('resize', _resizeWeatherCanvas);

  // Kick off the random weather timer
  _scheduleNextWeather();
}

function _resizeWeatherCanvas() {
  if (!_weatherCanvas) return;
  _weatherCanvas.width  = window.innerWidth;
  _weatherCanvas.height = window.innerHeight;
}

// ── Per-frame update (called from game-loop.js) ───────────────────────────────

/**
 * Update and render weather overlay. Call every animation frame.
 * @param {number} delta — frame time in seconds
 */
function updateWeather(delta) {
  if (!_weatherCanvas || !_weatherCtx) return;
  if (!_weatherEnabled) return;

  // Respect reduced-motion: skip particles but still allow subtle snow accum decay
  if (typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled) {
    _weatherCtx.clearRect(0, 0, _weatherCanvas.width, _weatherCanvas.height);
    return;
  }

  const w   = _weatherCanvas.width;
  const h   = _weatherCanvas.height;
  const ctx = _weatherCtx;
  ctx.clearRect(0, 0, w, h);

  // ── Biome override ────────────────────────────────────────────────────────
  const biome        = (typeof activeBiomeId !== 'undefined') ? activeBiomeId : null;
  const biomeWeather = biome ? (_BIOME_WEATHER[biome] || 'none') : null;

  if (biome) {
    // In expedition/dungeon — lock to biome weather
    if (biomeWeather !== _weatherType) setWeatherType(biomeWeather);
  } else {
    // Open world — random weather timer
    const paused = (typeof isGameOver !== 'undefined' && isGameOver) ||
                   (typeof isPaused   !== 'undefined' && isPaused);
    if (!paused) {
      _weatherTimer -= delta;
      if (_weatherTimer <= 0) {
        const choices = ['none', 'none', 'rain', 'snow', 'thunderstorm', 'sandstorm'];
        const pool    = choices.filter(t => t !== _weatherType);
        setWeatherType(pool[Math.floor(Math.random() * pool.length)]);
        _scheduleNextWeather();
      }
    }
  }

  // ── Blend transition ──────────────────────────────────────────────────────
  if (_inTransition) {
    _transitionTimer += delta;
    _weatherAlpha     = Math.min(_transitionTimer / WEATHER_TRANS_DURATION, 1.0);
    if (_weatherAlpha >= 1.0) {
      _inTransition = false;
      _weatherAlpha = 1.0;
      _weatherPrev  = 'none';
    }
  }

  const prevAlpha    = _inTransition ? (1.0 - _weatherAlpha) : 0;
  const currentAlpha = _weatherAlpha;

  // ── Draw fading-out previous weather ─────────────────────────────────────
  if (_weatherPrev !== 'none' && prevAlpha > 0.01) {
    _tickParticles(ctx, _weatherPrev, w, h, delta, prevAlpha);
  }

  // ── Draw current weather ──────────────────────────────────────────────────
  if (_weatherType !== 'none' && currentAlpha > 0.01) {
    _tickParticles(ctx, _weatherType, w, h, delta, currentAlpha);
  }

  // ── Snow accumulation strip ───────────────────────────────────────────────
  if (_weatherType === 'snow' || _snowAccum > 0) {
    if (_weatherType === 'snow') {
      _snowAccum = Math.min(_snowAccum + delta * 0.015, 1.0);
    } else {
      _snowAccum = Math.max(_snowAccum - delta * 0.04, 0);
    }
    _drawSnowAccum(ctx, w, h, currentAlpha);
  }

  // ── Rain splashes ─────────────────────────────────────────────────────────
  if ((_weatherType === 'rain' || _weatherType === 'thunderstorm') && currentAlpha > 0.01) {
    _tickSplashes(ctx, delta, currentAlpha);
  }

  // ── Thunderstorm lightning ────────────────────────────────────────────────
  if (_weatherType === 'thunderstorm' && currentAlpha > 0.5) {
    _tickLightning(ctx, w, h, delta);
  }
}

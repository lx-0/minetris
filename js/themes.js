// themes.js — UI theme definitions, CSS variable injection, background management.
// Defines 5 UI themes: classic, dark, high-contrast, neon, retro.
// Each theme sets CSS custom properties on :root and optionally a scene background.
//
// Background modes: 'solid' | 'gradient' | 'particles'
// Persists: mineCtris_uiTheme, mineCtris_bgMode

const UI_THEME_KEY   = 'mineCtris_uiTheme';
const UI_BG_MODE_KEY = 'mineCtris_bgMode';

// ── Theme definitions ────────────────────────────────────────────────────────

const UI_THEMES = {
  classic: {
    label:    'Classic',
    icon:     '&#x1F7E9;',
    vars: {
      '--ui-bg':           '#1a1a2e',
      '--ui-panel-bg':     '#111111',
      '--ui-panel-border': '#00ff00',
      '--ui-text':         '#00ff00',
      '--ui-text-dim':     '#007700',
      '--ui-accent':       '#00ff00',
      '--ui-glow':         'rgba(0,255,0,0.3)',
      '--ui-input-bg':     '#222222',
      '--ui-input-border': '#00ff00',
    },
    sceneColor: '#1a1a2e',
    bgDefault:  'solid',
  },

  dark: {
    label:    'Dark Mode',
    icon:     '&#x1F319;',
    vars: {
      '--ui-bg':           '#0d0d0d',
      '--ui-panel-bg':     '#1a1a1a',
      '--ui-panel-border': '#444444',
      '--ui-text':         '#e0e0e0',
      '--ui-text-dim':     '#888888',
      '--ui-accent':       '#4fc3f7',
      '--ui-glow':         'rgba(79,195,247,0.25)',
      '--ui-input-bg':     '#2a2a2a',
      '--ui-input-border': '#555555',
    },
    sceneColor: '#0d0d0d',
    bgDefault:  'solid',
  },

  'high-contrast': {
    label:    'High Contrast',
    icon:     '&#x26AB;',
    vars: {
      '--ui-bg':           '#000000',
      '--ui-panel-bg':     '#000000',
      '--ui-panel-border': '#ffffff',
      '--ui-text':         '#ffffff',
      '--ui-text-dim':     '#cccccc',
      '--ui-accent':       '#ffff00',
      '--ui-glow':         'rgba(255,255,0,0.4)',
      '--ui-input-bg':     '#111111',
      '--ui-input-border': '#ffffff',
    },
    sceneColor: '#000000',
    bgDefault:  'solid',
  },

  neon: {
    label:    'Neon',
    icon:     '&#x26A1;',
    vars: {
      '--ui-bg':           '#0a0015',
      '--ui-panel-bg':     '#100025',
      '--ui-panel-border': '#cc00ff',
      '--ui-text':         '#ff00ff',
      '--ui-text-dim':     '#aa00cc',
      '--ui-accent':       '#00ffff',
      '--ui-glow':         'rgba(0,255,255,0.35)',
      '--ui-input-bg':     '#1a002a',
      '--ui-input-border': '#cc00ff',
    },
    sceneColor: '#0a0015',
    bgDefault:  'gradient',
  },

  retro: {
    label:    'Retro',
    icon:     '&#x1F4FA;',
    vars: {
      '--ui-bg':           '#1a0d00',
      '--ui-panel-bg':     '#110800',
      '--ui-panel-border': '#ff8800',
      '--ui-text':         '#ffaa00',
      '--ui-text-dim':     '#884400',
      '--ui-accent':       '#ff8800',
      '--ui-glow':         'rgba(255,136,0,0.3)',
      '--ui-input-bg':     '#220e00',
      '--ui-input-border': '#ff8800',
    },
    sceneColor: '#1a0d00',
    bgDefault:  'gradient',
  },
};

const UI_THEME_ORDER = ['classic', 'dark', 'high-contrast', 'neon', 'retro'];

let _activeUITheme  = 'classic';
let _activeBgMode   = 'solid';
let _particleCanvas = null;
let _particleCtx    = null;
let _particleRaf    = null;
let _particles      = [];

// ── Persistence ──────────────────────────────────────────────────────────────

function loadUITheme() {
  try {
    const t = localStorage.getItem(UI_THEME_KEY);
    if (t && UI_THEMES[t]) _activeUITheme = t;
  } catch (_) {}
  try {
    const m = localStorage.getItem(UI_BG_MODE_KEY);
    if (m && ['solid', 'gradient', 'particles'].includes(m)) _activeBgMode = m;
  } catch (_) {}
}

function _saveUITheme() {
  try { localStorage.setItem(UI_THEME_KEY, _activeUITheme); } catch (_) {}
  try { localStorage.setItem(UI_BG_MODE_KEY, _activeBgMode); } catch (_) {}
}

// ── CSS variable injection ────────────────────────────────────────────────────

function _injectCSSVars(themeKey) {
  const theme = UI_THEMES[themeKey];
  if (!theme) return;
  const root = document.documentElement;
  for (const [prop, val] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, val);
  }
}

// ── Three.js scene background ─────────────────────────────────────────────────

function _applySceneBg(themeKey, bgMode) {
  const theme = UI_THEMES[themeKey];
  if (!theme) return;
  if (typeof scene !== 'undefined' && scene && typeof THREE !== 'undefined') {
    if (bgMode === 'solid' || bgMode === 'gradient') {
      // Gradient is CSS-only; set solid scene bg to base color.
      scene.background = new THREE.Color(theme.sceneColor);
    } else if (bgMode === 'particles') {
      // Particles overlay is CSS; keep scene background matching.
      scene.background = new THREE.Color(theme.sceneColor);
    }
  }
}

// ── Body class management ─────────────────────────────────────────────────────

function _setBodyThemeClass(themeKey) {
  const cls = ['classic', 'dark', 'high-contrast', 'neon', 'retro'];
  cls.forEach(function(k) {
    document.body.classList.toggle('ui-theme-' + k, k === themeKey);
  });
}

// ── Background: gradient ──────────────────────────────────────────────────────

function _buildGradientStyle(themeKey) {
  const GRADIENTS = {
    classic:        'radial-gradient(ellipse at 20% 80%, #0a2a0a 0%, #1a1a2e 60%, #0d0d1a 100%)',
    dark:           'radial-gradient(ellipse at center, #1a1a2a 0%, #0d0d0d 70%)',
    'high-contrast':'linear-gradient(135deg, #000 0%, #111 50%, #000 100%)',
    neon:           'radial-gradient(ellipse at 30% 70%, #1a003a 0%, #0a0015 60%, #000010 100%)',
    retro:          'radial-gradient(ellipse at 50% 100%, #2a1000 0%, #1a0d00 50%, #0a0500 100%)',
  };
  return GRADIENTS[themeKey] || GRADIENTS.classic;
}

function _applyGradientBg(themeKey) {
  let el = document.getElementById('ui-theme-bg-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ui-theme-bg-overlay';
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;transition:opacity 0.3s;';
    document.body.insertBefore(el, document.body.firstChild);
  }
  el.style.background = _buildGradientStyle(themeKey);
  el.style.display = '';
}

function _removeBgOverlay() {
  const el = document.getElementById('ui-theme-bg-overlay');
  if (el) el.style.display = 'none';
}

// ── Background: particles ─────────────────────────────────────────────────────

var PARTICLE_COLORS = {
  classic:        ['#004400', '#006600', '#002200', '#003300'],
  dark:           ['#1a3a4a', '#0d2233', '#103344', '#081a25'],
  'high-contrast':['#222222', '#333333', '#111111', '#444444'],
  neon:           ['#300060', '#600080', '#4400aa', '#200040'],
  retro:          ['#3a1a00', '#5a2a00', '#2a1000', '#4a1800'],
};

function _initParticles(themeKey) {
  if (!_particleCanvas) {
    _particleCanvas = document.createElement('canvas');
    _particleCanvas.id = 'ui-particle-canvas';
    _particleCanvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;';
    document.body.insertBefore(_particleCanvas, document.body.firstChild);
  }
  _particleCanvas.style.display = '';
  _particleCtx = _particleCanvas.getContext('2d');

  _particleCanvas.width  = window.innerWidth;
  _particleCanvas.height = window.innerHeight;

  var colors = PARTICLE_COLORS[themeKey] || PARTICLE_COLORS.classic;
  _particles = [];
  for (var i = 0; i < 30; i++) {
    _particles.push(_makeParticle(colors));
  }
}

function _makeParticle(colors) {
  var size = 4 + Math.random() * 10;
  return {
    x:     Math.random() * (window.innerWidth  || 800),
    y:     Math.random() * (window.innerHeight || 600),
    vx:    (Math.random() - 0.5) * 0.4,
    vy:    -0.2 - Math.random() * 0.5,
    size:  size,
    alpha: 0.1 + Math.random() * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot:   Math.random() * Math.PI * 2,
    rotV:  (Math.random() - 0.5) * 0.01,
  };
}

function _tickParticles(themeKey) {
  if (!_particleCtx || !_particleCanvas) return;
  var W = _particleCanvas.width;
  var H = _particleCanvas.height;
  var colors = PARTICLE_COLORS[themeKey] || PARTICLE_COLORS.classic;

  _particleCtx.clearRect(0, 0, W, H);

  for (var i = 0; i < _particles.length; i++) {
    var p = _particles[i];
    p.x   += p.vx;
    p.y   += p.vy;
    p.rot += p.rotV;

    // Wrap around.
    if (p.y < -p.size * 2) {
      p.y = H + p.size;
      p.x = Math.random() * W;
    }
    if (p.x < -p.size * 2) p.x = W + p.size;
    if (p.x > W + p.size * 2) p.x = -p.size;

    _particleCtx.save();
    _particleCtx.globalAlpha = p.alpha;
    _particleCtx.translate(p.x, p.y);
    _particleCtx.rotate(p.rot);
    _particleCtx.fillStyle = p.color;
    _particleCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    _particleCtx.restore();
  }
}

function _startParticles(themeKey) {
  if (_particleRaf) cancelAnimationFrame(_particleRaf);
  function loop() {
    _tickParticles(themeKey);
    _particleRaf = requestAnimationFrame(loop);
  }
  _particleRaf = requestAnimationFrame(loop);
}

function _stopParticles() {
  if (_particleRaf) { cancelAnimationFrame(_particleRaf); _particleRaf = null; }
  if (_particleCanvas) _particleCanvas.style.display = 'none';
}

// ── Resize handler ────────────────────────────────────────────────────────────

function _onResizeParticles() {
  if (_activeBgMode !== 'particles' || !_particleCanvas) return;
  _particleCanvas.width  = window.innerWidth;
  _particleCanvas.height = window.innerHeight;
}

// ── Main apply function ───────────────────────────────────────────────────────

/**
 * Apply a UI theme with an optional background mode override.
 * @param {string} themeKey   One of 'classic','dark','high-contrast','neon','retro'
 * @param {string} [bgMode]   'solid'|'gradient'|'particles'. Defaults to theme's bgDefault.
 */
function applyUITheme(themeKey, bgMode) {
  if (!UI_THEMES[themeKey]) return;
  _activeUITheme = themeKey;
  if (bgMode && ['solid', 'gradient', 'particles'].includes(bgMode)) {
    _activeBgMode = bgMode;
  }
  _saveUITheme();

  // Smooth transition: fade body UI slightly.
  document.body.style.transition = 'color 0.3s, background-color 0.3s';

  _injectCSSVars(themeKey);
  _setBodyThemeClass(themeKey);
  _applySceneBg(themeKey, _activeBgMode);

  // Background mode.
  _stopParticles();
  _removeBgOverlay();

  if (_activeBgMode === 'gradient') {
    _applyGradientBg(themeKey);
  } else if (_activeBgMode === 'particles') {
    _initParticles(themeKey);
    _startParticles(themeKey);
  }

  // Sync UI selector buttons.
  _syncUIThemeButtons();
  _syncBgModeButtons();
}

/**
 * Set only the background mode, keeping current theme.
 */
function applyBgMode(mode) {
  if (!['solid', 'gradient', 'particles'].includes(mode)) return;
  applyUITheme(_activeUITheme, mode);
}

// ── Button sync ───────────────────────────────────────────────────────────────

function _syncUIThemeButtons() {
  UI_THEME_ORDER.forEach(function(key) {
    var btn = document.getElementById('ui-theme-btn-' + key);
    if (!btn) return;
    btn.classList.toggle('ui-theme-btn-selected', key === _activeUITheme);
  });
}

function _syncBgModeButtons() {
  ['solid', 'gradient', 'particles'].forEach(function(mode) {
    var btn = document.getElementById('ui-bg-btn-' + mode);
    if (!btn) return;
    btn.classList.toggle('ui-bg-btn-selected', mode === _activeBgMode);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initUIThemes() {
  loadUITheme();
  window.addEventListener('resize', _onResizeParticles);

  // Wire theme buttons.
  UI_THEME_ORDER.forEach(function(key) {
    var btn = document.getElementById('ui-theme-btn-' + key);
    if (btn) {
      btn.addEventListener('click', function() { applyUITheme(key); });
    }
  });

  // Wire bg mode buttons.
  ['solid', 'gradient', 'particles'].forEach(function(mode) {
    var btn = document.getElementById('ui-bg-btn-' + mode);
    if (btn) {
      btn.addEventListener('click', function() { applyBgMode(mode); });
    }
  });

  // Apply persisted theme on load.
  applyUITheme(_activeUITheme, _activeBgMode);
}

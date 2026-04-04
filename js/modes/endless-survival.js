// Endless Survival Mode — no speed cap, escalating difficulty, random modifiers.
// Modifiers activate every 60s (max 3 active). Speed increases every 30s without limit.
// Requires: state.js, world.js, gamestate.js loaded first.

const ENDLESS_HS_KEY = 'mineCtris_endlessBest';

// ── Modifier definitions ──────────────────────────────────────────────────────

const ENDLESS_MODIFIER_DEFS = {
  fog_of_war: {
    id:   'fog_of_war',
    icon: '🌫️',
    name: 'Fog of War',
    desc: 'Only 3 rows above the stack are visible.',
    apply:  _modFogApply,
    remove: _modFogRemove,
  },
  mirror: {
    id:   'mirror',
    icon: '🔄',
    name: 'Mirror',
    desc: 'Left and right controls are flipped.',
    apply:  _modMirrorApply,
    remove: _modMirrorRemove,
  },
  gravity: {
    id:   'gravity',
    icon: '⬇️',
    name: 'Gravity',
    desc: 'Unsupported blocks slide down to fill gaps.',
    apply:  _modGravityApply,
    remove: _modGravityRemove,
  },
  shrink: {
    id:   'shrink',
    icon: '↔️',
    name: 'Shrink',
    desc: 'The board narrows by one column on each side.',
    apply:  _modShrinkApply,
    remove: _modShrinkRemove,
  },
  poison: {
    id:   'poison',
    icon: '☠️',
    name: 'Poison',
    desc: 'A random stack block turns to garbage every 10s.',
    apply:  _modPoisonApply,
    remove: _modPoisonRemove,
  },
};

// ── Internal state ────────────────────────────────────────────────────────────
let _fogDensitySaved      = 0.002;
let _poisonTickTimer      = 0;
const POISON_TICK_INTERVAL = 10;    // seconds between poison ticks
const GARBAGE_COLOR       = 0x444444; // dark gray for garbage blocks

// ── Modifier implementations ──────────────────────────────────────────────────

function _modFogApply() {
  if (typeof scene !== 'undefined' && scene.fog) {
    _fogDensitySaved = scene.fog.density;
    scene.fog.density = 0.18;  // dense fog — ~3 blocks visibility
  }
}
function _modFogRemove() {
  if (typeof scene !== 'undefined' && scene.fog) {
    scene.fog.density = _fogDensitySaved;
  }
}

function _modMirrorApply()  { endlessMirrorActive = true;  }
function _modMirrorRemove() { endlessMirrorActive = false; }

function _modGravityApply()  { endlessGravityActive = true;  }
function _modGravityRemove() { endlessGravityActive = false; }

function _modShrinkApply() {
  endlessShrinkLevel = (endlessShrinkLevel || 0) + 1;
  _buildShrinkWalls();
}
function _modShrinkRemove() {
  endlessShrinkLevel = Math.max(0, (endlessShrinkLevel || 0) - 1);
  _clearShrinkWalls();
  if (endlessShrinkLevel > 0) _buildShrinkWalls();
}

function _modPoisonApply()  { endlessPoisonActive = true; _poisonTickTimer = POISON_TICK_INTERVAL; }
function _modPoisonRemove() {
  endlessPoisonActive = false;
  _poisonTickTimer = 0;
}

// ── Shrink wall helpers ───────────────────────────────────────────────────────
// Invisible barrier blocks placed at ±(worldEdge - shrinkLevel) on X-axis.

function _clearShrinkWalls() {
  if (typeof worldGroup === 'undefined') return;
  const toRemove = worldGroup.children.filter(c => c.name === 'endless_shrink_wall');
  toRemove.forEach(b => worldGroup.remove(b));
}

function _buildShrinkWalls() {
  if (typeof worldGroup === 'undefined' || typeof createBlockMesh === 'undefined') return;
  if ((endlessShrinkLevel || 0) <= 0) return;

  // Place invisible barrier columns at offset from world center.
  const WALL_OFFSET = 5 - endlessShrinkLevel;  // starts at ±5, narrows by 1 each time
  const WALL_HEIGHT = 22;

  for (let y = 0; y < WALL_HEIGHT; y++) {
    for (let z = -5; z <= 5; z++) {
      const createWall = function(x) {
        const block = createBlockMesh(0x000000);
        block.visible = false;  // invisible but physically present
        block.position.set(x, y + 0.5, z);
        block.name = 'endless_shrink_wall';
        block.userData.isShrinkWall = true;
        worldGroup.add(block);
        if (typeof registerBlock === 'function') registerBlock(block);
      };
      createWall( WALL_OFFSET);
      createWall(-WALL_OFFSET);
    }
  }
}

// ── Gravity pass ──────────────────────────────────────────────────────────────
// After each piece lands, drop any blocks that have no support below them.

function applyEndlessGravityPass() {
  if (!endlessGravityActive) return;
  if (typeof worldGroup === 'undefined') return;

  let changed = true;
  const MAX_PASSES = 20;
  let pass = 0;

  while (changed && pass < MAX_PASSES) {
    changed = false;
    pass++;

    // Build set of occupied positions for fast lookup
    const occupied = new Set();
    worldGroup.children.forEach(function(obj) {
      if (obj.name === 'landed_block' && obj.userData.gridPos && !obj.userData.isShrinkWall) {
        const gp = obj.userData.gridPos;
        occupied.add(gp.x + ',' + gp.y + ',' + gp.z);
      }
    });

    // Find blocks with no support directly below
    const candidates = worldGroup.children.filter(function(obj) {
      if (obj.name !== 'landed_block' || !obj.userData.gridPos) return false;
      const gp = obj.userData.gridPos;
      const below = gp.x + ',' + (gp.y - 1) + ',' + gp.z;
      // Block at Y=0.5 is resting on the ground (Y=0), skip it
      if (gp.y <= 0.5) return false;
      return !occupied.has(below);
    });

    candidates.forEach(function(block) {
      const gp = block.userData.gridPos;
      const newY = gp.y - 1;
      if (typeof unregisterBlock === 'function') unregisterBlock(block);
      block.position.y = newY;
      if (typeof registerBlock === 'function') registerBlock(block);
      changed = true;
    });
  }
}

// ── Poison tick ───────────────────────────────────────────────────────────────
function _poisonTick() {
  if (typeof worldGroup === 'undefined') return;
  const landedBlocks = worldGroup.children.filter(function(obj) {
    return obj.name === 'landed_block' && obj.userData.gridPos &&
           !obj.userData.isGarbage && !obj.userData.isShrinkWall;
  });
  if (!landedBlocks.length) return;

  const idx = Math.floor(Math.random() * landedBlocks.length);
  const target = landedBlocks[idx];
  target.material.color.setHex(GARBAGE_COLOR);
  target.userData.isGarbage  = true;
  target.userData.canonicalColor = GARBAGE_COLOR;
  // Flash effect
  target.material.emissive && target.material.emissive.setHex(0x220000);
  setTimeout(function() {
    if (target.material && target.material.emissive) {
      target.material.emissive.setHex(0x000000);
    }
  }, 400);
}

// ── Speed escalation ──────────────────────────────────────────────────────────
const ENDLESS_SPEED_INTERVAL  = 30;   // seconds between speed-ups
const ENDLESS_SPEED_INCREMENT = 0.12; // added to difficultyMultiplier each step

function applyEndlessSpeedStep() {
  if (typeof difficultyMultiplier === 'undefined') return;
  difficultyMultiplier += ENDLESS_SPEED_INCREMENT;
  endlessSurvivalSpeedLevel++;
  if (typeof speedUpBannerEl !== 'undefined' && speedUpBannerEl) {
    speedUpBannerEl.textContent = '⚡ SPEED UP! ×' + difficultyMultiplier.toFixed(2);
    speedUpBannerEl.style.color = '';
    speedUpBannerEl.style.display = 'block';
    speedUpBannerTimer = 2.0;
  }
}

// ── Modifier management ───────────────────────────────────────────────────────
const ENDLESS_MODIFIER_INTERVAL = 60; // seconds between modifier activations
const ENDLESS_MAX_MODIFIERS     = 3;

function _pickNextModifier() {
  const modKeys = Object.keys(ENDLESS_MODIFIER_DEFS);
  // Exclude already-active ones
  const available = modKeys.filter(function(k) {
    return !endlessActiveModifiers.includes(k);
  });
  if (!available.length) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function activateEndlessModifier() {
  if (endlessActiveModifiers.length >= ENDLESS_MAX_MODIFIERS) return;
  const key = _pickNextModifier();
  if (!key) return;
  endlessActiveModifiers.push(key);
  const def = ENDLESS_MODIFIER_DEFS[key];
  if (def && typeof def.apply === 'function') def.apply();
  updateEndlessModifierHUD();

  // Announce to player
  if (typeof speedUpBannerEl !== 'undefined' && speedUpBannerEl) {
    speedUpBannerEl.textContent = def.icon + ' ' + def.name.toUpperCase() + ' ACTIVE!';
    speedUpBannerEl.style.color = '#ff9944';
    speedUpBannerEl.style.display = 'block';
    speedUpBannerTimer = 3.0;
  }
}

function deactivateAllEndlessModifiers() {
  endlessActiveModifiers.slice().forEach(function(key) {
    const def = ENDLESS_MODIFIER_DEFS[key];
    if (def && typeof def.remove === 'function') def.remove();
  });
  endlessActiveModifiers.length = 0;
  _clearShrinkWalls();
  updateEndlessModifierHUD();
}

// ── Score multiplier ──────────────────────────────────────────────────────────
function getEndlessScoreMultiplier() {
  if (!isEndlessSurvivalMode) return 1.0;
  return 1.0 + endlessActiveModifiers.length * 0.5;
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function updateEndlessModifierHUD() {
  const el = document.getElementById('endless-modifier-hud');
  if (!el) return;

  if (!isEndlessSurvivalMode || !endlessActiveModifiers.length) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'flex';
  el.innerHTML = endlessActiveModifiers.map(function(key) {
    const def = ENDLESS_MODIFIER_DEFS[key];
    return '<span class="endless-mod-icon" title="' + def.name + ': ' + def.desc + '">' + def.icon + '</span>';
  }).join('');

  // Show multiplier
  const mult = getEndlessScoreMultiplier();
  if (mult > 1.0) {
    el.innerHTML += '<span class="endless-mod-mult">×' + mult.toFixed(1) + '</span>';
  }
}

// ── Per-tick update (called from game-loop) ───────────────────────────────────
function tickEndlessSurvival(delta) {
  if (!isEndlessSurvivalMode || isGameOver || isPaused) return;

  // Speed escalation timer
  endlessSurvivalSpeedTimer += delta;
  if (endlessSurvivalSpeedTimer >= ENDLESS_SPEED_INTERVAL) {
    endlessSurvivalSpeedTimer -= ENDLESS_SPEED_INTERVAL;
    applyEndlessSpeedStep();
  }

  // Modifier activation timer
  endlessSurvivalModTimer += delta;
  if (endlessSurvivalModTimer >= ENDLESS_MODIFIER_INTERVAL) {
    endlessSurvivalModTimer -= ENDLESS_MODIFIER_INTERVAL;
    activateEndlessModifier();
  }

  // Poison tick
  if (endlessPoisonActive) {
    _poisonTickTimer -= delta;
    if (_poisonTickTimer <= 0) {
      _poisonTickTimer = POISON_TICK_INTERVAL;
      _poisonTick();
    }
  }
}

// ── Local best score ──────────────────────────────────────────────────────────
function loadEndlessBest() {
  try {
    return JSON.parse(localStorage.getItem(ENDLESS_HS_KEY) || 'null');
  } catch (_) { return null; }
}

function submitEndlessScore(score, timeSurvived, linesCleared, maxModifiers) {
  let best = null;
  try { best = JSON.parse(localStorage.getItem(ENDLESS_HS_KEY) || 'null'); } catch (_) {}
  const isNew = !best || score > best.score;
  if (isNew) {
    try {
      localStorage.setItem(ENDLESS_HS_KEY, JSON.stringify({ score, timeSurvived, linesCleared, maxModifiers }));
    } catch (_) {}
  }
  return isNew;
}

function renderEndlessBestGameOver(isNewBest, score, timeSurvived, speedLevel, maxModifiers) {
  const el = document.getElementById('endless-go-section');
  if (!el) return;

  const mm = Math.floor(timeSurvived / 60).toString().padStart(2, '0');
  const ss = Math.floor(timeSurvived % 60).toString().padStart(2, '0');
  const timeStr = mm + ':' + ss;

  const best = loadEndlessBest();
  const bestStr = best ? best.score.toLocaleString() : '—';

  el.style.display = 'block';
  el.innerHTML =
    '<div class="go-label">♾️ ENDLESS SURVIVAL</div>' +
    '<div class="endless-go-stats">' +
      '<div class="endless-go-row"><span>Score</span><span>' + score.toLocaleString() + (isNewBest ? ' ★ NEW BEST!' : '') + '</span></div>' +
      '<div class="endless-go-row"><span>Time Survived</span><span>' + timeStr + '</span></div>' +
      '<div class="endless-go-row"><span>Speed Level</span><span>' + speedLevel + '</span></div>' +
      '<div class="endless-go-row"><span>Max Modifiers</span><span>' + maxModifiers + ' / ' + ENDLESS_MAX_MODIFIERS + '</span></div>' +
      '<div class="endless-go-row endless-go-best"><span>Personal Best</span><span>' + bestStr + '</span></div>' +
    '</div>';
}

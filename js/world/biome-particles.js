// Biome-themed particle configs for line-clear visual effects.
// Depends on: biome-themes.js (activeBiomeId), state.js (activeTheme)

// ── Particle theme definitions ────────────────────────────────────────────────
// fragColors: array of hex ints — a random color is chosen per fragment
// ringColor:  hex int for shockwave ring tint
// lightColor: hex int for point light
// fragSpark:  if true, fragments get extra upward velocity (ember/spark behavior)
// intensity:  base fragment multiplier (scales with combo on top of this)

const _BIOME_PARTICLE_THEMES = {
  stone: {
    // Cave: rock debris and dust clouds
    fragColors: [0x888888, 0x777777, 0x999999, 0x5a5a4e, 0xaaaaaa],
    ringColor:  0x999999,
    lightColor: 0xcccccc,
    fragSpark:  false,
    intensity:  1.0,
  },
  forest: {
    // Forest: leaf scatter and pollen drift
    fragColors: [0x4caf50, 0x8bc34a, 0xcddc39, 0x6d4c41, 0xa5d6a7],
    ringColor:  0x81c784,
    lightColor: 0x66bb6a,
    fragSpark:  false,
    intensity:  1.1,
  },
  nether: {
    // Nether: ember sparks and lava drips
    fragColors: [0xff5722, 0xff9800, 0xf44336, 0xff6d00, 0xffab40],
    ringColor:  0xff6600,
    lightColor: 0xff4400,
    fragSpark:  true,
    intensity:  1.2,
  },
  ice: {
    // Ocean/Ice: bubble bursts and water splashes
    fragColors: [0x80d8ff, 0x40c4ff, 0xb3e5fc, 0xe1f5fe, 0x29b6f6],
    ringColor:  0x29b6f6,
    lightColor: 0x4fc3f7,
    fragSpark:  false,
    intensity:  1.0,
  },
  desert: {
    // Desert: sand scatter and dust
    fragColors: [0xffd54f, 0xffca28, 0xffe082, 0xc8873a, 0xf9a825],
    ringColor:  0xffb300,
    lightColor: 0xffa000,
    fragSpark:  false,
    intensity:  1.0,
  },
  // Void theme (entropy mode / void dungeon): purple shimmers
  void: {
    fragColors: [0x7b1fa2, 0x9c27b0, 0x6a1b9a, 0xce93d8, 0xe040fb],
    ringColor:  0x9c27b0,
    lightColor: 0x7b1fa2,
    fragSpark:  false,
    intensity:  1.15,
  },
  // Ender theme: purple wisps, chorus sparks, ender eye flashes
  ender: {
    fragColors: [0xaa77ff, 0x7b1fa2, 0xcc44aa, 0x66ffaa, 0xd4aaff],
    ringColor:  0xaa77ff,
    lightColor: 0x9c27b0,
    fragSpark:  true,
    intensity:  1.1,
  },
  // Diamond theme: crystal ice shards and sparkles
  diamond: {
    fragColors: [0x88ffff, 0xb8eaff, 0x00d5ff, 0x4b7fff, 0x00b0ef],
    ringColor:  0x00d5ff,
    lightColor: 0x4fc3f7,
    fragSpark:  false,
    intensity:  1.2,
  },
};

// Returned when no biome/theme override is active.
const _BIOME_PARTICLE_DEFAULT = {
  fragColors: null,  // use block's own color
  ringColor:  null,  // use dominant block color
  lightColor: null,
  fragSpark:  false,
  intensity:  1.0,
};

/**
 * Returns the particle theme for the current active biome or visual theme.
 * Falls back to block colors when no biome/void override is active.
 */
function getBiomeParticleTheme() {
  if (typeof activeBiomeId !== 'undefined' && activeBiomeId) {
    return _BIOME_PARTICLE_THEMES[activeBiomeId] || _BIOME_PARTICLE_DEFAULT;
  }
  if (typeof activeTheme !== 'undefined') {
    if (activeTheme === 'void')    return _BIOME_PARTICLE_THEMES.void;
    if (activeTheme === 'ender')   return _BIOME_PARTICLE_THEMES.ender;
    if (activeTheme === 'diamond') return _BIOME_PARTICLE_THEMES.diamond;
    if (activeTheme === 'nether')  return _BIOME_PARTICLE_THEMES.nether;
  }
  return _BIOME_PARTICLE_DEFAULT;
}

/**
 * Picks a random color from the biome theme's fragColors array.
 * Returns a THREE.Color. If theme has no fragColors, returns a copy of fallback.
 */
function getBiomeFragColor(theme, fallback) {
  if (!theme || !theme.fragColors) {
    return fallback ? fallback.clone() : new THREE.Color(0xffffff);
  }
  const hex = theme.fragColors[Math.floor(Math.random() * theme.fragColors.length)];
  return new THREE.Color(hex);
}

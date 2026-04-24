// Config constants mirrored from js/core/config.js.
// Update here when the source constants change.

export const BLOCK_TYPES = {
  dirt:          { hits: 2,        points: 5,   effect: null },
  stone:         { hits: 4,        points: 15,  effect: null },
  gold:          { hits: 2,        points: 50,  effect: null },
  ice:           { hits: 1,        points: 5,   effect: 'ice' },
  moss:          { hits: 3,        points: 8,   effect: null },
  lava:          { hits: 3,        points: 25,  effect: 'lava_glow' },
  crystal:       { hits: 2,        points: 35,  effect: null },
  wood:          { hits: 3,        points: 10,  effect: null },
  leaf:          { hits: 1,        points: 2,   effect: null },
  rock:          { hits: 5,        points: 20,  effect: null },
  plank:         { hits: 4,        points: 15,  effect: null },
  diamond:       { hits: 6,        points: 100, effect: null },
  obsidian:      { hits: 8,        points: 100, effect: null, dropMaterial: 'obsidian_shard' },
  rubble:        { hits: 2,        points: 5,   effect: null, isRubble: true },
  crumble:       { hits: 2,        points: 10,  effect: null, isHazard: true, hazardType: 'crumble' },
  magma:         { hits: 3,        points: 30,  effect: 'magma_glow', isHazard: true, hazardType: 'magma' },
  void_block:    { hits: Infinity, points: 0,   effect: null, isHazard: true, hazardType: 'void' },
  soft_moss:     { hits: 1,        points: 5,   effect: null, isHazard: true, hazardType: 'soft_moss' },
  hardened_moss: { hits: Infinity, points: 0,   effect: null, isHazard: true, hazardType: 'hardened_moss' },
  vine:          { hits: 2,        points: 5,   effect: null, isHazard: true, hazardType: 'vine' },
  bedrock:       { hits: Infinity, points: 0,   effect: null, isBedrock: true },
};

export const LINE_CLEAR_CELLS_NEEDED = 100;
export const INV_MAX_PER_TYPE        = 64;
export const INV_MAX_TOTAL           = 256;
export const NUDGE_MAX_OFFSET        = 3;
export const DIFFICULTY_INTERVAL     = 60;       // seconds between speed tiers
export const DIFFICULTY_MULTIPLIER_PER_TIER = 1.1;
export const DIFFICULTY_MAX_MULTIPLIER      = 3.0;
export const SPEED_MOD_SLOW   = 0.5;
export const SPEED_MOD_NORMAL = 1.0;
export const SPEED_MOD_DOUBLE = 2.0;
export const GAME_OVER_HEIGHT = 19.5;
export const DANGER_ZONE_HEIGHT = GAME_OVER_HEIGHT - 3; // 16.5

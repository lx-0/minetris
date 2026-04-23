import { describe, it, expect } from 'vitest';
import {
  BLOCK_TYPES,
  LINE_CLEAR_CELLS_NEEDED,
  INV_MAX_PER_TYPE,
  INV_MAX_TOTAL,
  NUDGE_MAX_OFFSET,
  DIFFICULTY_INTERVAL,
  DIFFICULTY_MULTIPLIER_PER_TIER,
  DIFFICULTY_MAX_MULTIPLIER,
  SPEED_MOD_SLOW,
  SPEED_MOD_NORMAL,
  SPEED_MOD_DOUBLE,
  GAME_OVER_HEIGHT,
  DANGER_ZONE_HEIGHT,
} from './lib/config.js';

describe('BLOCK_TYPES', () => {
  it('defines all expected block types', () => {
    const expected = [
      'dirt', 'stone', 'gold', 'ice', 'moss', 'lava', 'crystal', 'wood',
      'leaf', 'rock', 'plank', 'diamond', 'obsidian', 'rubble',
      'crumble', 'magma', 'void_block', 'soft_moss', 'hardened_moss', 'vine', 'bedrock',
    ];
    expected.forEach((type) => {
      expect(BLOCK_TYPES, `missing block type: ${type}`).toHaveProperty(type);
    });
  });

  it('every block type has hits, points, and effect fields', () => {
    Object.entries(BLOCK_TYPES).forEach(([name, def]) => {
      expect(def, `${name}.hits missing`).toHaveProperty('hits');
      expect(def, `${name}.points missing`).toHaveProperty('points');
      expect(def, `${name}.effect missing`).toHaveProperty('effect');
      expect(def.hits, `${name}.hits must be > 0`).toBeGreaterThan(0);
      expect(def.points, `${name}.points must be >= 0`).toBeGreaterThanOrEqual(0);
    });
  });

  it('indestructible blocks have Infinity hits and 0 points', () => {
    ['void_block', 'hardened_moss', 'bedrock'].forEach((name) => {
      expect(BLOCK_TYPES[name].hits).toBe(Infinity);
      expect(BLOCK_TYPES[name].points).toBe(0);
    });
  });

  it('hazard blocks carry isHazard=true and a hazardType', () => {
    const hazards = ['crumble', 'magma', 'void_block', 'soft_moss', 'hardened_moss', 'vine'];
    hazards.forEach((name) => {
      expect(BLOCK_TYPES[name].isHazard).toBe(true);
      expect(typeof BLOCK_TYPES[name].hazardType).toBe('string');
    });
  });

  it('non-hazard standard blocks do not have isHazard', () => {
    ['dirt', 'stone', 'gold', 'diamond', 'wood'].forEach((name) => {
      expect(BLOCK_TYPES[name].isHazard).toBeFalsy();
    });
  });

  it('diamond has the highest point value among finite-hits blocks', () => {
    const finitePoints = Object.entries(BLOCK_TYPES)
      .filter(([, d]) => isFinite(d.hits))
      .map(([, d]) => d.points);
    expect(BLOCK_TYPES.diamond.points).toBe(Math.max(...finitePoints));
  });

  it('points correlate loosely with mining difficulty for standard blocks', () => {
    expect(BLOCK_TYPES.diamond.points).toBeGreaterThan(BLOCK_TYPES.stone.points);
    expect(BLOCK_TYPES.stone.points).toBeGreaterThan(BLOCK_TYPES.dirt.points);
    expect(BLOCK_TYPES.rock.points).toBeGreaterThan(BLOCK_TYPES.dirt.points);
    expect(BLOCK_TYPES.gold.points).toBeGreaterThan(BLOCK_TYPES.dirt.points);
  });

  it('obsidian drops a shard on break', () => {
    expect(BLOCK_TYPES.obsidian.dropMaterial).toBe('obsidian_shard');
  });

  it('rubble is marked isRubble', () => {
    expect(BLOCK_TYPES.rubble.isRubble).toBe(true);
  });

  it('bedrock is marked isBedrock', () => {
    expect(BLOCK_TYPES.bedrock.isBedrock).toBe(true);
  });
});

describe('gameplay constants', () => {
  it('LINE_CLEAR_CELLS_NEEDED is 100', () => {
    expect(LINE_CLEAR_CELLS_NEEDED).toBe(100);
  });

  it('inventory per-type cap (64) is less than total cap (256)', () => {
    expect(INV_MAX_PER_TYPE).toBe(64);
    expect(INV_MAX_TOTAL).toBe(256);
    expect(INV_MAX_TOTAL).toBeGreaterThan(INV_MAX_PER_TYPE);
  });

  it('NUDGE_MAX_OFFSET is 3', () => {
    expect(NUDGE_MAX_OFFSET).toBe(3);
  });

  it('difficulty ramps at 60-second intervals', () => {
    expect(DIFFICULTY_INTERVAL).toBe(60);
    expect(DIFFICULTY_MULTIPLIER_PER_TIER).toBe(1.1);
    expect(DIFFICULTY_MAX_MULTIPLIER).toBe(3.0);
  });

  it('speed modifier presets are ordered slow < normal < double', () => {
    expect(SPEED_MOD_SLOW).toBeLessThan(SPEED_MOD_NORMAL);
    expect(SPEED_MOD_NORMAL).toBeLessThan(SPEED_MOD_DOUBLE);
    expect(SPEED_MOD_NORMAL).toBe(1.0);
  });

  it('danger zone is 3 blocks below game-over height', () => {
    expect(GAME_OVER_HEIGHT).toBe(19.5);
    expect(DANGER_ZONE_HEIGHT).toBe(GAME_OVER_HEIGHT - 3);
  });
});

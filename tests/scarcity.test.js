import { describe, it, expect } from 'vitest';
import {
  SCARCITY_CURVES,
  SCARCITY_CURVES_EXPEDITION,
  SCARCITY_CURVES_ENDLESS_SURVIVAL,
  SCARCITY_CURVES_DEPTHS,
  SCARCITY_DEPLETION_THRESHOLD,
  interpolateCurve,
  getWeightsAt,
  getDepletingTypes,
} from './lib/scarcity.js';

// Block indices: 3=Gold, 6=Lava, 7=Crystal, 8=Diamond

describe('interpolateCurve', () => {
  it('returns start weight before first breakpoint', () => {
    const pts = [[0, 4], [180, 4], [300, 2], [480, 1], [600, 0]];
    expect(interpolateCurve(pts, -10)).toBe(4);
    expect(interpolateCurve(pts, 0)).toBe(4);
  });

  it('returns end weight after last breakpoint', () => {
    const pts = [[0, 4], [180, 4], [300, 2], [480, 1], [600, 0]];
    expect(interpolateCurve(pts, 700)).toBe(0);
    expect(interpolateCurve(pts, 600)).toBe(0);
  });

  it('linearly interpolates between breakpoints', () => {
    const pts = [[0, 0], [100, 10]];
    expect(interpolateCurve(pts, 50)).toBe(5);
    expect(interpolateCurve(pts, 25)).toBe(2.5);
    expect(interpolateCurve(pts, 75)).toBe(7.5);
  });

  it('handles flat segments', () => {
    const pts = [[0, 4], [180, 4], [300, 2]];
    expect(interpolateCurve(pts, 90)).toBe(4);
    expect(interpolateCurve(pts, 180)).toBe(4);
  });
});

describe('Gold (index 3) scarcity curve — standard', () => {
  it('is abundant (weight 4) during first 3 minutes', () => {
    expect(interpolateCurve(SCARCITY_CURVES[3].curve, 0)).toBe(4);
    expect(interpolateCurve(SCARCITY_CURVES[3].curve, 90)).toBe(4);
    expect(interpolateCurve(SCARCITY_CURVES[3].curve, 180)).toBe(4);
  });

  it('starts declining after 3 minutes (t=180)', () => {
    const at3min = interpolateCurve(SCARCITY_CURVES[3].curve, 180);
    const at5min = interpolateCurve(SCARCITY_CURVES[3].curve, 300);
    expect(at5min).toBeLessThan(at3min);
  });

  it('is nearly gone by 8 minutes (t=480)', () => {
    expect(interpolateCurve(SCARCITY_CURVES[3].curve, 480)).toBe(1);
  });

  it('reaches zero by 10 minutes (t=600)', () => {
    expect(interpolateCurve(SCARCITY_CURVES[3].curve, 600)).toBe(0);
  });
});

describe('Diamond (index 8) scarcity curve — standard', () => {
  it('is zero before 7 minutes (t=420)', () => {
    expect(interpolateCurve(SCARCITY_CURVES[8].curve, 0)).toBe(0);
    expect(interpolateCurve(SCARCITY_CURVES[8].curve, 300)).toBe(0);
    expect(interpolateCurve(SCARCITY_CURVES[8].curve, 420)).toBe(0);
  });

  it('becomes non-zero after the 7-minute gate (t>420)', () => {
    expect(interpolateCurve(SCARCITY_CURVES[8].curve, 480)).toBeGreaterThan(0);
    expect(interpolateCurve(SCARCITY_CURVES[8].curve, 540)).toBe(1);
  });

  it('rises to peak by 12 minutes (t=720)', () => {
    expect(interpolateCurve(SCARCITY_CURVES[8].curve, 720)).toBe(3);
  });
});

describe('Crystal (index 7) scarcity curve — standard', () => {
  it('starts rare and peaks mid-game', () => {
    const early = interpolateCurve(SCARCITY_CURVES[7].curve, 0);
    const peak  = interpolateCurve(SCARCITY_CURVES[7].curve, 360);
    expect(peak).toBeGreaterThan(early);
  });
});

describe('Lava (index 6) scarcity curve — standard', () => {
  it('rises over time as heat builds', () => {
    const early = interpolateCurve(SCARCITY_CURVES[6].curve, 0);
    const late  = interpolateCurve(SCARCITY_CURVES[6].curve, 600);
    expect(late).toBeGreaterThan(early);
  });
});

describe('getWeightsAt', () => {
  it('returns 8 weight entries for all block types', () => {
    const w = getWeightsAt(SCARCITY_CURVES, 0);
    expect(Object.keys(w).length).toBe(8);
    for (let i = 1; i <= 8; i++) expect(w[i]).toBeDefined();
  });

  it('gold starts at 4 and diamond starts at 0 at t=0', () => {
    const w = getWeightsAt(SCARCITY_CURVES, 0);
    expect(w[3]).toBe(4);
    expect(w[8]).toBe(0);
  });

  it('gold is 0 and diamond > 0 at t=700', () => {
    const w = getWeightsAt(SCARCITY_CURVES, 700);
    expect(w[3]).toBe(0);
    expect(w[8]).toBeGreaterThan(0);
  });
});

describe('getDepletingTypes', () => {
  it('returns empty array when nothing is depleting at t=0', () => {
    const d = getDepletingTypes(SCARCITY_CURVES, 0);
    expect(d).not.toContain(3); // gold is stable at 4, not depleting
  });

  it('includes gold when it is in the decline phase around t=450', () => {
    // At t=450, gold weight is between 1 and 2, peak=4; ratio < 0.35
    const w = interpolateCurve(SCARCITY_CURVES[3].curve, 450);
    const ratio = w / SCARCITY_CURVES[3].peak;
    expect(ratio).toBeLessThan(SCARCITY_DEPLETION_THRESHOLD);
    const d = getDepletingTypes(SCARCITY_CURVES, 450);
    expect(d).toContain(3);
  });

  it('does not include gold after it has fully depleted (w=0)', () => {
    // At t=700, gold weight is 0 — excluded because w <= 0
    const d = getDepletingTypes(SCARCITY_CURVES, 700);
    expect(d).not.toContain(3);
  });
});

describe('Expedition curves vs standard', () => {
  it('gold depletes earlier in expedition (gone by t=420 vs t=600 standard)', () => {
    const stdAt420  = interpolateCurve(SCARCITY_CURVES[3].curve, 420);
    const expAt420  = interpolateCurve(SCARCITY_CURVES_EXPEDITION[3].curve, 420);
    expect(expAt420).toBeLessThan(stdAt420);
  });

  it('lava is higher at start in expedition', () => {
    const std = interpolateCurve(SCARCITY_CURVES[6].curve, 0);
    const exp = interpolateCurve(SCARCITY_CURVES_EXPEDITION[6].curve, 0);
    expect(exp).toBeGreaterThan(std);
  });
});

describe('Endless Survival curves', () => {
  it('gold depletes later than standard survival (gold at t=300 is still high)', () => {
    const stdAt300 = interpolateCurve(SCARCITY_CURVES[3].curve, 300);
    const esAt300  = interpolateCurve(SCARCITY_CURVES_ENDLESS_SURVIVAL[3].curve, 300);
    expect(esAt300).toBeGreaterThanOrEqual(stdAt300);
  });

  it('gold is eventually depleted (at t=780 for endless survival)', () => {
    expect(interpolateCurve(SCARCITY_CURVES_ENDLESS_SURVIVAL[3].curve, 780)).toBe(0);
  });

  it('diamond unlocks later than standard (at t=600 vs t=540)', () => {
    const stdDiamond600 = interpolateCurve(SCARCITY_CURVES[8].curve, 600);
    const esDiamond600  = interpolateCurve(SCARCITY_CURVES_ENDLESS_SURVIVAL[8].curve, 600);
    expect(esDiamond600).toBe(1);
    expect(stdDiamond600).toBeGreaterThanOrEqual(esDiamond600);
  });
});

describe('The Depths curves', () => {
  it('gold depletes faster than standard (gone by t=360 vs t=600)', () => {
    expect(interpolateCurve(SCARCITY_CURVES_DEPTHS[3].curve, 360)).toBe(0);
    expect(interpolateCurve(SCARCITY_CURVES[3].curve, 360)).toBeGreaterThan(0);
  });

  it('lava starts elevated (weight 3 at t=0)', () => {
    expect(interpolateCurve(SCARCITY_CURVES_DEPTHS[6].curve, 0)).toBe(3);
  });

  it('lava surges to extreme levels late-game', () => {
    const lavaLate = interpolateCurve(SCARCITY_CURVES_DEPTHS[6].curve, 600);
    expect(lavaLate).toBeGreaterThanOrEqual(6);
  });

  it('diamond unlocks earlier than standard (non-zero at t=360)', () => {
    const depthsDiamond360 = interpolateCurve(SCARCITY_CURVES_DEPTHS[8].curve, 360);
    const stdDiamond360    = interpolateCurve(SCARCITY_CURVES[8].curve, 360);
    expect(depthsDiamond360).toBeGreaterThan(stdDiamond360);
  });
});

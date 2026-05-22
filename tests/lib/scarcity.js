// Pure scarcity helpers extracted from js/world/scarcity.js for unit testing.

export const SCARCITY_CURVES = {
  3: { curve: [[0, 4], [180, 4], [300, 2], [480, 1], [600, 0]], peak: 4 },
  7: { curve: [[0, 1], [240, 2], [360, 3], [540, 2], [720, 1]], peak: 3 },
  6: { curve: [[0, 1], [300, 2], [600, 4]], peak: 4 },
  8: { curve: [[0, 0], [420, 0], [540, 1], [720, 3]], peak: 3 },
};

export const SCARCITY_BASE_WEIGHTS = { 1: 2, 2: 3, 3: 4, 4: 2, 5: 2, 6: 1, 7: 1, 8: 0 };

export const SCARCITY_CURVES_EXPEDITION = {
  3: { curve: [[0, 4], [120, 4], [200, 2], [300, 1], [420, 0]], peak: 4 },
  7: { curve: [[0, 2], [180, 3], [300, 4], [480, 2], [600, 1]], peak: 4 },
  6: { curve: [[0, 2], [240, 4], [480, 5]], peak: 5 },
  8: { curve: [[0, 0], [300, 0], [420, 2], [600, 3]], peak: 3 },
};

export const SCARCITY_CURVES_ENDLESS_SURVIVAL = {
  3: { curve: [[0, 4], [240, 4], [420, 2], [600, 1], [780, 0]], peak: 4 },
  7: { curve: [[0, 1], [300, 2], [480, 4], [660, 3], [900, 1]], peak: 4 },
  6: { curve: [[0, 1], [360, 2], [720, 5]], peak: 5 },
  8: { curve: [[0, 0], [480, 0], [600, 1], [840, 3]], peak: 3 },
};

export const SCARCITY_CURVES_DEPTHS = {
  3: { curve: [[0, 4], [90, 4], [150, 2], [240, 1], [360, 0]], peak: 4 },
  7: { curve: [[0, 1], [120, 2], [240, 3], [420, 2], [600, 1]], peak: 3 },
  6: { curve: [[0, 3], [180, 4], [360, 6]], peak: 6 },
  8: { curve: [[0, 0], [240, 0], [360, 1], [540, 3]], peak: 3 },
};

export const SCARCITY_DEPLETION_THRESHOLD = 0.35;

export function interpolateCurve(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, w0] = pts[i];
    const [t1, w1] = pts[i + 1];
    if (t >= t0 && t <= t1) {
      return w0 + (w1 - w0) * (t - t0) / (t1 - t0);
    }
  }
  return last[1];
}

/**
 * Returns spawn weights for all 8 block types at time t.
 * @param {object} curveSet - map of idx -> { curve, peak }
 * @returns {object} map of idx -> float weight
 */
export function getWeightsAt(curveSet, t) {
  const weights = {};
  for (let i = 1; i <= 8; i++) {
    const entry = curveSet[i];
    if (entry) {
      weights[i] = interpolateCurve(entry.curve, t);
    } else {
      weights[i] = SCARCITY_BASE_WEIGHTS[i] !== undefined ? SCARCITY_BASE_WEIGHTS[i] : 1;
    }
  }
  return weights;
}

/**
 * Returns array of block type indices currently depleting (weight declining and below threshold).
 * @param {object} curveSet - map of idx -> { curve, peak }
 * @param {number} t - current elapsed seconds
 */
export function getDepletingTypes(curveSet, t) {
  const depleting = [];
  for (const idxStr in curveSet) {
    const idx = parseInt(idxStr, 10);
    const entry = curveSet[idx];
    if (!entry) continue;
    const w = interpolateCurve(entry.curve, t);
    if (w <= 0) continue;
    if (w < entry.peak * SCARCITY_DEPLETION_THRESHOLD) {
      const wFuture = interpolateCurve(entry.curve, t + 30);
      if (wFuture <= w + 0.05) depleting.push(idx);
    }
  }
  return depleting;
}

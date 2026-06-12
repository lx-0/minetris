# Design: Obsidian FORTIFY Activation Banner & Sound (MINAA-763)

**Status:** DRAFT — awaiting CEO confirmation
**Author:** GameDesigner
**Date:** 2026-06-09
**Depends on:** None (banner + audio infrastructure already exists from MINAA-671)
**Related:** MINAA-671 (CLEAVE/PIERCE/BLAST ability banners — shipped), MINAA-746 (tier-up celebration — shipped), MINAA-759 (design audit — origin), MINAA-630 (tool progression overhaul)

---

## Problem

CLEAVE, PIERCE, and BLAST all get color-coded `showTierAbilityBanner()` banners and distinct `playTierAbilitySound()` audio cues every time they fire. FORTIFY — the endgame Obsidian ability — operates in total silence. The player who invested the most mining effort gets the weakest feedback.

**Current state:**

| Tier | Ability | Banner | Sound | Visual Effect |
|------|---------|--------|-------|---------------|
| Stone | CLEAVE | Orange "CLEAVE!" (1s) | Stone-crack + G5 ping | Orange emissive on target |
| Iron | PIERCE | Cyan "PIERCE!" (1s) | Metallic D5→A5 ping | Cyan emissive on target |
| Diamond | BLAST | Indigo "BLAST!" (1s) | Bass A1 rumble + E5→B5→E6 shimmer | Blue magnetic flash on diagonals |
| **Obsidian** | **FORTIFY** | **None** | **None** | **None** |

The root cause is that FORTIFY is passive (always-on hit reduction at `input.js:175`), not event-based like the other three. There's no discrete "it just fired" moment to hook a banner onto. This requires a different feedback strategy.

---

## Design Goals

1. **Parity, not parity** — FORTIFY needs *acknowledgment*, not the same per-activation banner spam. Showing "FORTIFY!" on every single mine hit would be obnoxious because it fires on literally every block. The feedback weight should match the ability's *passive* nature.
2. **Teach on first encounter** — the player should understand FORTIFY is active and what it does the first time it matters.
3. **Ambient reinforcement** — after the initial banner, a subtle per-block visual cue keeps the ability "felt" without demanding attention.
4. **Consistent vocabulary** — reuse `showTierAbilityBanner()` and `playTierAbilitySound()` so the ability-feedback system stays unified.
5. **Endgame weight** — Obsidian is the final pickaxe. The audio and visual should feel *powerful and deep*, not just another ping.

---

## Decision: Option 1 + Option 2 (Hybrid)

The issue proposed three options. Recommendation:

| Option | Description | Verdict | Rationale |
|--------|-------------|---------|-----------|
| **1. One-time banner** | Show "FORTIFY" banner on first mine action after equipping Obsidian | **Primary — ship this** | Consistent with the tier-up celebration pattern. One moment of acknowledgment, then gets out of the way. |
| **2. Per-block glow** | Subtle purple emissive flash on each block when hit count is reduced | **Enhancement — ship this** | Ambient "feel" layer. Players won't consciously notice it, but they'll feel the pickaxe is doing something. Minimal perf cost (one emissive color set per hit, already done for CLEAVE/PIERCE). |
| 3. Periodic reminder | "FORTIFY ACTIVE" every N blocks | **Rejected** | Periodic reminders are annoying, don't map to player agency, and feel like a tooltip, not a game moment. |

---

## Spec A: One-Time Activation Banner

### When to Show

```
On mine action (mousedown on a valid block):
  IF obsidianPickaxeActive is true
  AND _fortifyBannerShown is false:
    → Show "FORTIFY" banner via showTierAbilityBanner()
    → Play FORTIFY sound via playTierAbilitySound('obsidian')
    → Set _fortifyBannerShown = true
```

### Trigger Location

`js/player/input.js`, inside the mining hit handler, after line 175 (the `obsidianPickaxeActive` hit reduction):

```
if (obsidianPickaxeActive) clicksNeeded = Math.max(1, clicksNeeded - 1);
// NEW: one-time FORTIFY activation feedback
if (obsidianPickaxeActive && !_fortifyBannerShown) {
  showTierAbilityBanner('FORTIFY', '#7c3aed');
  playTierAbilitySound('obsidian');
  _fortifyBannerShown = true;
}
```

### Session Tracking

Add a file-scope flag in `input.js` (or `state.js` alongside `obsidianPickaxeActive`):

```javascript
let _fortifyBannerShown = false;
```

Reset to `false` on game start / new session (same reset point where `obsidianPickaxeActive` is reset to `false`).

### Banner Visual

Reuses existing `showTierAbilityBanner(text, color)` — no new DOM elements or CSS needed.

| Property | Value |
|----------|-------|
| Text | `"FORTIFY"` |
| Color | `#7c3aed` (deep purple — matches Obsidian tier color from `_PICKAXE_TIER_CELEBRATION`) |
| Text shadow glow | `2px 2px 4px #000, 0 0 14px #7c3aed` (auto-set by `showTierAbilityBanner`) |
| Duration | 1000ms (existing banner timer) |
| Animation | `tier-ability-bounce` 0.38s (existing CSS) |
| Position | `top: 27%; left: 50%` (existing `#tier-ability-banner` placement) |

**No new CSS, no new DOM elements.** The existing infrastructure handles it.

---

## Spec B: FORTIFY Audio Cue

### Sound Design

FORTIFY's sound should feel like the final evolution — deeper, more resonant, and "heavier" than CLEAVE/PIERCE/BLAST. Since it only plays once per session, it can be slightly longer and more dramatic.

**Concept:** A deep resonant hum with ascending harmonic overtone — like an obsidian blade being drawn from a stone sheath. Combines the bass weight of BLAST's rumble with a slow crystalline resolve.

### Implementation

Add an `'obsidian'` branch to `playTierAbilitySound()` in `js/audio/audio-sfx.js` (after the existing `diamond` branch at line 319):

```javascript
} else if (tier === 'obsidian') {
  // Deep resonant hum + slow ascending resolve
  if (rumbleSynth) {
    try { rumbleSynth.triggerAttackRelease('D1', '4n', now); } catch (_e) {}
  }
  if (blockBreakSynth) {
    try { blockBreakSynth.triggerAttackRelease('D4', '8n', now + 0.10, 0.35); } catch (_e) {}
  }
  if (clearSynth) {
    try { clearSynth.triggerAttackRelease('A4', '16n', now + 0.20, 0.40); } catch (_e) {}
    try { clearSynth.triggerAttackRelease('D5', '16n', now + 0.32, 0.30); } catch (_e) {}
    try { clearSynth.triggerAttackRelease('F#5', '32n', now + 0.44, 0.20); } catch (_e) {}
  }
}
```

### Sound Breakdown

| Component | Synth | Note | Timing | Feel |
|-----------|-------|------|--------|------|
| Bass foundation | `rumbleSynth` | D1 (quarter note) | +0ms | Deep earth rumble — heavier than BLAST's A1 |
| Mid body | `blockBreakSynth` | D4 (8th note) | +100ms | Warm resonance filling the midrange |
| Resolve 1 | `clearSynth` | A4 (16th note, vel 0.40) | +200ms | Crystalline overtone begins |
| Resolve 2 | `clearSynth` | D5 (16th note, vel 0.30) | +320ms | Ascending — building power |
| Resolve 3 | `clearSynth` | F#5 (32nd note, vel 0.20) | +440ms | Fades to a high shimmer — "ability locked in" |

**Musical interval:** D minor triad (D1→D4→A4→D5→F#5) — resolves as a D major with the F#. The shift from minor to major on the last note gives a "power confirmed" feeling.

**Total duration:** ~500ms (longer than CLEAVE's 50ms or PIERCE's 100ms, shorter than a full chime). Appropriate for a one-time-per-session event.

### Comparison to Other Tiers

| Tier | Duration | Character | Complexity |
|------|----------|-----------|------------|
| Stone (CLEAVE) | ~50ms | Sharp crack | 2 sounds |
| Iron (PIERCE) | ~100ms | Metallic ping | 2 notes |
| Diamond (BLAST) | ~320ms | Bass + shimmer | 4 sounds |
| **Obsidian (FORTIFY)** | **~500ms** | **Deep hum + crystalline resolve** | **5 sounds** |

Escalating complexity matches the tier progression. Each tier's sound is longer and richer than the last.

---

## Spec C: Per-Block Purple Emissive (Enhancement)

### What

When the player hits a block and FORTIFY reduces the hit count, flash a subtle purple emissive on the block mesh. This is the same pattern used by CLEAVE (orange emissive at `powerups.js:119`) and PIERCE (cyan emissive at `powerups.js:168`).

### When

Every mine hit where `obsidianPickaxeActive` reduces `clicksNeeded`. This happens at `input.js:175`.

### Implementation

In `js/player/input.js`, immediately after the FORTIFY hit reduction (line 175):

```javascript
if (obsidianPickaxeActive) clicksNeeded = Math.max(1, clicksNeeded - 1);
// Obsidian FORTIFY: purple emissive flash on affected block
if (obsidianPickaxeActive && targetedBlock && targetedBlock.material) {
  targetedBlock.material.emissive = new THREE.Color(0.30, 0.10, 0.55);
  targetedBlock.material.needsUpdate = true;
}
```

### Visual Parameters

| Property | Value | Rationale |
|----------|-------|-----------|
| Emissive RGB | `(0.30, 0.10, 0.55)` — muted purple | Matches `#7c3aed` Obsidian tier color in emissive space. Deliberately dimmer than CLEAVE's (0.55, 0.35, 0.0) — FORTIFY is passive, not a dramatic event. |
| Duration | Until block is broken or player looks away | Same as CLEAVE/PIERCE — emissive stays until the block state changes. No explicit timer needed. |
| Performance | 1 emissive color set per mine hit | Identical cost to existing CLEAVE/PIERCE emissive. No new objects, no particles. |

### Why Subtle

FORTIFY fires on *every single hit*. If the emissive were as bright as CLEAVE's, the entire mining field would glow purple constantly. The muted intensity keeps it ambient — "I can tell my pickaxe is special" without "everything is purple."

---

## Integration Summary

| File | Change | Scope |
|------|--------|-------|
| `js/player/input.js` | Add `_fortifyBannerShown` flag; add one-time banner trigger after line 175; add per-block purple emissive | Primary |
| `js/audio/audio-sfx.js` | Add `'obsidian'` branch to `playTierAbilitySound()` after line 319 | Audio |
| `js/core/state.js` | Add `_fortifyBannerShown` reset in session init (if flag lives here instead of input.js) | State reset |

### What NOT to Touch

- `js/player/powerups.js` — FORTIFY has no active-trigger logic like CLEAVE/PIERCE/BLAST. The banner call goes in `input.js` where the passive reduction already lives.
- `js/player/crafting.js` — the tier-up celebration (MINAA-746) already handles the *acquisition* moment. This spec handles the *first use* moment.
- `css/style.css` — no new styles needed; reuses `#tier-ability-banner` as-is.
- `index.html` — no new DOM elements.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Player equips Obsidian, first mine hit | Banner + sound fire. Emissive appears on block. |
| Player mines second block (same session) | No banner, no sound. Emissive appears on block. |
| Player prestige-resets and re-crafts Obsidian | `_fortifyBannerShown` resets with session. Banner fires again on first mine. |
| Obsidian + Earthquake active simultaneously | Both reduce hits. Purple emissive still appears (FORTIFY is still active). No conflict. |
| FORTIFY banner collides with CLEAVE/PIERCE/BLAST banner | Impossible — Obsidian tier replaces lower tiers. You can't have CLEAVE and FORTIFY active simultaneously. |
| Audio muted | `playTierAbilitySound` already respects `audioReady` gate. Banner still appears. |
| Reduced motion | `tier-ability-bounce` animation plays (existing behavior for all tier banners). Could add reduced-motion override in future pass. |

---

## Visual Hierarchy During Obsidian Mining

```
         ┌─────────────────────────────┐
  27%    │        FORTIFY              │  ← one-time tier-ability banner (deep purple)
         └─────────────────────────────┘
                                          ← subsequent hits: no banner, just purple
                                            emissive glow on the block being mined

         ┌─────────────────────────────┐
  40%    │      B2B DOUBLE!  3×        │  ← generic line-clear banner (if applicable)
         └─────────────────────────────┘
```

After the one-time banner, FORTIFY's ongoing presence is communicated entirely through the purple emissive — a "feel it, don't read it" approach appropriate for a passive ability.

---

## Success Criteria

1. First-time Obsidian users see and hear that FORTIFY is active without needing to read a tooltip.
2. The audio feels like the final tier — deeper and more resonant than Diamond's BLAST.
3. Ongoing mining with Obsidian has a subtle purple "glow" that distinguishes it from lower tiers.
4. Zero banner spam — the one-time trigger respects endgame players who don't need constant reminders.
5. Zero regression to CLEAVE/PIERCE/BLAST feedback or any other banner system.

---

## Implementation Estimate

| Component | Lines | Risk |
|-----------|-------|------|
| One-time banner trigger (`input.js`) | ~8 lines | Low — additive, no existing behavior changed |
| Per-block emissive (`input.js`) | ~4 lines | Low — identical pattern to CLEAVE/PIERCE |
| Audio branch (`audio-sfx.js`) | ~10 lines | Low — additive branch in existing switch |
| State reset | ~1 line | Low — follows existing reset pattern |
| **Total** | **~23 lines** | **Low** |

Smallest possible change set. No new files, no new DOM, no new CSS, no new globals beyond one boolean flag.

---

## Open Questions for CEO

1. **Banner text:** `"FORTIFY"` (matches the other abilities: "CLEAVE!", "PIERCE!", "BLAST!") — should it include an exclamation mark (`"FORTIFY!"`) for consistency, or keep it without to reflect the calmer, passive nature?
2. **Emissive intensity:** Spec proposes (0.30, 0.10, 0.55) — deliberately muted. Should it be brighter to better signal "your pickaxe is special"?
3. **Sound length:** 500ms is longer than other tier sounds but only plays once per session. Acceptable, or trim to ~320ms (matching BLAST)?

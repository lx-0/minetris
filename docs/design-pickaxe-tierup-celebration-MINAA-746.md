# Design: Pickaxe Tier-Up Celebration (MINAA-746)

**Status:** DRAFT — awaiting CEO confirmation
**Author:** GameDesigner
**Date:** 2026-05-11
**Depends on:** None (standalone feature)
**Related:** MINAA-671 (ability-use banners — done), MINAA-744 (design audit — origin)

---

## Problem

Crafting a new pickaxe tier — the single biggest progression reward in the mining loop — triggers a flat 1.8s green text banner (`"Crafted! Stone Pickaxe"`) with no sound and no explanation of the new ability. The player has no "aha" moment connecting the craft to the power they just unlocked.

The mastery system already celebrates unlocks with a 3s overlay, ascending chime, tier-colored border, and cosmetic preview. Pickaxe tier-ups deserve at least equal treatment — they're the reward the player *earned through mining*, the core loop.

---

## Design Goals

1. **Celebrate proportionally** — the emotional weight of the overlay should match the gameplay impact of the upgrade.
2. **Teach on acquire** — the player should leave the overlay knowing what their new ability does, without needing to read a wiki.
3. **First-time only** — subsequent crafts of the same tier in the same session use the existing 1.8s banner. The celebration is for the *discovery* moment.
4. **Consistent vocabulary** — reuse the mastery overlay's visual and audio language so players recognize "big unlock" across systems.

---

## Tier Reference

| Tier | Icon | Color | Ability Name | One-Line Description |
|------|------|-------|-------------|---------------------|
| Stone | ⛏ | `#a0826d` (warm brown) | CLEAVE | Every 3rd hit breaks an adjacent block |
| Iron | ⚒ | `#b0b0b0` (silver) | PIERCE | Each break also breaks the block behind it |
| Diamond | 💎 | `#4dd0e1` (cyan) | BLAST | Each break triggers a cross-pattern AOE |
| Obsidian | ◆ | `#7c3aed` (deep purple) | FORTIFY | Reduces all block hit counts by 1 |

> **Icon note:** Use text/emoji icons (same approach as mastery tier icons) — no image assets required.

---

## Overlay Spec

### Layout

```
┌─────────────────────────────────────────┐
│          (semi-transparent backdrop)     │
│                                         │
│        ┌───────────────────────┐        │
│        │                       │        │
│        │      ⛏  (tier icon)   │        │
│        │                       │        │
│        │   PICKAXE UPGRADED    │        │
│        │                       │        │
│        │    Stone Pickaxe      │        │
│        │                       │        │
│        │  ── CLEAVE ──         │        │
│        │  Every 3rd hit breaks │        │
│        │  an adjacent block    │        │
│        │                       │        │
│        │   [TAP TO CONTINUE]   │        │
│        └───────────────────────┘        │
│                                         │
└─────────────────────────────────────────┘
```

### Visual Treatment

| Element | Style | Notes |
|---------|-------|-------|
| **Backdrop** | `rgba(0,0,0,0.75)`, fullscreen fixed, z-index `99998` | Same pattern as mastery overlay; one layer below mastery (99999) so mastery always wins in edge-case collision |
| **Panel** | Dark bg `rgba(10,10,20,0.97)`, tier-colored 3px border, `box-shadow: 0 0 30px {tierColor}40` | Mirror mastery panel styling. Min-width 260px, max-width 340px |
| **Tier icon** | 48px font size, centered | Text emoji, tier-colored text-shadow glow |
| **Header** | `"PICKAXE UPGRADED"`, tier-colored, Press Start 2P 14px | Analogous to mastery's `"MASTERY UNLOCKED"` |
| **Pickaxe name** | White, Press Start 2P 11px | e.g. "Stone Pickaxe" |
| **Ability name** | Tier-colored, Press Start 2P 12px, flanked by em-dashes | e.g. "── CLEAVE ──" |
| **Ability description** | `#ccc`, Press Start 2P 8px, max 2 lines | Plain language, no jargon |
| **Dismiss button** | `"TAP TO CONTINUE"`, muted gray, 8px | Same as mastery dismiss |
| **Border glow** | Tier-colored, pulses once on entrance via keyframe | Subtle — don't compete with the chime |

### Animations

| Animation | Spec | Reference |
|-----------|------|-----------|
| **Backdrop fade-in** | `opacity 0→1`, 0.3s ease | Same as `muo-fade-in` |
| **Panel pop-in** | `scale(0.8)→scale(1)` + `opacity 0→1`, 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) | Same as `muo-pop-in` (bouncy) |
| **Border glow pulse** | `box-shadow` intensity 1×→1.5×→1×, 0.6s ease, once | New — adds "shimmer" on entrance |

### Timing

- **Display duration:** 3 seconds auto-dismiss (matches mastery)
- **Early dismiss:** Click/tap on backdrop or dismiss button
- **Pause state:** If game is paused while overlay is showing, pause the dismiss timer

### DOM Approach

Dynamically create the overlay element on first use (same pattern as mastery overlay in `mastery.js:384-409`). Reuse on subsequent tier-ups by updating content. ID: `pickaxe-upgrade-overlay`.

---

## Audio Spec

### Ascending Tier Chime

Reuse the mastery chime pattern (`_playMasteryChime` in `mastery.js:444-472`) with tier-specific note counts scaled to pickaxe tiers:

| Tier | Notes | Base Freq | Note Duration | Feel |
|------|-------|-----------|---------------|------|
| Stone | 3 | 440 Hz (A4) | 0.12s | Short, bright — "you got something" |
| Iron | 4 | 440 Hz | 0.14s | Fuller — "this is meaningful" |
| Diamond | 5 | 440 Hz | 0.16s | Triumphant — "you earned this" |
| Obsidian | 6 | 440 Hz | 0.18s | Grand — "endgame power" |

**Implementation:** Create a `_playPickaxeUpgradeChime(tierName)` function that mirrors `_playMasteryChime` but maps `['stone','iron','diamond','obsidian']` → `[3,4,5,6]` notes. Same major-scale ratios, same sine oscillator + gain envelope.

**Volume:** Match mastery chime volume (gain 0.28). Respects the existing global mute/volume state.

---

## Trigger Logic

### When to show the celebration overlay

```
On successful pickaxe craft:
  IF this tier has NOT been celebrated this session:
    → Show celebration overlay + play chime
    → Mark tier as celebrated
  ELSE:
    → Show existing 1.8s "Crafted!" banner (current behavior)
```

### Session tracking

Add a runtime object (no localStorage needed):

```javascript
var _pickaxeTierCelebrated = {
  stone: false,
  iron: false,
  diamond: false,
  obsidian: false
};
```

Reset on game start / new session. Check and set in `craftRecipe()` when the recipe is a pickaxe tier recipe.

### Recipe identification

The four pickaxe recipes have IDs: `stone_pickaxe`, `iron_pickaxe`, `diamond_pickaxe`, `obsidian_pickaxe`. Map recipe ID → tier name for the celebration check.

---

## Integration Points

| File | Change | Scope |
|------|--------|-------|
| `js/player/crafting.js` | Add celebration trigger in `craftRecipe()` after line 333; add `_pickaxeTierCelebrated` state; add overlay + chime functions | Primary |
| `css/style.css` | Add `.puo-*` classes (pickaxe upgrade overlay) — mirror `.muo-*` mastery overlay styles with tier-color parameterization | Styles |
| `index.html` | No change — overlay is dynamically created | None |
| `tools/smoke-test.js` | No change — no new static DOM IDs | None |

### What NOT to touch

- `js/player/ore-crafting.js` — separate system (pattern-based ore powers)
- `js/player/powerups.js` — ability *use* banners (MINAA-671), not *acquisition*
- `js/progression/mastery.js` — read-only reference, don't modify

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Player crafts Stone, then Iron in same session | Stone gets celebration, Iron gets celebration (each tier tracked independently) |
| Player crafts Stone twice in same session | First → celebration, second → existing 1.8s banner |
| Mastery overlay showing when pickaxe is crafted | Queue pickaxe overlay after mastery dismisses (unlikely in practice — mastery triggers on mode completion, not during crafting) |
| Game paused during overlay | Pause dismiss timer, resume on unpause |
| Player clicks dismiss immediately | Overlay hides, chime continues playing (audio is fire-and-forget) |
| Obsidian tier (less common, requires crafting bench) | Same celebration pattern, 6-note chime, deep purple theme |

---

## Success Criteria

1. First-time players immediately understand what their new pickaxe ability does without reading external docs.
2. The moment *feels* like a reward — audio + visual weight proportional to gameplay impact.
3. Repeat crafts in the same session don't annoy with redundant celebrations.
4. Zero regression to existing crafting, mastery, or mining ability systems.

---

## Implementation Estimate

- **Overlay + CSS:** ~80 lines JS, ~60 lines CSS (mirrors mastery overlay pattern)
- **Audio:** ~30 lines JS (mirrors mastery chime pattern)
- **Trigger logic:** ~20 lines JS in `craftRecipe()`
- **Total:** ~190 lines across 2 files
- **Risk:** Low — additive feature, no existing behavior modified except gating the banner call behind a first-craft check

---

## Open Questions for CEO

1. **Overlay duration:** 3s matches mastery. Should pickaxe be shorter (2s) since it happens mid-gameplay rather than at mode completion?
2. **Obsidian ability name:** The config calls it "reduces block hit counts by 1" — I've proposed "FORTIFY" as the ability name. Alternative: "TEMPER" or "HARDEN". Preference?
3. **Border glow pulse:** The spec includes a one-time shimmer on entrance. Should we skip this for simplicity in v1?

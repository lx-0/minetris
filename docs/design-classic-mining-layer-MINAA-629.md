# Design Spec: Mining Layer for Classic Mode

**Issue:** MINAA-629
**Author:** GameDesigner
**Status:** Draft — awaiting CEO review
**Date:** 2026-04-24

---

## 1. Design Intent

Classic mode is the front door. Every new player lands here. Today it plays as standard 3D Tetris with a Minecraft skin — pieces fall, lines clear, difficulty ramps. Mining exists in the engine but Classic doesn't use it meaningfully. The player watches. The player waits. The player is passive.

This spec adds the mining layer: the player can break landed blocks with their pickaxe, mined blocks obey gravity and fall, and fast sequential mining triggers streak chain reactions that cascade into line clears. The goal is one sentence: **Classic mode should feel like you're inside a Tetris board with a pickaxe, not watching one from above.**

This is the single highest-leverage change for mining-first identity. Classic is the mode 100% of players see. If mining feels essential here, the thesis is proven.

---

## 2. Design Pillars

| Pillar | Meaning |
|--------|---------|
| **Mining is agency** | Passive Tetris = waiting for the right piece. Mining = making your own right piece by carving the board. The player should always have something productive to mine. |
| **Physics create surprise** | When mined blocks leave gaps, gravity pulls unsupported blocks down. This creates emergent cascades the player didn't fully predict — the Spelunky feeling of "I caused that." |
| **Streaks reward aggression** | Fast sequential mining builds a streak multiplier. Streaks that trigger physics cascades into line clears are the skill ceiling — the "I meant to do that" moment. |
| **Tetris loop stays intact** | Mining is additive, not replacing. Pieces still fall, lines still clear, difficulty still ramps. A player who never mines still plays valid Classic Tetris. Mining raises the ceiling, not the floor. |

---

## 3. System 1: Mined Blocks in Classic

### 3.1 What Changes

Classic mode enables the existing mining system (raycasting, block damage, material tooltip, dust particles, hit/break sounds). Currently this infrastructure exists in `js/world/mining.js` and `js/player/input.js` but Classic doesn't activate it as a core verb.

### 3.2 Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Mining enabled | Yes (left-click) | Same input as Survival |
| Mining range | 4.5 blocks | Matches existing `MINING_RANGE` |
| Pickaxe tier | Fixed at **Stone** | Classic is the accessible mode. Stone tier caps all blocks at max 2 hits, keeping mining fast. No crafting needed — the pickaxe is free. Iron/Diamond tiers remain gated behind crafting in Survival/Depths. |
| Block hit counts | Per-material, capped at 2 by Stone tier | Dirt=1, Ice=1, Leaf=1, Stone=2, Gold=2, Crystal=2, Wood=2, Moss=2, Lava=2, Rock=2, Plank=2, Diamond=2, Obsidian=2. Void/Bedrock remain unmineable. |
| Mining reward | Score only (material points from `BLOCK_TYPES`) | No inventory in Classic. Inventory is a Survival/Depths verb. Mined blocks award points and disappear. Keeps Classic streamlined. |
| Mined blocks counter | Shown in HUD | Already exists (`blocksMined` in state). Tracks engagement. |

### 3.3 Why No Inventory in Classic

Inventory + placement closes the full Minecraft loop but adds cognitive load (what do I have, where do I place it, which material). Classic should be the mode you understand in 10 seconds. Mining = break blocks for points and board control. Inventory = Survival's territory.

### 3.4 Why Stone Tier by Default

At base tier (no pickaxe), most blocks need 3-5 hits. That's too slow for Classic's pacing where pieces fall every 2 seconds. At Stone tier, everything is 1-2 hits. The player can reactively mine a problem block before the next piece lands. This makes mining feel like a verb, not a chore.

---

## 4. System 2: Block Physics (Gravity for Unsupported Blocks)

### 4.1 The Problem Block Physics Solves

Today, when you mine a block, the blocks above it float. This breaks spatial intuition ("I removed the floor, why didn't the ceiling fall?") and eliminates the most exciting emergent possibility: cascading collapses.

### 4.2 How It Works

When a block is mined (removed from the world):

1. **Adjacency check:** For each block directly above the mined block (Y+1 at same X,Z), check if it has support.
2. **Support definition:** A block is "supported" if it has at least one orthogonal neighbor on the same Y-level (X+-1 or Z+-1) that is itself supported, OR it sits on Y=0 (ground level). This is a flood-fill connectivity check, not just "block directly below."
3. **Unsupported group detection:** If the block at Y+1 has no support path to ground or to a laterally-connected supported block, it and all connected unsupported blocks form a "falling group."
4. **Fall animation:** The falling group drops as a unit at gravity speed (`GRAVITY = 9.8`), same as piece fall physics. Blocks in the group maintain their relative positions.
5. **Landing:** When the falling group hits existing blocks or Y=0, each block snaps to grid, registers in `gridOccupancy`, and triggers a landing thud sound (scaled to group size).
6. **Line clear re-check:** After all falling groups settle, run line-clear detection on affected Y-levels. This is the cascade — mining causes falls, falls complete rows, rows clear.

### 4.3 Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Support model | **Column-only (simple gravity)** for v1, lateral connectivity for v2 | Start simple: a block is unsupported if nothing is directly below it (Y-1 is empty). This is intuitive and cheap to compute. Lateral flood-fill support is more realistic but risks confusing players and is expensive on a 50x50 grid. Ship column gravity first, evaluate lateral support after playtesting. |
| Fall speed | Same as piece gravity: `-(GRAVITY/4) * difficultyMultiplier` | Unsupported blocks fall at the same speed as pieces. This feels natural — everything in the world obeys the same physics. |
| Fall delay | 0.15s after mining completes | Brief pause before blocks start falling. Gives the player a beat to register what happened. Also prevents the "I mined one block and everything collapsed instantly" feel. Anticipation before payoff. |
| Max cascade depth | 5 levels | Safety cap. After 5 successive fall-then-clear events in a single cascade, stop checking. Prevents runaway physics on extreme board states and caps the performance cost. |
| Cascade re-check delay | 0.3s between each cascade level | After a line clears from physics, wait 0.3s, then re-check for new unsupported blocks and new line clears. This pacing lets the player watch each step of the chain reaction unfold. Instant cascades would be visually incomprehensible. |
| Physics scope | Landed blocks only | Falling pieces (active tetrominos) are not affected by block physics. Only blocks already in `gridOccupancy` can become unsupported and fall. |

### 4.4 Visual Feedback for Falling Blocks

| Moment | Effect |
|--------|--------|
| Block becomes unsupported | 0.15s anticipation: block shudders (small random X/Z offset oscillation, 0.02 amplitude, 30Hz). Faint dust particles fall from bottom face. |
| Block starts falling | Trail effect (reuse piece trail system from `js/rendering/trails.js`), but shorter — 4 segments max, 50% opacity. Emissive pulse on the block (match material emissive color, 0.3 intensity). |
| Block lands | Impact dust burst (8-10 particles, same material color). Camera micro-shake (0.04 strength, 0.08s). Thud sound (reuse `stoneHit` at low pitch 0.5-0.7, volume scaled to group size). |
| Cascade line clear | Standard line-clear celebration, but with a **"CASCADE"** banner overlay in orange text. Bonus score flash. The line-clear system already handles multiple simultaneous clears — cascade clears feed into the same combo window. |

### 4.5 Column-Only Support Model (v1 Detail)

For the initial implementation, support is strictly vertical:

```
For each block B that was directly above a mined block:
  if gridOccupancy has no block at (B.x, B.y - 1, B.z):
    B is unsupported → add to falling group
    recursively check (B.x, B.y + 1, B.z) — the block above B
```

This means a horizontal bridge of blocks with a gap underneath will NOT collapse (each block has a block below it, even if the column terminates). Only true vertical towers collapse. This is intentionally conservative — it's easy to understand and matches player intuition from Minecraft (blocks float in Minecraft too, so this is already more physics than players expect).

---

## 5. System 3: Mining Streak Chain Reactions

### 5.1 The Core Fantasy

The player sees a problem: blocks are stacking too high on the left side. A piece just landed awkwardly. Instead of waiting for the right piece, the player starts mining. Click-click-click — three blocks break in rapid succession. The column above collapses. The falling blocks complete a row. The row clears. The clear drops more blocks. Another row completes. **Double cascade.**

That sequence — mine fast, trigger physics, watch the chain reaction — is the skill expression unique to Minetris. No Tetris clone has it. No Minecraft clone has it. This is the moat.

### 5.2 Mining Streak Mechanic

A "mining streak" is a sequence of blocks mined within a time window. Each successive break within the window extends the streak and increases the multiplier.

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Streak window | 1.5s between breaks | Tighter than line-clear combo window (3.0s) because mining is an active verb — the player is clicking, not waiting. 1.5s is ~2-3 clicks at Stone tier speed. |
| Streak multiplier | 1.0x (1st) → 1.5x (2nd) → 2.0x (3rd) → 2.5x (4th) → 3.0x (5th+) | Escalating reward for aggressive mining. Caps at 3.0x to match line-clear combo cap. |
| Streak applies to | Mining score only (block point values) | Streak does NOT multiply line-clear score. Mining and line-clearing have independent scoring tracks. But streak-triggered cascades feed into the line-clear combo window, so the systems compound naturally without explicit coupling. |
| Streak visual | Counter overlay near crosshair: "STREAK x2", "STREAK x3", etc. | Positioned below crosshair, gold text, bounces on each increment. Fades 1.0s after streak ends. Same visual language as combo counter but distinct color (gold vs orange). |
| Streak audio | Ascending pitch chime on each streak increment | Base pitch C4 on 2nd break, +2 semitones per subsequent break (C4, D4, E4, F#4, G#4). Reuse the Tone.js synthesis pattern from combo chimes. Satisfying ascending scale = "I'm building momentum." |

### 5.3 Chain Reaction Scoring

When a mining streak triggers block physics that triggers a line clear, the player earns:

1. **Mining score:** `block_points × streak_multiplier` for each block mined
2. **Cascade bonus:** `50 × cascade_level` bonus points per cascade step (a cascade that goes 3 deep awards 50 + 100 + 150 = 300 bonus)
3. **Line clear score:** Standard line-clear scoring with all existing multipliers (combo, B2B, depth, etc.)
4. **Chain Reaction bonus:** If a line clear was caused by physics (not by a piece landing), award a flat `200` point "CHAIN REACTION" bonus per line cleared this way, displayed as a special banner

The cascade bonus and chain reaction bonus are new scoring primitives unique to the mining layer. They reward the skill of reading the board and mining strategically.

### 5.4 Chain Reaction Visual Language

| Event | Visual | Audio |
|-------|--------|-------|
| Streak x2 reached | Gold pulse ring around crosshair (0.2s expand + fade) | C4 chime |
| Streak x3 reached | Wider gold pulse + subtle screen warm tint (saturation +0.1) | D4 chime |
| Streak x5+ reached | Gold pulse + particle trail on crosshair + screen golden vignette edge (0.1 opacity) | F#4+ chime, rising |
| Physics cascade begins | **"CASCADE"** text in orange, center-screen, 0.8s display | Low rumble (reuse earthquake bass, pitch D2, 0.3s) |
| Chain Reaction line clear | Line-clear celebration plays as normal, PLUS a secondary shockwave ring in gold (distinct from standard cyan). **"CHAIN REACTION!"** banner in gold below the line-clear banner | Standard line-clear audio + additional impact hit (anvil at +3 semitones, brighter) |
| Multi-level cascade (2+) | Each successive cascade level increases the screen shake by +0.05 and flash brightness by +0.08. By cascade level 3+, the screen is shaking noticeably and flashing gold — unmistakable "something big is happening" | Each cascade level adds a bass hit, creating a rhythmic "boom... boom... BOOM" escalation |

---

## 6. Interaction Model

### 6.1 Controls (No Changes)

| Input | Action |
|-------|--------|
| Left-click | Mine targeted block (existing) |
| Right-click | Place block (disabled in Classic — no inventory) |
| Mouse move | Look / aim crosshair (existing) |
| WASD | Move (existing) |
| Q/E/Z/X | Nudge falling piece (existing) |

Mining and piece-nudging coexist. The player constantly switches attention: "Is there a falling piece I should nudge? No? Then I should be mining." This attention-switching IS the Classic mode skill loop.

### 6.2 Player Decision Framework

At any moment in Classic, the player is choosing between:

1. **Watch and nudge** — A piece is falling. Position it optimally with nudge controls.
2. **Mine defensively** — The stack is getting high. Mine blocks to lower it before game over.
3. **Mine for score** — The stack is fine. Mine high-value blocks (gold, crystal, diamond) for points.
4. **Mine for cascade** — Read the board. Identify a block whose removal will trigger a column collapse into a line clear. This is the highest-skill play.
5. **Do nothing** — Sometimes the optimal play is to let a piece land and complete a row naturally. Mining isn't always the answer.

This 5-option decision space is significantly richer than current Classic (options 1 and 5 only). Every option is valid at different moments. That's good game design — no dominant strategy, just reading the board.

### 6.3 Pacing

| Game Phase | Pieces/min | Mining Role |
|------------|-----------|-------------|
| Early (0-120s, Tier 0-1) | ~30 | **Exploratory.** Stack is low, no pressure. Player learns that mining works, experiments with breaking blocks, discovers physics. Score-mining for fun. |
| Mid (120-300s, Tier 2-4) | ~35-40 | **Tactical.** Stack is growing. Player starts mining defensively to prevent stack-out. First cascade discoveries happen here — "Oh, that column fell and cleared a line!" |
| Late (300s+, Tier 5+) | ~45+ | **Desperate.** Pieces fall fast. Every second counts. Mining is survival — break the critical block, trigger the cascade, buy 2 more seconds. Streaks happen naturally because the player is mining frantically. This is the flow state peak. |

---

## 7. Difficulty and Balance Considerations

### 7.1 Mining Doesn't Break Difficulty Curve

Concern: "If the player can mine blocks, can they just keep the stack low forever and never lose?"

Answer: No, for three reasons:
1. **Mining takes time.** Each block is 1-2 clicks (Stone tier). While mining, pieces are still falling. At Tier 5+ (1.6x speed), the player cannot mine fast enough to outpace piece spawns.
2. **Mining has range.** 4.5 blocks. The player must physically be near the blocks they want to mine. Moving takes time. Turning takes time.
3. **Pieces spawn every 2 seconds.** The spawn rate is constant. Mining removes blocks, but the board refills faster than one player can mine. Mining buys time, it doesn't stop the clock.

The difficulty curve naturally compresses mining's effectiveness: early game, mining easily keeps up; late game, it becomes triage.

### 7.2 Cascade Line Clears and Scoring

Concern: "Cascade line clears could inflate scores compared to current Classic."

Answer: Yes, and that's intended. Classic scores should increase because the player is doing more. But the chain reaction bonus (200 per physics-triggered line) is modest — it rewards the skill without making mining-only play dominant over efficient Tetris line clearing.

Recommended: Track mining-triggered clears vs piece-triggered clears as separate analytics to validate balance post-launch.

### 7.3 Void Blocks and Obsidian

Void blocks (unmineable, line-clear only) and Obsidian (very hard) serve as natural mining limiters. They appear at higher difficulty tiers and create blocks the player CANNOT mine around, forcing them back to Tetris fundamentals. This is an important pressure valve — it prevents "just mine everything" from being a viable late-game strategy.

No changes needed to Void/Obsidian behavior. They already serve the right design purpose.

---

## 8. What This Spec Does NOT Cover

| Topic | Why Not |
|-------|---------|
| Inventory / block placement in Classic | Intentionally excluded. Classic stays streamlined. Inventory is Survival's territory. |
| Pickaxe crafting / tier progression in Classic | Classic starts at Stone tier, no crafting. Crafting is Survival/Depths. |
| New block types | No new materials needed. The existing 13+ block types provide sufficient variety. |
| Multiplayer interactions | Battle mode has its own mining rules. This spec is single-player Classic only. |
| Lateral flood-fill support model | Deferred to v2 evaluation after playtesting column-only physics. |
| Leaderboard separation | Classic with mining should be a new leaderboard era (scores are not comparable to pre-mining Classic). This is a backend/product decision, not a design one. |

---

## 9. Implementation Guidance for Engineers

### 9.1 Estimated Scope

| System | Effort | Notes |
|--------|--------|-------|
| Enable mining in Classic mode config | Small | Set `miningEnabled: true` and `pickaxeTier: "stone"` in Classic mode init. Disable inventory UI. |
| Block physics (column gravity) | Medium | New system. On block removal, check Y+1 for unsupported blocks, create falling groups, animate, land, re-check grid. ~200-300 lines. |
| Mining streak tracking | Small | New counter in state.js. Increment on mine, reset after 1.5s timeout. Apply multiplier to block points. ~50 lines. |
| Cascade detection + scoring | Medium | After physics settling, re-run line-clear check on affected Y-levels. Add cascade bonus and chain reaction bonus to scoring. ~100 lines. |
| Streak/cascade VFX + audio | Medium | New "STREAK" counter overlay, "CASCADE" banner, gold shockwave ring, ascending chimes. Reuse existing particle/audio infrastructure. ~150 lines. |
| HUD updates | Small | Show streak counter, cascade notifications. Minor additions to existing HUD. ~30 lines. |

### 9.2 Key Files to Modify

| File | Change |
|------|--------|
| `js/ui/mode-select.js` | Enable mining flags on Classic init |
| `js/core/state.js` | Add `miningStreak`, `miningStreakTimer`, `lastMineTime`, `cascadeLevel` globals |
| `js/world/mining.js` | No changes needed — mining system is already generic |
| `js/player/input.js` | Add streak tracking on block break. Disable inventory add for Classic (score-only mining). |
| `js/core/lineclear.js` | Add cascade re-check after physics settling. Add chain reaction bonus scoring. |
| `js/core/config.js` | Add `MINING_STREAK_WINDOW`, `MINING_STREAK_MULTIPLIERS`, `CASCADE_BONUS_PER_LEVEL`, `CHAIN_REACTION_BONUS` constants |
| `js/rendering/effects.js` | Add streak counter overlay, cascade banner, gold shockwave variant |
| `js/audio/audio-sfx.js` | Add streak chimes, cascade rumble, chain reaction impact |
| NEW: `js/core/block-physics.js` | Block gravity system — unsupported block detection, falling group management, landing + grid re-registration |

### 9.3 Performance Considerations

- **Column check on mine:** O(height) per mined block — trivial since max useful height is ~20.
- **Falling group animation:** Reuse piece fall logic. Groups are typically 1-5 blocks. No physics engine needed.
- **Cascade line-clear re-check:** Only check Y-levels that received fallen blocks. Not a full grid scan.
- **Fragment pool:** Existing 200-fragment pool handles cascade line clears. If cascades clear 3+ rows simultaneously, may need pool expansion to 300.

---

## 10. Success Metrics

| Metric | Target | Why |
|--------|--------|-----|
| Blocks mined per Classic session | >20 average | Players are actively mining, not ignoring the mechanic |
| Sessions with at least 1 cascade line clear | >30% | Physics cascades are discoverable and happening organically |
| Session length (Classic) | +15% vs pre-mining baseline | Mining extends engagement by giving players more to do |
| "Chain Reaction" events per session | 0.5-2.0 average | Rare enough to feel special, common enough to be a real strategy |
| Score distribution shift | Higher ceiling, same floor | Players who mine well score significantly higher. Players who don't mine score the same as before. |

---

## 11. Open Questions for CEO

1. **Leaderboard era:** Should pre-mining Classic scores be archived into a separate "Classic Legacy" leaderboard? Mining fundamentally changes scoring potential.
2. **Mode naming:** Does Classic keep its name, or should mining-enabled Classic be called something distinct (e.g., "Classic+" or just keep "Classic" and let it evolve)?
3. **Tutorial hint:** Should Classic show a one-time hint on first play? Something like "Left-click to mine blocks" with an arrow pointing at a landed block. Or let players discover it?
4. **Feature flag rollout:** Ship behind a flag for A/B testing, or go all-in on the thesis and ship to everyone?

---

## Appendix A: Visual Reference — Chain Reaction Sequence

```
Frame 1: Player mines block at (5, 3, 5)
  ┌───┐
  │ S │  ← Stone block at Y=4, directly above
  ├───┤
  │ X │  ← Player mines this (Gold at Y=3)
  ├───┤
  │ D │  ← Dirt at Y=2 (still solid)
  └───┘

Frame 2: Block removed, physics check (0.15s delay)
  ┌───┐
  │ S │  ← Stone at Y=4 — nothing below at Y=3 → UNSUPPORTED
  ├───┤
  │   │  ← Empty (mined)
  ├───┤
  │ D │
  └───┘

Frame 3: Stone falls (gravity animation)
  │ S │  ↓ falling
  ├───┤
  │ D │
  └───┘

Frame 4: Stone lands on Dirt at Y=2 → snap to Y=3
  ┌───┐
  │ S │  ← Now at Y=3
  ├───┤
  │ D │  ← Y=2
  └───┘
  Grid re-registered. Line-clear check on Y=3.

Frame 5 (if Y=3 row now has 100+ cells): LINE CLEAR
  → "CHAIN REACTION!" banner
  → +200 bonus points
  → Standard line-clear celebration in gold
  → Check Y=4 for new unsupported blocks (cascade continues)
```

---

## Appendix B: Streak Timing Diagram

```
Time:  0.0s    0.8s    1.6s    2.8s    3.5s
       ↓       ↓       ↓       ↓       ↓
       Mine1   Mine2   Mine3   [gap]   Mine4
       ×1.0    ×1.5    ×2.0    reset   ×1.0

       |--1.5s--|--1.5s--|
       streak    streak   streak expires (>1.5s gap)
                          new streak starts
```

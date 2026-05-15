# Minetris Roadmap

**Design Thesis:** *"Tetrominos build the world; you mine the world to survive and shape it."*
**Vision:** The first game where Tetris pieces are not puzzles to solve — they're the living, breathing landscape you inhabit, mine, and reshape to survive.
**Source:** <https://github.com/lx-0/minetris>

---

## The North Star

Imagine a game where every session tells a different story. The world is generated in real time by falling Tetris pieces — random, chaotic, beautiful. You're inside it, at ground level, watching mountains of colored blocks grow around you. Your pickaxe is the only thing standing between you and being buried alive.

The more you play, the faster the world builds itself. Your only tools: your pickaxe, your wits, and the blocks you've mined. Mine strategically. Fill the gaps. Trigger line-clears to buy yourself time. Survive longer. Score higher.

The market has infinite Tetris clones. It has exactly one game where Tetris pieces *are* the world. Mining is the identity. Tetris modes are distribution, not identity — they bring players in through leaderboards and competitive feeds, but the mining experience is what makes Minetris irreplaceable.

---

## Current State: v7.2 (April 2026)

Minetris has grown from a tech demo into a feature-rich browser game with **26 playable modes**, deep progression, multiplayer, and a full cosmetics system — all running zero-install in any browser.

### What's Shipped

| System | Scope |
|:-------|:------|
| **Game Modes** | 26 modes across 5 categories (Learn, Core, Adventure, Minigames, Multiplayer) |
| **Core Loop** | Mining (14 block types + 6 hazards), line-clear with combo system, crafting (13 recipes), pickaxe tiers (4), piece nudging |
| **Progression** | 100 levels + 10 prestige tiers (prestige at L50), 58 achievements, 40 mastery challenges (8 modes x 5 tiers), daily missions (33 templates), season missions |
| **Social** | Co-op, ranked Battle (Elo), guilds, clan wars, tournaments, community puzzles, community goals |
| **Expedition** | 4 biomes (Stone, Forest, Nether, Ice) with 15-tier reward tracks, featured season pass (50 tiers) |
| **Rendering** | Per-face lighting, PBR materials, bloom + color grading, biome skies, particle systems, aura effects |
| **Audio** | SFX (Howler.js), synth (Tone.js), mood-reactive music, ambient layers, master chain processing |
| **Cosmetics** | 9+ block skins, 15+ themes, trails, titles, borders, season sets, story fragments, colorblind mode |
| **Infrastructure** | Cloud save sync, replay system, finesse tracking (KPP/PPS/APM), error reporting, PWA with service worker |
| **Input** | Keyboard, mouse, touch, gamepad, custom keybindings, haptic feedback |
| **Accessibility** | Skip links, focus management, reduced motion, scalable UI, colorblind palette with surface patterns |

### Mode Inventory (26 modes)

| Category | Modes | Mining Role |
|:---------|:------|:------------|
| **Learn** | Tutorial | Teaching — mining is core mechanic taught |
| **Core** | Classic, Sprint, Blitz | Classic = hybrid (mining + Tetris); Sprint, Blitz = pure Tetris |
| **Adventure** | Marathon, Practice, Zen, Daily, Weekly, Puzzle, Combo Challenge, Countdown, Survival, Endless Survival, The Depths, Expeditions, Boss Battle | Survival, Endless Survival, The Depths, Expeditions = **mining-primary**; Boss Battle, Marathon, Daily, Weekly, Combo Challenge, Countdown = hybrid; Puzzle, Practice, Zen = meta/training |
| **Minigames** | Sprint Mini, Cheese Race, Block Puzzle, Dig Mode, Ultra Mode | Pure Tetris variants |
| **Multiplayer** | Co-op, Battle, Local 1v1, VS AI | Hybrid — mining in shared world |

**Mining identity audit:** Of 26 modes, **4 are mining-primary** (15%), **10 are hybrid** (38%), **7 are pure Tetris** (27%), **5 are meta/training** (19%). The thesis says mining is the identity — the ratio needs to shift.

---

## Milestone History

| Version | Name | Date | What Shipped |
|:--------|:-----|:-----|:-------------|
| v0.2 | Core Game Loop | — | Inventory, line-clear, game over, scoring, mining feedback, audio |
| v0.3 | The Loop Closes | — | Block placement, crafting, line-clear threshold fix, piece nudging |
| v0.4 | Flow & Feel | — | Difficulty scaling, camera shake, particles, next-piece preview |
| v0.5 | Truly Beautiful | — | Shaders, bloom, color grading, line-clear explosions, sky system |
| v0.6 | Strategic Depth | — | Tool tiers, block types, combo multiplier, piece directional influence |
| v0.7 | The Meta | — | High scores, daily challenge, challenge modes, unlockable skins, tutorial |
| v1.0–v5.0 | Expansion | — | Battle, Co-op, guilds, clan wars, tournaments, expeditions, biomes, 50 levels, prestige, mastery, cosmetics |
| v6.0 | Minigames & Modes | — | Minigame section, Marathon, Countdown, Boss Battle, Endless Survival, The Depths, Practice, Zen |
| v7.0 | Finesse & Quality | — | Finesse tracking (KPP/PPS/APM), error reporting, crash recovery |
| v7.1 | Cloud & Accessibility | — | Cloud save sync, accessibility audit, minigames menu, replay system |
| v7.2 | Consolidation | Apr 2026 | Mode-select cleanup, adventure card copy, progression consolidation proposal, cloud save schema, pointer-lock fixes |

---

## What's Next

### v7.3 — Mining Identity (Next)

**Theme:** Make mining the undeniable star. Every flagship mode should make you *feel* like a miner, not a Tetris player who happens to hold a pickaxe.

The thesis is clear: differentiation is the moat. v7.3 invests in the mining primitives that no Tetris clone can replicate. No new Tetris-only modes. Every feature must answer: *"What mining experience does this unlock?"*

| Feature | Priority | Description | Thesis Impact |
|:--------|:---------|:------------|:--------------|
| **Block-type scarcity** | P0 | Different materials spawn in waves and deplete. Gold becomes rare after minute 3. Diamond only appears at difficulty 7+. Players must mine *what they can, when they can* — not just what's in the way. | Transforms mining from obstacle-clearing to resource strategy |
| **Mining-driven line-clear feedback** | P0 | When you mine the block that completes a line, the clear feels 3x more dramatic: bigger explosion, screen shake, bonus score multiplier. The game rewards *you* for the clear, not gravity. | Makes the player the hero of every line-clear, not a spectator |
| **Classic mode mining layer** | P1 | Classic becomes the showcase: mined blocks have weight, placed blocks glow, mining streaks trigger chain reactions. Classic should teach everyone that Minetris is a mining game. *(Pending CEO decision)* | Highest-leverage single change for mining identity |
| **Tool progression overhaul** | P1 | Pickaxe tiers grant qualitatively different abilities, not just speed. Stone: break adjacent block on 3rd hit. Iron: mine through 2 blocks in a line. Diamond: AOE cross + resource magnet. Each tier changes *how* you mine. | Raises mining skill ceiling — veterans mine fundamentally differently |
| **Material recipes** | P2 | Specific block types unlock specific crafting paths. Gold ore → golden pickaxe (faster on stone). Ice + obsidian → frost pick (freezes crumble timers). Mining *what* matters, not just mining *that*. | Adds strategic depth to resource gathering |
| **Mining-first onboarding** | P2 | Tutorial restructured: first 30 seconds are pure mining (no pieces falling). Player learns the pickaxe, the satisfaction, the crack-crack-break rhythm. *Then* pieces start falling. First impression = miner, not Tetris player. | Sets identity expectation from second one |

**Open CEO decisions:**
- Should Classic mode get the mining layer? (Highest-leverage identity decision)
- Block-type scarcity parameters: how aggressive should depletion be?

**Done when:** A new player's first instinct after 60 seconds is "I'm a miner" not "I'm playing Tetris." Mining-primary modes rise from 15% to 25%+ of the mode inventory.

---

### v7.4 — Design Debt Paydown

**Theme:** Structural cleanup that unblocks the next era of development.

| Item | Priority | Description |
|:-----|:---------|:------------|
| **Season pass consolidation** | P0 | Three coexisting season pass systems (season-pass.js legacy, xp-season-pass.js, featured-season-pass.js) → one unified system. Players shouldn't need to understand three reward tracks. |
| **Prestige trigger fix** | P1 | ~~Resolved in MINAA-780~~ — `PRESTIGE_LEVEL=50` decoupled from `MAX_LEVEL=100`; all docs updated. |
| **Dead code removal** | P1 | loot-tables.js (1 line), 3 test files in bundle (biome-rules-test.js, story-fragments-test.js, underground-test.js). Small wins, cleaner bundle. |
| **UI module decomposition** | P2 | settings.js (2,404 LOC), leaderboard.js (1,521), mode-select.js (1,488), profile-page.js (1,350) — each should be split into focused modules. Not blocking features but slowing iteration. |
| **localStorage audit** | P2 | 189+ unique keys. Cloud save schema (MINAA-565) shipped but key consolidation hasn't happened. Reduce key count, namespace consistently. |

**Done when:** One season pass. One prestige trigger. No dead code in bundle. Largest module under 1,000 LOC.

---

### v8.0 — Production Polish

**Theme:** The game is feature-complete. Make it bulletproof.

| Feature | Priority | Description |
|:--------|:---------|:------------|
| **Performance target** | P0 | Consistent 60fps with 500+ landed blocks. Profile and optimize collision detection (currently O(n^2)). Spatial partitioning (grid-indexed lookup) is the path. |
| **Mobile optimization** | P1 | Touch controls exist but need responsive layout testing, performance profiling on low-end devices, and touch-target sizing audit. |
| **Multiplayer stability** | P1 | Harden WebSocket reconnection, handle mid-match disconnects gracefully, add connection quality indicator. |
| **Loading & bundle** | P2 | 81K+ lines of JS across 174 files. Evaluate build tooling (Vite) — only if it meaningfully improves load time and developer experience. Zero-setup for players remains sacred. |
| **Error recovery** | P2 | Crash overlay exists. Add automatic state recovery: if the game crashes mid-session, offer to resume from last snapshot. |

**Done when:** 60fps on a 3-year-old phone. No multiplayer disconnects that lose match state. Cold load under 3 seconds on 4G.

---

### v9.0 — Launch

**Theme:** The complete, polished, shareable Minetris experience.

| Feature | Priority | Description |
|:--------|:---------|:------------|
| **Online leaderboard** | P0 | Global score submission (no account needed — just enter a name). Daily, weekly, and all-time boards. The competitive backbone for retention. |
| **Share card** | P1 | Generate a shareable image of final score, stats, and world snapshot. Twitter/Discord card format. Players become the marketing engine. |
| **Soundtrack** | P1 | Mood-reactive generative music is already in place. Polish: ensure smooth transitions, add biome-specific motifs, test on long sessions. |
| **Onboarding polish** | P2 | Tutorial exists. Add contextual tips for each new mode unlock. First-time mode entry gets a 10-second "here's what's different" overlay. |
| **itch.io / distribution** | P2 | Package for itch.io, ensure PWA install works cleanly, add offline support via service worker for installed instances. |

**Done when:** You can share a link, someone opens it on their phone, plays for 20 minutes, beats your score, and sends it back. The game retains players at day 7.

---

## Beyond Launch

These are not on the roadmap yet but represent where Minetris could go if it finds an audience.

**Deep Mining Mode:**
A standalone mining experience with no Tetris time pressure. Explore a vast procedurally generated underground. Mine veins of rare ore. Craft equipment. Discover lore fragments. The mining identity pushed to its logical extreme — Minetris as a mining game that happens to have Tetris pieces, not the other way around.

**Co-op Expedition Campaigns:**
Multi-session cooperative runs through a biome map. Two miners, persistent progress, escalating difficulty. Each session ends with a boss encounter. The mining + teamwork fantasy fully realized.

**Procedural World Events:**
Random events mid-session: "Piece Storm" (5 pieces spawn simultaneously), "Golden Block" (a special piece worth 5x if mined within 10 seconds), "Earthquake" (all blocks drop 1 level — instant line-clears everywhere).

**User-Created Challenge Maps:**
Pre-built starting worlds with specific piece sequences. "Solve this mining puzzle in 60 seconds." Community-created challenges with voting and featured picks.

**World Persistence Mode:**
Your world saves between sessions. Come back tomorrow and continue mining. Invite a friend to visit your world. The Minecraft meta-loop meets Tetris urgency.

---

## Technical Principles

- **Zero-setup is sacred.** The game runs in any browser. No install, no account, no friction. Preserve this at every milestone.
- **Mining first, always.** Every technical decision should ask: does this make mining feel better? If not, deprioritize.
- **Performance-aware.** The current O(n^2) collision detection will become a problem above ~300 landed blocks. Spatial partitioning (grid-indexed lookup) is the path when needed.
- **Single codebase.** No server required for core gameplay. LocalStorage + cloud sync for persistence. External services (leaderboard, multiplayer relay) are optional enhancements.
- **Build tools earn their place.** Add bundling/build steps only when they meaningfully improve player experience (load time, code splitting). Developer convenience alone is not sufficient justification.

---

## Inspiration Touchstones

| Game | What We're Borrowing |
|:-----|:--------------------|
| **Tetris** | Line-clear rhythm, piece preview, rising speed — the mechanical spine |
| **Minecraft** | First-person scale, mining satisfaction, resource economy — the identity |
| **Spelunky** | Emergent danger from environmental physics, feel of being "in" a generated world |
| **Downwell** | Survival against a world building against you, escalating chaos |
| **Raft** | Resource-from-chaos loop — the environment constantly delivers raw material |
| **Hades** | How a roguelike progression system makes every run feel meaningful — the meta-loop model |

---

## Design Debt Register

Tracked here for visibility. Items move to milestone feature tables when scheduled.

| Debt Item | Severity | Notes |
|:----------|:---------|:------|
| Mining-primary modes at 15% (4/26) | High | Thesis says mining is identity — mode ratio should reflect that |
| 3 coexisting season pass systems | High | Player confusion risk; engineering maintenance burden |
| Results screen ignores mining identity (MINAA-690) | High | Game-over shows "Blocks: N" only — no ore breakdown, pickaxe tier, or crafting summary |
| Tool tier feedback unmerged (MINAA-671, PR #22) | High | Banners+sounds implemented, CI green, approved — sitting unmerged since Apr 30 |
| Mining modes not distinguished in mode-select (MINAA-672) | Medium | No visual badges differentiating mining-primary from Tetris modes |
| Mastery progress invisible during gameplay (MINAA-673) | Medium | Post-game only; no in-run HUD showing challenge progress |
| Cascade celebration flat across depths (MINAA-691) | Medium | Levels 1-4 use identical visual/audio intensity |
| Monolithic UI modules (4 files >1,300 LOC) | Medium | Slows iteration; increases merge conflict risk |
| Mining-first onboarding not started | Medium | v7.3 P2 — tutorial teaches mining but pieces fall immediately |
| Material recipes not started | Medium | v7.3 P2 — specific ores unlock specific crafting paths |
| 189+ localStorage keys | Medium | Schema registry shipped but key consolidation pending |
| Scarcity HUD lacks warning states (MINAA-692) | Low | No audio/visual alerts at depletion threshold |
| Boss Battle mode is minimal | Low | Mode card exists but mining integration is light |
| FEATURE-MAP.md incomplete | Low | Documents ~11 modes; game has 26+ |

---

## References

- Feature map: `docs/FEATURE-MAP.md`
- Source repo: <https://github.com/lx-0/minetris>

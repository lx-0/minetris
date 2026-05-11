# Design Spec: Mining-First Mode Descriptions (MINAA-705)

Every mode description and aria-label must contain at least one mining word
(mine, dig, miner, ore, vein, rubble). Flagship mining modes get the strongest
language. Speed/competitive modes acknowledge mining without overstating it.
Zen, Co-op, and Battle are already correct — leave them unchanged.

---

## index.html — Mode Card Descriptions

| Mode | Before | After |
|---|---|---|
| Tutorial | Learn the ropes. Step-by-step guide to mining, pieces, and line clears. | *(unchanged — already mentions mining)* |
| Classic | Endless mode. Speed increases every level. | Endless mining runs. Ore blocks cascade as speed climbs — how deep can you dig? |
| Sprint | Clear 40 lines. Beat the clock. | Race the clock. Mine and clear 40 lines as fast as possible. |
| Blitz | 2 minutes. Maximum score. | 2 minutes. Mine fast, score higher. |
| Marathon | 29 levels. Speed up every 10 lines. Reach the kill screen. | 29 levels through the mine shaft. Speed climbs every 10 lines. Reach the kill screen. |
| Practice | Sandbox, or pick a scenario drill. Undo, set speed, no scoring. | Sandbox drills. Mine, nudge, and set up combos without scoring pressure. |
| Zen | No pressure. No game over. Just mine and breathe. | *(unchanged — already mentions mining)* |
| Daily | Today's seed. Everyone gets the same pieces. | Mine today's seed. Same ore layout for every miner on Earth. |
| Weekly | This week's challenge. | This week's mining challenge with a unique modifier. |
| Puzzle | 50 puzzles across 5 tiers. Daily puzzle every day. | 50 mining puzzles across 5 tiers. Clear the ore in as few moves as possible. |
| Combo Challenge | Chain line clears for massive multipliers! 60 seconds on the clock. | Chain ore clears for massive multipliers! 60 seconds on the mining clock. |
| Countdown | Survive 10 speed stages. How long can you last? | Survive 10 speed stages as the mine shaft fills. How long can you dig? |
| Survival | Your persistent world. Mine, build, survive — but death erases everything. | *(unchanged — already mentions mining)* |
| Endless Survival | No speed cap. Modifiers stack every 60s. How long can you last? | No speed cap. Random mining hazards stack every 60s. Dig as deep as you can. |
| The Depths | Descend into danger. Roguelike runs, tiered dungeons, and endless depths. | Descend into the mine. Roguelike runs through tiered ore veins and dungeon shafts. |
| Expeditions | Explore biomes. Gather resources. Build your world. | Mine into unmapped biomes. Dig for rare ores and build your world. |
| Boss Battle | Clear lines to slay the Wither, Ender Dragon, and Warden. Earn exclusive skins. | Mine lines to damage the Wither, Ender Dragon, and Warden. Earn exclusive skins. |
| Co-op | Play together. One world, two miners. | *(unchanged — already mentions miners)* |
| Battle | Fight your opponent. Last miner standing wins. | *(unchanged — already mentions miner)* |

---

## index.html — Aria-Labels

| Mode | Before | After |
|---|---|---|
| Tutorial | Tutorial mode — Interactive guided introduction to MINETRIS controls and mechanics | *(unchanged)* |
| Classic | Classic mode — Endless mode with progressive difficulty | Classic mode — Endless mining run with rising speed and ore cascades |
| Sprint | Sprint mode — Clear 40 lines as fast as possible | Sprint mode — Race to mine and clear 40 lines as fast as possible |
| Blitz | Blitz mode — 2 minutes, maximum score | Blitz mode — 2 minutes, mine fast for maximum score |
| Marathon | Marathon mode — 29 levels, or Endless with milestones | Marathon mode — 29-level mine run or Endless with ore milestones |
| Practice | Practice mode — Sandbox or scenario drills | Practice mode — Sandbox mining drills or scenario training |
| Zen | *(unchanged)* | *(unchanged)* |
| Daily | Daily mode — Today's seed, everyone gets the same pieces | Daily mode — Mine today's shared ore seed alongside every other player |
| Weekly | Weekly mode — This week's challenge with a special modifier | Weekly mode — This week's mining challenge with a special modifier |
| Puzzle | Puzzle mode — 50 curated mining puzzles across Easy, Medium, Hard, Expert, and Master | *(unchanged — already mentions mining)* |
| Combo Challenge | Combo Challenge — Chain line clears for massive multipliers! 60 seconds on the clock. | Combo Challenge — Chain ore clears for massive multipliers in 60 seconds |
| Countdown | Countdown — Survive 10 speed stages as gravity accelerates every 30 seconds | Countdown — Survive 10 speed stages as the mine shaft fills around you |
| Survival | Survival mode — Persistent world, mine, build, and survive | *(unchanged)* |
| Endless Survival | Endless Survival mode — no speed cap, random modifiers, pure endurance | Endless Survival mode — no speed cap, stacking mining hazards, pure endurance |
| The Depths | The Depths mode — Roguelike dungeon runs with tiered challenges | The Depths mode — Roguelike mining runs through tiered dungeon shafts |
| Expeditions | Expeditions mode — Explore biomes, gather resources, build your world | Expeditions mode — Mine unmapped biomes, dig for rare ores, build your world |
| Boss Battle | Boss Battle mode — Defeat Minecraft bosses through Tetris skill | Boss Battle mode — Defeat Minecraft bosses by mining lines with Tetris skill |
| Co-op | Co-op mode — Play together, one world, two miners | *(unchanged)* |

---

## index.html — Loading Tips (mode-specific only, 5 rewrites)

| Before | After |
|---|---|
| Sprint mode: race to clear 40 lines as fast as you can. | Sprint mode: mine fast — race to clear 40 lines before time runs out. |
| Blitz mode: score as many points as possible in 2 minutes. | Blitz mode: mine and score as high as you can in 2 minutes. |
| Daily Challenge uses a fixed seed — everyone gets the same pieces! | Daily Challenge uses a fixed ore seed — every miner on Earth gets the same pieces! |
| Expedition mode sends you deep underground for rare ore rewards. | *(unchanged — already mentions ore)* |
| Survival mode ramps up speed over time — stay calm under pressure. | Survival mode: your mine world persists — build deep and survive the rising tide. |

---

## js/ui/mode-select.js — Dynamic Descriptions

### Marathon toggle (Endless variant)
| Element | Before | After |
|---|---|---|
| descEl.textContent | No level cap. Milestones at 50/100/200/500/1000 lines. Garbage starts at 300. | No cap on the mine shaft. Ore milestones at 50/100/200/500/1000 lines. Garbage debris starts at 300. |
| aria-label | Marathon Endless — no cap, milestones, optional garbage after 300 lines | Marathon Endless — no cap, ore milestones, optional garbage debris after 300 lines |

### Marathon toggle (Classic variant, swapped back from Endless)
| Element | Before | After |
|---|---|---|
| descEl.textContent | 29 levels. Speed up every 10 lines. Reach the kill screen. | 29 levels through the mine shaft. Speed climbs every 10 lines. Reach the kill screen. |
| aria-label | Marathon mode — 29 levels, kill screen at level 29 | Marathon mode — 29-level mine run, kill screen at level 29 |

### Daily post-play
| Before | After |
|---|---|
| Come back tomorrow for a new challenge! | The vein is tapped. Come back tomorrow for a fresh ore seed! |

---

## js/ui/tutorial.js — Explore All Modes Mini Descriptions (5 of 6)

| Mode | Before | After |
|---|---|---|
| Classic | Endless play, rising speed | Endless mining, rising speed |
| Sprint | Clear 40 lines fastest | Mine 40 lines fastest |
| Blitz | 2 min, max score | 2 min, mine fast |
| Daily | Same seed as everyone | Same ore seed daily |
| Survival | Permadeath world | Mine, build, survive |
| Co-op | Mine with a partner | *(unchanged — already mentions mining)* |

---

## js/progression/mode-unlock.js — Lock Overlay Incentive Text (12 modes)

New per-mode incentive line displayed above "Level X" on locked cards.

| Mode | Incentive Text |
|---|---|
| sprint | Mine against the clock |
| blitz | Score big, dig fast |
| puzzle | Mining puzzles challenge your thinking |
| daily | One shot at today's ore seed |
| weekly | This week's mining challenge awaits |
| survival | Unlocks your persistent mine world |
| battle | Mine faster than your rival |
| expedition | Dig deep into unmapped biomes |
| depths | The deepest ore veins hide here |
| coop | Two miners, one world |
| boss_battle | Slay bosses with your mining skill |
| editor | Design your own mining puzzles |

# MineCtris Feature Map

A multi-level map of every feature, mechanic, and system in MineCtris — and how they connect.

---

## Level 0: The Core Identity

**MineCtris = First-Person Minecraft Mining × Tetris Piece Falling**

Tetromino pieces fall from the sky into a 3D voxel world. The player mines blocks in first-person, clears lines, crafts tools, and progresses through modes, seasons, and social systems.

---

## Level 1: System Map (7 Pillars)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MineCtris Game                              │
├──────────┬──────────┬──────────┬──────────┬────────┬───────┬───────┤
│  CORE    │  MODES   │PROGRESSION│ SOCIAL  │COSMETIC│RENDER │ AUDIO │
│  LOOP    │          │          │         │        │       │       │
├──────────┼──────────┼──────────┼─────────┼────────┼───────┼───────┤
│ Pieces   │ Classic  │ Leveling │ Co-op   │ Themes │Shaders│ SFX   │
│ Mining   │ Sprint   │ Mastery  │ Battle  │ Skins  │PostFX │ Synth │
│ LineClear│ Blitz    │ Achieve  │ Guild   │ Trails │ Sky   │Ambient│
│ Crafting │ Puzzle   │ Missions │ ClanWar │ Story  │Shadows│ Music │
│ Inventory│ Daily    │ Season   │ Tourney │ Titles │ Aura  │       │
│ World    │ Weekly   │ Prestige │Community│        │       │       │
│ Events   │ Survival │ Loot     │         │        │       │       │
│ Hazards  │Expedition│ ModeUnlk │         │        │       │       │
│ Biomes   │ Editor   │          │         │        │       │       │
│ Difficulty│         │          │         │        │       │       │
└──────────┴──────────┴──────────┴─────────┴────────┴───────┴───────┘
```

---

## Level 2: Feature Breakdown

### 2.1 CORE LOOP

The second-to-second gameplay that everything else is built on.

| Feature             | Description                                                                    | Key Constants                                                       | Connects To                                                     |
| :------------------ | :----------------------------------------------------------------------------- | :------------------------------------------------------------------ | :-------------------------------------------------------------- |
| **Piece Spawning**  | Tetrominos spawn at Y=25, random X/Z within 80% bounds, 3-piece preview queue  | `SPAWN_INTERVAL=2s`, `NEXT_QUEUE_SIZE=3`                            | Difficulty, Biome Rules, Weekly Modifiers, Co-op (shared queue) |
| **Piece Falling**   | Gravity-driven descent, speed scales with difficulty                           | `GRAVITY=9.8`, velocity = -(G/4) × diffMultiplier                   | Difficulty Scaling, Biome Speed Mods, Events                    |
| **Piece Nudging**   | Q/E/Z/X shift pieces ±3 blocks when within 10 blocks of ground                | `NUDGE_COOLDOWN=0.5s`, `MAX_OFFSET=3`                               | Co-op (shared nudge state)                                      |
| **Mining**          | First-person raycast, click to damage blocks, material-specific hit counts     | `MINING_RANGE=4.5`, hits: 1-8 (∞ for void/bedrock)                  | Inventory, Scoring, Pickaxe Tiers, Dust Particles               |
| **Block Types**     | 14 standard + 6 hazard types, each with hits/points/color/effects              | Dirt(2/5), Stone(4/15), Gold(2/50), Diamond(6/100), Obsidian(8/100) | Crafting Recipes, Biome Palettes, Cosmetic Skins                |
| **Line Clear**      | Y-level with 100+ occupied cells triggers 4-phase explosion                    | `LINE_CLEAR_CELLS_NEEDED=100`                                       | Scoring (combo system), Battle (garbage), Achievements, Events  |
| **Combo System**    | Consecutive clears within 3s multiply score: 1→1.5→2→3×                        | `COMBO_WINDOW=3s`, max 3× (or always 3× in Double-or-Nothing)       | Scoring, Battle Garbage, Achievements (Combo King)              |
| **Inventory**       | Mined blocks stored by color, max 64/type, 256 total                           | `INV_MAX_PER_TYPE=64`, `INV_MAX_TOTAL=256`                          | Crafting, Co-op Trading, Expedition Material Bonuses            |
| **Crafting**        | 13 recipes: tools (pickaxes), consumables, power-ups                           | Requires Crafting Bench for advanced                                | Pickaxe Tiers, Battle Power-ups, Achievements                   |
| **Pickaxe Tiers**   | none → stone (2-hit) → iron (1-hit) → diamond (1-hit + AOE cross)              | Crafted from mined materials                                        | Mining speed, Mastery challenges, Achievements                  |
| **World Objects**   | Trees (trunk+leaves), rocks (1-3 stacked), obsidian (buried)                   | Respawn after player moves away                                     | Mining targets, Material sources                                |
| **Difficulty**      | Multiplier increases every 60s: 1.1× per tier, capped at 3.0×                  | `DIFFICULTY_INTERVAL=60s`, `MAX=3.0×`                               | Piece speed, Diamond unlock (L7+), Battle offset                |
| **Danger Zone**     | Warning at Y≥16.5, game over at Y≥19.5                                         | `DANGER_ZONE_HEIGHT=16.5`, `GAME_OVER_HEIGHT=19.5`                  | Post-processing (red grade), Audio (tension cue)                |
| **Player Movement** | WASD + Space jump, capsule collision, ice friction                             | `MOVEMENT_SPEED=5.0`, `JUMP_VELOCITY=4.0`, `PLAYER_HEIGHT=1.8`     | Biome ice drift, Co-op position sync                            |

### 2.2 HAZARD BLOCKS

| Hazard            | Behavior                                                   | Timing                     | Counterplay                                 |
| :---------------- | :--------------------------------------------------------- | :------------------------- | :------------------------------------------ |
| **Crumble**       | Disappears 5s after landing, visual decay+pulse            | `CRUMBLE_DECAY_SECS=5`     | Mine before landing (1 hit), or wait it out |
| **Magma**         | Damages 1 random adjacent block every 3s                   | `MAGMA_DAMAGE_INTERVAL=3s` | Mine it (3 hits) before it spreads damage   |
| **Void**          | Unmineable (∞ hits), deep purple shimmer                   | Only removed by line clear  | Clear the line it sits on                   |
| **Soft Moss**     | 1-hit mineable hazard (The Creep boss)                     | Instant                    | Mine on contact                             |
| **Hardened Moss** | Unmineable permanent obstacle (The Creep boss)             | Permanent                  | Line clear only                             |
| **Vine**          | 2-hit spreading hazard, hardens over time (The Creep boss) | Spreads on timer           | Mine before hardening                       |

### 2.3 EVENTS SYSTEM

| Event          | Duration | Effect               | Visual            |
| :------------- | :------- | :------------------- | :---------------- |
| **Piece Storm** | 30s      | Rapid piece spawning | Red UI overlay    |
| **Golden Hour** | 20s      | 3× score multiplier  | Gold UI overlay   |
| **Earthquake**  | 10s      | Ground shaking       | Orange UI overlay |
| **Creeper**     | 25s      | Boss approach        | Green UI overlay  |

- **Spawn interval**: Random 90-180s, 60s cooldown between events
- **Disabled in**: Puzzle, Sprint, Blitz, pause, game-over
- **Connects to**: Survival (event journal), Scoring, Audio (event stingers)

---

### 2.4 GAME MODES

| Mode           | Unlock | Core Goal                       | Time             | Crafting           | Special Rules                             |
| :------------- | :----- | :------------------------------ | :--------------- | :----------------- | :---------------------------------------- |
| **Classic**    | L0     | Survive, maximize score         | Infinite         | Yes                | Standard difficulty scaling               |
| **Sprint**     | L2     | Clear 40 lines fastest          | Timed (elapsed)  | No                 | Fixed speed (L5), no height limit         |
| **Blitz**      | L2     | Max score in 2 min              | 120s countdown   | No                 | 2× bonus in final 30s                     |
| **Puzzle**     | L4     | Complete 10 designed challenges | Per-puzzle       | Varies             | Fixed speed (0.5×), star ratings          |
| **Daily**      | L6     | Best score, same seed worldwide | Session          | No                 | Seeded RNG (mulberry32), weekly modifiers |
| **Weekly**     | L6     | Best score under modifier       | Session          | Varies             | 5 rotating modifiers (per ISO week)       |
| **Survival**   | L8     | Persist world across sessions   | Session ("Days") | Yes                | Persistent world, events, roguelite       |
| **Battle**     | L10    | Beat opponent (PvP)             | Match            | Yes                | Garbage rows, Elo rating, power-ups       |
| **Expedition** | L12    | Explore biome map, earn XP      | Session          | Yes                | Biome rules, reward tracks, lore          |
| **Co-op**      | L16    | Team play, shared score         | Session          | Yes (80% discount) | Shared pieces, trading, emotes            |
| **Editor**     | L20    | Create custom puzzles           | N/A              | N/A                | Block palette, win conditions, sharing    |

#### Weekly Modifiers (5 rotating)

| Modifier              | Effect                                     | Impact                   |
| :-------------------- | :----------------------------------------- | :----------------------- |
| **No Iron Week**      | Crafting disabled                          | Pure mining skill        |
| **Gold Rush**         | Gold 3× more frequent, 2× line clear score | High-scoring sessions    |
| **Ice Age**           | 60% ice pieces, start at L3               | Slippery + faster start  |
| **Double or Nothing** | Always 3× combo, but −25% on break        | High risk/reward         |
| **Blind Drop**        | Next-piece preview hidden                  | Pattern memory challenge |

---

### 2.5 PROGRESSION SYSTEMS

#### Leveling (100 Levels + Prestige at L50)

```
L0 ──── L2 ──── L4 ──── L6 ──── L8 ──── L10 ──── L12 ──── L16 ──── L20 ──── L50 ──── L100
│       │       │       │       │       │        │        │        │        │        │
Classic Sprint  Puzzle  Daily   Survival Battle  Expedition Co-op  Editor   Prestige  Max
        Blitz           Weekly                                               unlocks
```

- **XP sources**: Game completion (50-100), tutorial (+50 one-time), daily missions (+50-100), streak bonus (+10%)
- **Early curve**: Flat 50-75 XP per level (L1-L6)
- **Late curve**: 15% exponential growth from 100 XP base (L7-L100)
- **Milestone skins**: L5 Fossil, L15 Storm, L30 Void, L50 Legendary — continuing every 5 levels through L100 (20 milestone skins total)

#### Prestige (10 tiers after L50)

| Tier | XP Bonus | Cosmetic                         |
| :--- | :------- | :------------------------------- |
| P1   | +5%      | Gold name color                  |
| P2   | +10%     | Diamond color + pickaxe trail    |
| P3   | +15%     | "Grandmaster" title + block skin |
| P5   | +25%     | "Legend" title + animated border |
| P10  | +50%     | Crown leaderboard icon           |

#### Mastery (8 modes × 5 tiers = 40 challenges)

Tiers: Bronze(1pt) → Silver(2pt) → Gold(3pt) → Diamond(4pt) → Obsidian(5pt)

| Mode       | Bronze         | Silver      | Gold        | Diamond            | Obsidian            |
| :--------- | :------------- | :---------- | :---------- | :----------------- | :------------------ |
| Classic    | 50 lines       | 25K score   | 10+ combo   | 50K + Diamond Pick | 10+ tiers + 10 min  |
| Sprint     | 10 completions | Under 2:00  | Under 1:30  | Under 1:15         | Under 1:00          |
| Blitz      | 10 completions | 10K score   | 15K         | 20K + combos       | 25K                 |
| Daily      | 7 completions  | 14 top-50%  | #1 once     | 30 total           | 5 #1 finishes       |
| Survival   | 5 min          | 100 blocks  | 15 min      | Diamond Pick       | 30 min + 200 blocks |
| Battle     | 5 wins         | Iron (1000) | Gold (1200) | Diamond (1400)     | Obsidian (1600+)    |
| Expedition | 1 per biome    | Tier 5 any  | Tier 10 any | Tier 10 in 2+      | Tier 15 Master      |
| Depths     | 3 runs         | Floor 5     | Floor 10    | Inf. floor 8       | Inf. floor 15       |

#### Achievements (58 total)

Categories: General, Creator, Survival, Co-op, Battle, Tournament

Key examples:
- First Responder (first line), Combo King (5 consecutive), Speed Demon (L10 Classic)
- Geologist (100 blocks), Puzzle Master (3-star all 10), Daily Devotee (3 dailies)
- Battle: First Blood, Dominator, Speed Killer, Untouchable, Comeback Kid
- Tournament: Bracket Buster, Finalist, Champion, Hat Trick

#### Daily Missions (3 per day, date-seeded)

- **33 templates**: 10 Easy (50 XP), 12 Medium (75 XP), 8 Hard (100 XP), 3 Battle
- **Accumulation types**: cumulative, best, min, flag
- **Examples**: 10 lines Classic, mine 30 blocks, 6K Blitz, complete puzzle

#### Season Missions (2 tracks, weekly reset)

- **Track 1 "The Grind"**: Ranked battles + tournament (5 missions, +500 XP)
- **Track 2 "Showtime"**: Spectating + social (5 missions, +500 XP)

#### Loot Tables

- Material drops from mining with rarity weights
- Connects to: Crafting ingredients, Expedition material bonuses

---

### 2.6 SOCIAL SYSTEMS

#### Battle (PvP)

| Feature         | Details                                                                  |
| :-------------- | :----------------------------------------------------------------------- |
| **Connection**  | WebSocket Durable Object relay                                           |
| **Matchmaking** | Create room, Quick Match queue, Spectate                                 |
| **Garbage**     | 1/2/4/6 rows for 1/2/3/4 line clears, B2B +25%                          |
| **Rating**      | Elo-based, K=32 (first 20), K=16 after; soft reset per season           |
| **Ranks**       | Stone(0+) → Iron(1000+) → Gold(1200+) → Diamond(1400+) → Obsidian(1600+) |
| **Power-ups**   | Sabotage, Counter, Fortress (battle-only crafts)                         |
| **HUD**         | Opponent mini-map (10×10 bar chart), garbage warning, connection status   |

#### Co-op (Team Play)

| Feature        | Details                                                    |
| :------------- | :--------------------------------------------------------- |
| **Connection** | Durable Object shared piece queue                          |
| **Difficulty** | Casual(1.0×/1.2×), Normal(1.5×/1.8×), Challenge(2.0×/2.5×) |
| **Trading**    | Offer inventory items, 8s timeout, proximity check         |
| **Emotes**     | Wave, Point, Thumbs Up, Alert (1s cooldown)                |
| **Avatar**     | Teal capsule + nameplate + look-direction beam             |
| **Crafting**   | 80% ingredient cost for recipes with ≥4 ingredients        |

#### Guild System

| Feature      | Details                                                         |
| :----------- | :-------------------------------------------------------------- |
| **Members**  | Up to 30, roles: owner/officer/member                           |
| **Leveling** | XP-based (level² × 500 per tier, max L20)                      |
| **Chat**     | Real-time WebSocket, pinned messages (max 3), @mentions         |
| **Profile**  | Stats, top 5 contributors, battle record, downloadable PNG card |

#### Clan Wars

| Feature       | Details                                                  |
| :------------ | :------------------------------------------------------- |
| **Format**    | 5-slot guild vs guild, 1v1 matches, single elimination   |
| **Timing**    | 2-min join deadline, 45-min war limit                    |
| **Rating**    | Guild Elo (K=32, floor=100)                              |
| **Results**   | MVP (most lines), guild rating change, downloadable card |
| **Standings** | Seasonal top 50, Hall of Fame with season champions      |

#### Guild Expedition

- 2-5 players, same biome, collective target (50K × participants)
- Success: +50% XP multiplier on individual rewards
- History: Last 7 days visible

#### Tournament

- 8-player single elimination (QF → SF → Final)
- Prize tiers with custom labels
- Winner: +50 Elo rating bonus

#### Community Goals (Weekly)

- 6 templates: Block Breaker, Line Master, Depth Crawler, Boss Slayer, Speed Demon, Combo King
- Tiered: Bronze(40%) → Silver(70%) → Gold(100%)
- Top 3 guilds get banner cosmetics

#### Community Puzzles

- Browse/search/filter by difficulty
- Vote system (thumbs up/down), play count tracking
- Creator achievements at play thresholds

---

### 2.7 EXPEDITION SYSTEM

#### Biomes (4)

| Biome      | Speed | Special                          | Score Mod | Cells Needed |
| :--------- | :---- | :------------------------------- | :-------- | :----------- |
| **Stone**  | 1.0×  | Baseline                         | 1.0×      | 100          |
| **Forest** | 1.0×  | Wider board                      | 1.0×      | 144          |
| **Nether** | 1.5×  | Faster fall                      | 1.2×      | 100          |
| **Ice**    | 1.0×  | 500ms lock delay + lateral drift | 1.1×      | 100          |

#### Reward Tracks (15 tiers per biome)

- **Tiers 1-5**: Titles (Wanderer → Tunneler) + small XP bonuses
- **Tiers 6-9**: Common cosmetics + 5 material blocks
- **Tiers 10-13**: +15-20% expedition XP + unique title badges
- **Tiers 14-15**: Exclusive board skins + piece themes
- **Featured biome**: 2× expedition XP per season

#### Featured Season Pass (50 tiers)

- 200 XP per tier (linear)
- Exclusive cosmetics at T20 (Pathfinder Banner), T35 (Expedition Trail), T50 (Master Aura)
- Season-locked: unobtainable after season ends

---

### 2.8 COSMETICS & THEMES

| Category            | Examples                                                                                 | Unlock Sources                 |
| :------------------ | :--------------------------------------------------------------------------------------- | :----------------------------- |
| **Block Skins**     | Neon, Carved Stone, Ore Vein, Mossy, Leaf, Obsidian Forge, Magma, Frozen Tundra, Crystal | Level, Achievement, Mastery    |
| **Themes**          | Classic, Nether, Ocean, Candy, Fossil, Storm, Void, Legendary + biome themes             | Level milestones, Achievements |
| **Trails**          | Per-theme particle trails (gold, coral, electric, nebula)                                | Prestige, Expedition           |
| **Titles**          | Grandmaster, Legend, per-biome names                                                     | Prestige, Mastery, Expedition  |
| **Borders**         | Animated profile borders                                                                 | Prestige                       |
| **Season**          | Diamond/Platinum/Gold/Silver/Bronze sets                                                 | Season rating at end           |
| **Story Fragments** | Narrative text gated by progression                                                      | Progression milestones         |

#### Colorblind Mode

- Deuteranopia-safe palette + surface patterns (stripes, dots, checkerboard)
- Applied across all themes

---

### 2.9 RENDERING

| System              | Details                                                                                                    |
| :------------------ | :--------------------------------------------------------------------------------------------------------- |
| **Shaders**         | Per-face lighting (top 1.0, sides 0.75, bottom 0.5), PBR materials per block type, animated lava/ice       |
| **Post-Processing** | Bloom (0.8), color grading (4 states: Normal/Danger/LineClearing/GameOver), vignette, chromatic aberration |
| **Sky**             | Per-biome zenith/horizon colors + fog                                                                      |
| **Shadows**         | Real-time shadow maps on blocks/player                                                                     |
| **Particles**       | Mining dust (material-specific colors), piece trails, landing rings, line-clear fragments                  |
| **Aura**            | Player glow effect with emissive material                                                                  |

### 2.10 AUDIO

| Layer            | Implementation                                                                                           |
| :--------------- | :------------------------------------------------------------------------------------------------------- |
| **SFX**          | Howler.js — wood/stone/leaf hit+break, place                                                             |
| **Synth**        | Tone.js — line clear arpeggios, rumble, game over, piece storm stabs, golden hour chime, boss escalation |
| **Ambient**      | Wind noise, bird chirps, biome-specific texture layers                                                   |
| **Music**        | Mood-reactive piano motifs (Calm/Tense/Intense/Menu), warm pad, bass drone, key rotation                 |
| **Master Chain** | Compressor → Reverb → Limiter                                                                            |

---

## Level 3: Connection Map

How systems feed into each other.

### Core Loop → Everything

```
Mining ──────→ Inventory ──────→ Crafting ──────→ Pickaxe Tiers ──────→ Mining (loop)
  │                │                │                                      │
  │                │                └──→ Power-ups ──→ Battle/Co-op        │
  │                │                └──→ Consumables ──→ Gameplay          │
  │                └──→ Co-op Trading                                      │
  │                                                                        │
  └──→ Scoring ──→ Highscores ──→ Leaderboards                            │
  │       │                                                                │
  │       └──→ Leveling XP ──→ Mode Unlocks ──→ More Modes               │
  │       │                  └──→ Milestone Skins                          │
  │       │                  └──→ Prestige (after L50)                     │
  │       │                                                                │
  │       └──→ Daily Mission Progress                                      │
  │       └──→ Mastery Tier Progress                                       │
  │       └──→ Achievement Triggers                                        │
  │                                                                        │
  └──→ Dust Particles ──→ Rendering                                       │
                                                                           │
Line Clear ──→ Scoring (combo multiplied) ──→ All progression above        │
  │           └──→ Battle Garbage (sent to opponent)                       │
  │           └──→ Expedition XP (lines×3 + blocks÷5)                     │
  │                                                                        │
  └──→ Post-processing burst (chromatic aberration on Tetris)              │
  └──→ Audio (arpeggio + rumble)                                           │
  └──→ Sprint counter (toward 40-line goal)                                │
```

### Mode → Progression Connections

```
Classic ──→ Highscores, Mastery, Achievements, Daily Missions, XP
Sprint  ──→ Personal Best Time, Mastery, Achievements, Daily Missions, XP
Blitz   ──→ Personal Best Score, Mastery, Achievements, Daily Missions, XP
Puzzle  ──→ Star Ratings, Mastery, Achievements, XP
Daily   ──→ Daily Leaderboard, Mastery, Achievements, XP
Weekly  ──→ Weekly Leaderboard, Modifier-specific play
Survival──→ World Persistence, Event Journal, Lifetime Stats, Mastery, XP
Battle  ──→ Elo Rating, Ranks, Garbage, Season Rating, Mastery, Tournaments, XP
Expedition→ Biome XP, Reward Tracks, Featured Pass, Material Bonuses, Mastery
Co-op   ──→ Shared Score, Trading, Emotes, Leaderboards, Guild Expedition
Editor  ──→ Community Puzzles, Creator Achievements, QR Sharing
```

### Season Lifecycle

```
Season Start
  │
  ├──→ Featured Biome declared (2× expedition XP)
  ├──→ Battle ratings soft-reset (75% + 375)
  ├──→ Season Pass tiers active (rating-based cosmetics)
  ├──→ Featured Season Pass active (50 tiers, expedition XP)
  ├──→ Season Missions active (2 tracks, weekly reset)
  ├──→ Community Goals active (weekly collective challenges)
  ├──→ Clan War standings tracked
  │
Season End
  │
  ├──→ Season recap shown (top 10, final rating, rank badge)
  ├──→ Season Pass cosmetics granted (Diamond/Platinum/Gold/Silver/Bronze)
  ├──→ Featured Pass cosmetics locked (unobtainable)
  ├──→ Clan War Hall of Fame updated
  └──→ Next season teaser shown
```

### Social System Dependencies

```
Guild ──→ Clan Wars (guild vs guild)
  │   ──→ Guild Expedition (co-op biome runs)
  │   ──→ Guild Chat (real-time communication)
  │   ──→ Community Goals (guild leaderboard)
  │   ──→ Guild Profile (stats card)
  │
Battle ──→ Tournament (8-player bracket)
  │    ──→ Rating System (Elo, ranks)
  │    ──→ Season Rating (cosmetic tier)
  │    ──→ Spectating (watch mode)
  │    ──→ Season Missions ("The Grind" track)
  │
Co-op ──→ Trading (inventory exchange)
  │   ──→ Emotes (non-verbal communication)
  │   ──→ Avatar (partner visualization)
  │   ──→ Co-op Leaderboards (by difficulty)
  │   ──→ Guild Expedition (collective play)
```

---

## Level 4: Data Persistence Map

| Key                       | System                  | Scope                              |
| :------------------------ | :---------------------- | :--------------------------------- |
| `mineCtris_survivalWorld` | Survival world blocks   | Per-world (reset on game-over)     |
| `mineCtris_survivalStats` | Survival lifetime stats | Permanent                          |
| `mineCtris_powerups`      | Power-up bank           | Permanent (across runs)            |
| `mineCtris_editorDraft`   | Editor puzzle draft     | Per-draft                          |
| `mineCtris_saveState`     | Pause/resume state      | Per-session (cleared on game over) |
| `mineCtris_stats`         | Lifetime play stats     | Permanent                          |
| `mineCtris_highscores`    | Classic top 10          | Permanent                          |
| `mineCtris_level`         | Player level + XP       | Permanent                          |
| `mineCtris_achievements`  | Unlocked achievements   | Permanent                          |
| `mineCtris_mastery`       | Mastery tier progress   | Permanent                          |
| `mineCtris_missions`      | Daily mission state     | Per-day                            |
| `mineCtris_cosmetics`     | Equipped cosmetics      | Permanent                          |
| `mineCtris_settings`      | Audio/visual prefs      | Permanent                          |
| `mineCtris_displayName`   | Leaderboard name        | Permanent                          |
| `mineCtris_guildId`       | Guild membership        | Permanent                          |

---

## Level 5: API Surface Map

| Endpoint Group            | Purpose                              | Used By                       |
| :------------------------ | :----------------------------------- | :---------------------------- |
| `/api/scores/*`           | Leaderboard submission               | Daily, Weekly, Season, Co-op  |
| `/api/season`             | Active season config                 | Season system, Featured biome |
| `/api/guilds/*`           | Guild CRUD, member management        | Guild system                  |
| `/api/clan-wars/*`        | Match management, results, standings | Clan War engine               |
| `/api/guild-chat/*`       | Real-time messaging                  | Guild chat                    |
| `/api/guild-expedition/*` | Collective biome events              | Guild expedition              |
| `/api/puzzles/*`          | Community puzzle browse/vote         | Community, Editor             |
| `/api/community-goals/*`  | Weekly collective challenges         | Community goals               |
| `/api/leaderboard/*`      | Daily, season, co-op rankings        | Leaderboard UI                |
| WebSocket DO              | Real-time co-op/battle relay         | Battle, Co-op, Guild Chat     |

---

## Quick Reference: Full Feature Count

| Category                 | Count                                                                                           |
| :----------------------- | :---------------------------------------------------------------------------------------------- |
| Game Modes               | 11 (Classic, Sprint, Blitz, Puzzle, Daily, Weekly, Survival, Battle, Expedition, Co-op, Editor) |
| Block Types              | 20 (14 standard + 6 hazard)                                                                    |
| Crafting Recipes         | 13                                                                                              |
| Achievements             | 58                                                                                              |
| Mastery Challenges       | 40 (8 modes × 5 tiers)                                                                         |
| Daily Mission Templates  | 33                                                                                              |
| Season Mission Tracks    | 2 (10 missions total)                                                                           |
| Biomes                   | 4                                                                                               |
| Biome Reward Tiers       | 60 (4 × 15)                                                                                    |
| Featured Pass Tiers      | 50                                                                                              |
| Prestige Tiers           | 10                                                                                              |
| Player Levels            | 100 (prestige unlocks at L50)                                                                   |
| Weekly Modifiers         | 5                                                                                               |
| Events                   | 4                                                                                               |
| Cosmetic Categories      | 6 (block skins, themes, trails, titles, borders, season sets)                                   |
| Visual Themes            | 15+                                                                                             |
| Block Skins              | 9                                                                                               |
| Puzzles (built-in)       | 10                                                                                              |
| Community Goal Templates | 6                                                                                               |
| Social Features          | 7 (Co-op, Battle, Guild, Clan War, Tournament, Community Goals, Community Puzzles)              |

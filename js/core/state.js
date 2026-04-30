// Global mutable state shared across all modules.
// Requires: config.js loaded first (for BLOCK_SIZE), Three.js loaded first.

// ── Three.js scene objects ────────────────────────────────────────────────────
let scene, camera, renderer, controls;
let composer; // EffectComposer for post-processing (SSAO)
let worldGroup;
let fallingPiecesGroup;
let raycaster;
let pickaxeGroup;

// ── Sky / lighting ────────────────────────────────────────────────────────────
let skyMesh, skyStars, sunLight, hemisphereLight;
let sunMesh, sunCorona, moonMesh, moonCrescent;

// ── Lava point-light pool ─────────────────────────────────────────────────────
// Max 4 PointLights shared across all lava blocks; positioned toward closest blocks.
const LAVA_LIGHT_COUNT = 4;
let lavaLights = [];

// ── DOM element references (assigned in init()) ───────────────────────────────
let rendererContainer;
let blocker;
let instructions;
let crosshair;

// ── Player movement flags ─────────────────────────────────────────────────────
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let playerVelocity = new THREE.Vector3();
let playerOnGround = false;

// ── Timing ────────────────────────────────────────────────────────────────────
let lastTime = performance.now();
let clock = new THREE.Clock();

// ── Falling pieces ────────────────────────────────────────────────────────────
let fallingPieces = [];
let spawnTimer = 0;

// ── Landing shadow/ghost previews ─────────────────────────────────────────────
let shadowsGroup;

// ── Mining state ──────────────────────────────────────────────────────────────
let targetedBlock = null;
let miningProgress = 0;
let originalBlockColor = new THREE.Color();
let isMining = false;
let miningAnimStartTime = 0;

let miningShakeActive = false;
let miningShakeStart = 0;
let miningShakeBlock = null;
let dustParticles = [];

// ── Audio state ───────────────────────────────────────────────────────────────
let audioReady = false;

// ── Grid occupancy ────────────────────────────────────────────────────────────
// Maps integer Y-level → Set of "x,z" strings (one per occupied cell).
const gridOccupancy = new Map();

// ── Line-clear state ──────────────────────────────────────────────────────────
let lineClearInProgress = false;
let lineClearFlashBlocks = [];
let lineClearFlashStart = -1;
let lineClearPendingYs = [];

// ── Score & stats ─────────────────────────────────────────────────────────────
let score = 0;
let blocksMined = 0;
let linesCleared = 0;
let gameElapsedSeconds = 0;
let gameTimerRunning = false;
let lastHudSecond = -1;
let scoreEl = null;
let nextPiecesEl = null;
let lineClearBannerEl = null;
let bannerTimer = 0;

// ── Combo multiplier state ────────────────────────────────────────────────────
let comboCount = 0;       // consecutive line clears within 3s (1 = first clear)
let lastClearTime = -1;   // clock.getElapsedTime() when last clear occurred
let comboBannerEl = null; // DOM reference for combo banner
let comboBannerTimer = 0; // seconds remaining for combo banner display

// ── Difficulty scaling ────────────────────────────────────────────────────────
let difficultyMultiplier = 1.0;  // current fall-speed multiplier
let lastDifficultyTier = 0;      // last tier that triggered a speed-up
let speedUpBannerEl = null;      // DOM reference, assigned in init()
let speedUpBannerTimer = 0;      // seconds remaining for speed-up banner

// ── Speed modifier ────────────────────────────────────────────────────────────
let speedModifier = 'normal';       // 'slow' | 'normal' | 'double' | 'chaos'
let speedModifierMultiplier = 1.0;  // effective multiplier applied to new piece velocity
let chaosPhaseAccumulator = 0;      // accumulates time for chaos oscillation (radians)

// ── Game-over flag ────────────────────────────────────────────────────────────
let isGameOver = false;

// ── Pause flag ────────────────────────────────────────────────────────────────
let isPaused = false;

// ── Inventory ─────────────────────────────────────────────────────────────────
// Keys are CSS hex color strings (e.g. "#8b4513"), values are counts.
let inventory = {};

// ── Tree respawn queue ────────────────────────────────────────────────────────
// Each entry: { x, z, timer, growing, growStart, meshes }
let treeRespawnQueue = [];

// ── Obsidian block shimmer tracking ──────────────────────────────────────────
// Holds all living obsidian world objects for per-frame emissive shimmer update.
let obsidianBlocks = [];

// ── Block placement state ─────────────────────────────────────────────────────
let selectedBlockColor = null;  // CSS hex color key of selected block type
let targetedFaceNormal = null;  // THREE.Vector3 world-space face normal from last raycast
let groundPlacementPoint = null; // THREE.Vector3 world intersection point on ground (when no block targeted)

// ── Ice friction state ────────────────────────────────────────────────────────
let playerStandingOnIce = false;

// ── Crafting / pickaxe tier ───────────────────────────────────────────────────
// Values: "none" | "stone" | "iron" | "diamond"
let pickaxeTier = "none";

// Whether the current battle match is a tournament match (gates +50 rating bonus on win).
let isTournamentMatch = false;

// Whether the player has crafted a Crafting Bench (gates advanced recipes).
let hasCraftingBench = false;

// Consumable item counts. Keys: "lava_flask" | "ice_bridge".
let consumables = { lava_flask: 0, ice_bridge: 0 };

// Power-up item counts (separate from blocks and consumables).
// Keys: "row_bomb" | "slow_down" | "shield" | "magnet" | "time_freeze"
//       "sabotage" | "counter" | "fortress"  (battle-only)
let powerUps = { row_bomb: 0, slow_down: 0, shield: 0, magnet: 0, time_freeze: 0,
                 sabotage: 0, counter: 0, fortress: 0 };

// Ice Bridge slow — reduces falling piece speed by 20% for a duration.
let iceBridgeSlowActive = false;
let iceBridgeSlowTimer  = 0.0;

// ── Player push (from landing pieces) ────────────────────────────────────────
let playerPushVelocity = new THREE.Vector3();
let screenShakeActive = false;
let screenShakeStart = 0;

// ── Combo screen shake ────────────────────────────────────────────────────────
// Separate from push-based screenShake; triggered by consecutive line clears.
let comboShakeActive = false;
let comboShakeStart  = 0;
let comboShakeStrength = 0;

// ── Piece nudge state ─────────────────────────────────────────────────────────
let nudgeCooldown = 0;  // seconds remaining before next nudge is allowed

// ── Next-piece queue ──────────────────────────────────────────────────────────
// Each entry: { index: colorIndex, shape: SHAPES[index] }
let pieceQueue = [];

// ── Hold-piece queue ──────────────────────────────────────────────────────────
let holdPiece = null;      // { index, shape } or null when empty
let holdLocked = false;    // cannot hold again until current piece lands
let holdUsedCount = 0;     // session stat: number of times hold was used
let holdPanelEl = null;    // DOM ref for #hold-piece-panel

// ── Battle mode state ─────────────────────────────────────────────────────────
// true while a battle session is active.
let isBattleMode = false;
// Battle result: 'win' | 'loss' | 'draw' | null
let battleResult = null;
// Match mode: 'survival' (last standing) | 'score_race' (highest score in 3 min)
let battleMatchMode = 'survival';
// Whether the current battle is a ranked (ELO-affecting) match
let battleIsRanked = false;
// Score Race: countdown timer in ms (3 minutes)
let battleScoreRaceRemainingMs = 180000;
// Opponent's last known score and lines cleared (updated from battle_board messages)
let battleOpponentScore = 0;
let battleOpponentLines = 0;
// Battle session stats (accumulated during match, reset each new game)
let battleGarbageSent = 0;
let battleGarbageReceived = 0;
let battleRubbleMined = 0;
let battlePiecesPlaced = 0;
// Rolling timestamps of piece-land events for APM computation (last 60 s)
let _battleApmTimestamps = [];
// Opponent's end-of-match summary stats (set from battle_game_over / battle_score_race_end msg)
let battleOpponentStats = null;
// Opponent's battle rating (received via battle_rating WebSocket message; defaults to 1000)
let battleOpponentRating = 1000;
// Back-to-back Tetris detection: true after a 4-line clear; reset on any sub-Tetris clear.
let lastClearWasTetris = false;
// Back-to-back difficult clear: true after a T-spin (with lines) or Tetris.
// Used for the B2B 1.5× scoring bonus.
let lastClearWasDifficult = false;
// T-spin detection: set by pieces.js when a T-piece (index 1) lands.
// Value: 'full' (3+ corners) | 'mini' (2 corners) | '' (no T-spin).
// Consumed once by checkLineClear() to tag the current clear event.
let lastPieceTSpin = '';
// Mining line-clear: set by placeBlock() when the player places a mined block.
// Consumed once by checkLineClear() to tag the current clear as mining-triggered.
let lastBlockWasMined = false;

// ── Co-op mode state ──────────────────────────────────────────────────────────
// true while a co-op session is active; suppresses local random piece generation.
let isCoopMode = false;
// true while co-op uses the 16-column shared wide board.
let isCoopWideBoard = false;
// true while the co-op trade offer panel is open (suppresses pause on pointer unlock).
let coopTradePanelOpen = false;
// Last received partner world position (updated from 'pos' messages; used for proximity checks).
let coopPartnerLastPos = null; // { x, y, z } or null
// Pieces received from the Durable Object for co-op play.
// Each entry: { index, spawnX, spawnZ, startRotation: {axis, angle}, rotationInterval, pieceIndex }
let coopPieceQueue = [];
// Position broadcast: last broadcast time (ms) and last sent position snapshot.
let _coopPosBroadcastLastTime = 0;
let _coopPosLastSent = null; // { x, y, z, rotY, rotX }

// ── Co-op shared game state ───────────────────────────────────────────────────
let coopScore = 0;                  // combined team score (local + partner deltas)
let coopMyScore = 0;                // local player's individual contribution
let coopPartnerScore = 0;           // partner's individual contribution
let coopPartnerMaxY = 0;            // last received partner max-block height
let coopHeightBroadcastLastTime = 0; // ms, for 2 s height broadcast interval
let coopPartnerStatus = 'disconnected'; // 'connected' | 'lagging' | 'disconnected'
let coopPartnerLastSeenTime = 0;    // ms, for partner status dot decay

// ── Co-op per-player session stats ───────────────────────────────────────────
let coopMyBlocksMined = 0;
let coopMyLinesTriggered = 0;
let coopMyCraftsMade = 0;
let coopMyTradesCompleted = 0;
let coopPartnerBlocksMined = 0;
let coopPartnerLinesTriggered = 0;
let coopPartnerCraftsMade = 0;
let coopPartnerTradesCompleted = 0;
let coopPartnerName = '';           // partner's display name (from game_end_stats)
let coopStatsReceived = false;      // true once partner's end-of-game stats arrived

// ── Co-op difficulty state ────────────────────────────────────────────────────
let coopDifficulty = 'normal';      // 'casual' | 'normal' | 'challenge'
let coopFallMultiplier = 1.5;       // baseline fall speed multiplier from difficulty
let coopScoreMultiplier = 1.8;      // score multiplier from difficulty
let coopBonusBannerTimer = 0;       // seconds remaining for "CO-OP BONUS" banner
let coopGarbageTimer = 0;           // seconds until next periodic garbage injection (0 = disabled)

// ── Daily challenge state ─────────────────────────────────────────────────────
let isDailyChallenge = false;
let isDailyCoopChallenge = false; // true when co-op daily challenge sub-mode is active
// null → use Math.random(); function → seeded daily PRNG from daily.js
let gameRng = null;

// ── Puzzle mode state ─────────────────────────────────────────────────────────
// Fixed-sequence puzzles with pre-placed block layouts and a win/lose condition.
let isPuzzleMode    = false;
let puzzlePuzzleId  = 1;     // Which puzzle (1–10) is currently active
let puzzleComplete  = false;

// ── Weekly challenge state ────────────────────────────────────────────────────
let isWeeklyChallenge = false;
let weeklyModifier = null; // { id, name, description, applyFn }

// Per-modifier effect flags (set by modifier.applyFn, cleared on resetGame)
let weeklyNoIron = false;          // No Iron Week: crafting disabled
let weeklyGoldRush = false;        // Gold Rush: gold 3× more likely, 2× line-clear score
let weeklyIceAge = false;          // Ice Age: 60% ice pieces, Level 3 start
let weeklyDoubleOrNothing = false; // Double or Nothing: 3× combo mult, −25% score on break
let weeklyBlindDrop = false;       // Blind Drop: next-piece preview hidden

// ── Marathon mode state ───────────────────────────────────────────────────────
// Endless mode with level-based speed (like classic Tetris). Every 10 lines = +1 level.
// Speed curve: level N multiplier = pow(MARATHON_LEVEL_RATE, N-1).
// Kill screen at level 29 (very high speed). Milestone messages at levels 5,10,15,20,25,29.
let isMarathonMode      = false;
let marathonLevel       = 1;      // current level (1–29+)
let marathonKillScreen  = false;  // true after level 29 is reached
let marathonPeakLPM     = 0;      // highest lines-per-minute seen during the run
const MARATHON_LINES_PER_LEVEL = 10;
const MARATHON_KILL_SCREEN_LEVEL = 29;
const MARATHON_LEVEL_RATE = 1.18; // per-level speed multiplier (≈ 1.18^28 ≈ 84× at kill screen)

// ── Marathon Endless mode state ───────────────────────────────────────────────
// Infinite marathon — no level cap, progressive speed, milestone cosmetics,
// optional garbage injection after 300 lines, auto-save every 50 lines.
let isMarathonEndlessMode        = false;
let marathonEndlessLevel         = 1;    // current level (increases every 10 lines, no cap)
let marathonEndlessPeakLPM       = 0;   // highest lines-per-minute seen this session
let marathonEndlessLastMilestone = 0;   // last milestone threshold reached (50/100/200/500/1000)
let marathonEndlessLastCheckpoint = 0;  // last checkpoint save at this line count
let marathonEndlessGarbageTimer  = 0;   // seconds since last garbage injection
let marathonEndlessGarbageEnabled = true; // toggle garbage injection in the settings card

// ── Sprint mode state ─────────────────────────────────────────────────────────
// Target: clear exactly 40 lines as fast as possible.
// Fixed fall speed = Classic Level 5 (tier 4 multiplier).
// Crafting disabled; mining enabled; no lose condition.
let isSprintMode       = false;
let sprintTimerActive  = false;   // becomes true on first piece drop
let sprintElapsedMs    = 0;       // milliseconds since sprint timer started
let sprintComplete     = false;
const SPRINT_LINE_TARGET        = 40;
const SPRINT_FIXED_MULTIPLIER   = Math.pow(1.1, 4); // ≈ 1.4641 (Level 5)

// ── Blitz mode state ──────────────────────────────────────────────────────────
// Target: score as many points as possible in 2 minutes.
// Fixed fall speed = Classic Level 5. Crafting disabled; mining enabled.
// No lose condition. Blitz bonus: final 30s → 2.0x multiplier on line clears.
let isBlitzMode        = false;
let blitzTimerActive   = false;   // becomes true on first piece drop
let blitzRemainingMs   = 120000;  // milliseconds remaining (counts down)
let blitzComplete      = false;
let blitzBonusActive   = false;   // true when ≤ 30s remaining
const BLITZ_DURATION_MS        = 120000; // 2 minutes
const BLITZ_BONUS_THRESHOLD_MS = 30000;  // final 30 seconds
const BLITZ_BONUS_MULTIPLIER   = 2.0;
const BLITZ_FIXED_MULTIPLIER   = Math.pow(1.1, 4); // ≈ 1.4641 (same as Sprint)

// ── Combo Challenge state ─────────────────────────────────────────────────────
// Target: chain consecutive line clears to build multipliers. 60-second countdown.
// Fixed fall speed = Level 5. Streak resets if a piece locks without clearing a line.
// Score per clear = lines × (1 + streak × 0.5), multiplier capped at 10×.
let isComboChallenge            = false;
let comboChallengeTimerActive   = false;  // becomes true on first piece drop
let comboChallengeRemainingMs   = 60000;  // milliseconds remaining (counts down)
let comboChallengeComplete      = false;
let comboChallengeStreak        = 0;      // consecutive line-clearing pieces
let comboChallengeMaxStreak     = 0;      // highest streak reached this session
let comboChallengeTotalLines    = 0;      // total lines cleared in this mode
const COMBO_CHALLENGE_DURATION_MS      = 60000;          // 60 seconds
const COMBO_CHALLENGE_FIXED_MULTIPLIER = Math.pow(1.1, 4); // ≈ 1.4641 (Level 5, same as Blitz)

// ── Daily challenge line-limit tracker ───────────────────────────────────────
let dailyTimerActive   = false;  // becomes true on first piece drop (name kept for compat)
const DAILY_LINE_LIMIT = 200;    // game ends after 200 lines cleared

// ── Accessibility ─────────────────────────────────────────────────────────────
// Colorblind preset: 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia'.
// colorblindMode mirrors (preset !== 'off') for backward compatibility with rendering code.
let colorblindPreset = 'off';
let colorblindMode = false;   // derived: (colorblindPreset !== 'off')
// true = suppresses camera shake, screen flash, and chromatic aberration.
let reducedMotionEnabled = false;
// true = high-contrast mode: white text, outlined blocks, increased UI contrast.
let highContrastEnabled = false;

/**
 * Return the CVD-safe color for a given block color index under the current preset.
 * Falls back to the deuteranopia palette when the preset is 'deuteranopia' or unknown.
 * Returns null when the index has no CVD mapping.
 */
function getCBColors(index) {
  if (colorblindPreset === 'protanopia') return PROTANOPIA_COLORS[index];
  if (colorblindPreset === 'tritanopia') return TRITANOPIA_COLORS[index];
  return COLORBLIND_COLORS[index]; // deuteranopia (default)
}

/**
 * Return the surface pattern index for a given block color index.
 * Patterns are the same across all presets — they further distinguish pieces
 * by shape, not color, so they work regardless of the deficiency type.
 */
function getCBPatterns(index) {
  return COLORBLIND_PATTERNS[index];
}

// ── Visual theme ──────────────────────────────────────────────────────────────
// "classic" = default Minecraft-inspired palette (always unlocked).
// "nether"  = dark stone/lava palette (unlocked via "Iron Will" achievement).
let activeTheme = "classic";

// ── Active block skin ─────────────────────────────────────────────────────────
// Resolved once at game start from cosmetics.js getEquipped("block_skin").
// null or 'default' means no skin override; otherwise holds the themeKey string.
let activeBlockSkin = null;

// ── Per-piece-type skin overrides ─────────────────────────────────────────────
// Loaded once at game start from localStorage (SKIN_PER_PIECE_KEY in block-skin-anim.js).
// Format: { colorIndex: skinKey } e.g. { 1: 'animated_lava', 3: 'animated_redstone' }
// null means no per-piece overrides are active; global activeBlockSkin is used.
let activePerPieceTypeSkins = null;

// ── Power-up bank (persistent across runs via localStorage) ──────────────────
const POWERUP_BANK_KEY     = "mineCtris_powerups";
const POWERUP_PER_TYPE_CAP = 10;  // max per power-up type in bank
const POWERUP_TOTAL_CAP    = 30;  // max total power-ups in bank

function clampPowerUpBank(bank) {
  var types = ['row_bomb', 'slow_down', 'shield', 'magnet', 'time_freeze', 'sabotage', 'counter', 'fortress'];
  // Enforce per-type cap
  for (var i = 0; i < types.length; i++) {
    if ((bank[types[i]] || 0) > POWERUP_PER_TYPE_CAP) bank[types[i]] = POWERUP_PER_TYPE_CAP;
  }
  // Enforce total cap: reduce excess from types with the most, last-to-first
  var total = types.reduce(function(s, t) { return s + (bank[t] || 0); }, 0);
  for (var j = types.length - 1; j >= 0 && total > POWERUP_TOTAL_CAP; j--) {
    var excess = total - POWERUP_TOTAL_CAP;
    var reduce = Math.min(bank[types[j]] || 0, excess);
    bank[types[j]] = (bank[types[j]] || 0) - reduce;
    total -= reduce;
  }
  return bank;
}

function loadPowerUpBank() {
  try {
    const raw = localStorage.getItem(POWERUP_BANK_KEY);
    if (!raw) return { row_bomb: 0, slow_down: 0, shield: 0, magnet: 0, time_freeze: 0,
                       sabotage: 0, counter: 0, fortress: 0 };
    const data = JSON.parse(raw);
    return {
      row_bomb:   data.row_bomb   || 0,
      slow_down:  data.slow_down  || 0,
      shield:     data.shield     || 0,
      magnet:     data.magnet     || 0,
      time_freeze: data.time_freeze || 0,
      sabotage:   data.sabotage   || 0,
      counter:    data.counter    || 0,
      fortress:   data.fortress   || 0,
    };
  } catch (_) {
    return { row_bomb: 0, slow_down: 0, shield: 0, magnet: 0, time_freeze: 0,
             sabotage: 0, counter: 0, fortress: 0 };
  }
}

function savePowerUpBank(bank) {
  try { localStorage.setItem(POWERUP_BANK_KEY, JSON.stringify(clampPowerUpBank(bank))); } catch (_) {}
}

// Equipped power-up for the current run (chosen on mode select screen).
// null = none equipped.
let equippedPowerUpType = null;

// Slow Down power-up: 50% fall-speed reduction for 60 s.
let slowDownActive = false;
let slowDownTimer  = 0.0;

// Shield power-up: absorb the next game-over event.
let shieldActive = false;

// Magnet power-up: auto-mine nearest block within 5 units, once/s, for 30 s.
let magnetActive      = false;
let magnetTimer       = 0.0;
let magnetLastPullTime = 0.0;

// Time Freeze power-up: freeze all falling pieces for 5 s (re-activation extends by 2 s).
let timeFreezeActive = false;
let timeFreezeTimer  = 0.0;

// Obsidian Pickaxe: passive -1 hit reduction on all blocks (min 1).
let obsidianPickaxeActive = false;

// Battle power-up state ────────────────────────────────────────────────────────
// Counter: true while the player's next incoming attack will be reflected.
let counterActive  = false;
// Fortress: true while all incoming garbage is blocked.
let fortressActive = false;
let fortressTimer  = 0.0;

// ── World event engine state ──────────────────────────────────────────────────
// activeEvent: currently running event type string (see EVENT_TYPES in events.js).
// eventRemainingMs: milliseconds left for the active event (0 when idle).
// eventHistory: array of { type, startedAt } records for the current session.
let activeEvent      = "NONE";
let eventRemainingMs = 0;
let eventHistory     = [];

// ── Piece Storm event state ───────────────────────────────────────────────────
// true while the PIECE_STORM world event is active.
let pieceStormActive = false;

// ── Golden Hour event state ───────────────────────────────────────────────────
// true while the GOLDEN_HOUR world event is active.
let goldenHourActive = false;

// ── Earthquake event state ────────────────────────────────────────────────────
// true while the EARTHQUAKE world event is active (enables mining hit halving).
let earthquakeActive = false;
// Camera shake offset tracking for sinusoidal earthquake shake (applied in main.js).
let _eqShakeOffX = 0;
let _eqShakeOffY = 0;

// ── Sandstorm event state ─────────────────────────────────────────────────────
// true while the SANDSTORM biome event is active (Desert biome only).
let sandstormActive = false;
// true during the 10-second "clear skies" 2× bonus window after sandstorm ends.
let clearSkiesActive = false;
let _clearSkiesRemainingMs = 0;

// ── Creeper event state ──────────────────────────────────────────────────────
// true while the CREEPER world event is active.
let creeperActive = false;
// The creeper 3D mesh currently in the scene (null when no creeper is alive).
let _creeperMesh = null;
// Creeper approach state: true once within fuse range (5 grid units).
let _creeperFusing = false;
// Fuse countdown in seconds (starts at 2.5 when fuse begins).
let _creeperFuseTimer = 0;
// Creeper hit points remaining (player mines to defuse).
let _creeperHP = 0;
// true when the player mined the Creeper to 0 HP (defused, no explosion).
let _creeperDefused = false;
// Creeper VFX: approach bob phase (radians), fuse particle array, explosion particle array
let _creeperBobPhase = 0;
let _creeperFuseParticles = [];
let _creeperExplosionParticles = [];
// Scale-pulse animation: time remaining in seconds (0 = idle).
let _creeperHitPulseTime = 0;
// Walk cycle phase for leg animation (radians).
let _creeperWalkPhase = 0;

// ── Expedition mode state ─────────────────────────────────────────────────────
// true while a biome-themed Expedition session is active (set by biome-themes.js).
let isExpeditionMode    = false;

// ── Survival mode state ───────────────────────────────────────────────────────
// isSurvivalMode: true while a Survival session is active.
// survivalSessionNumber: increments each time the player continues on the same world.
let isSurvivalMode      = false;
let survivalSessionNumber = 1;

// ── Endless Survival mode state ───────────────────────────────────────────────
let isEndlessSurvivalMode       = false;
let endlessActiveModifiers      = [];   // array of active modifier IDs (max 3)
let endlessSurvivalSpeedTimer   = 0;    // seconds since last speed-up
let endlessSurvivalModTimer     = 0;    // seconds since last modifier activation
let endlessSurvivalSpeedLevel   = 0;    // how many speed-ups applied so far
let endlessMirrorActive         = false; // flips left/right nudge when true
let endlessGravityActive        = false; // applies gravity pass on piece land
let endlessPoisonActive         = false; // poisons a block every 10s
let endlessShrinkLevel          = 0;    // number of Shrink activations

// ── Session stats (reset each game, accumulated for lifetime stats on game over) ──
let blocksPlaced = 0;
let sessionCrafts = 0;
let sessionConsumableCrafts = 0;
let sessionHighestComboCount = 0;
let sessionTSpins = 0;
let sessionMiniTSpins = 0;
let sessionPerfectClears = 0;
let sessionTetrises = 0;
let sessionB2BCount = 0;

// ── Finesse scoring state (reset each game) ───────────────────────────────────
// finesseTotalFaults:       cumulative extra inputs beyond optimal this session.
// finessePerfectPlacements: pieces placed with 0 faults.
// finesseTotalPieces:       total pieces that have landed (denominator for stats).
// finesseCurrentPerfectStreak: current run of consecutive 0-fault placements.
// finesseBestPerfectStreak:    session-best run of consecutive 0-fault placements.
// finesseTotalInputs:       cumulative keypresses counted for KPP / APM.
// finesseByPieceType:       map colorIndex→{inputs, optimal, count} for post-game breakdown.
// finessePieceLandTimes:    timestamps (ms) of each piece-land event for PPS computation.
let finesseTotalFaults          = 0;
let finessePerfectPlacements    = 0;
let finesseTotalPieces          = 0;
let finesseCurrentPerfectStreak = 0;
let finesseBestPerfectStreak    = 0;
let finesseTotalInputs          = 0;
let finesseByPieceType          = {};   // { [colorIndex]: { inputs, optimal, count } }
let finessePieceLandTimes       = [];   // Array<DOMHighResTimeStamp>

// ── Editor mode state ─────────────────────────────────────────────────────────
// Free-fly no-gravity mode accessible via main menu "Create" or ?editor=1 URL param.
let isEditorMode = false;
let moveUp   = false;  // fly upward  (Space in editor mode)
let moveDown = false;  // fly downward (Shift in editor mode)

// ── Custom puzzle mode state (editor-created puzzles) ─────────────────────────
// isCustomPuzzleMode: true when playing a puzzle built with the editor.
// customPuzzleWinCondition: { mode, n } — set before entering game from editor.
// customPuzzleLayout: [{x, y, z, color}] — editor blocks captured at "Test" time.
// customPuzzleMetadata: { name, description, author, difficulty } — set from editor or share code.
// customPieceSequence: { mode: "random"|"fixed", pieces: [1-7, ...] } — piece spawn order.
let isCustomPuzzleMode      = false;
let customPuzzleWinCondition = null;
let customPuzzleLayout       = [];
let customPuzzleMetadata     = { name: "", description: "", author: "", difficulty: 0 };
let customPieceSequence      = { mode: "random", pieces: [] };
// true when the current custom puzzle session was launched from the editor Play button.
// Used to show "Edit Puzzle" on the completion overlay.
let customPlayFromEditor     = false;

// ── Gravity mode ──────────────────────────────────────────────────────────────
// Active gravity direction for falling pieces (Practice mode only).
// 'down'  = normal Tetris (pieces fall toward Y=0 ground) — default.
// 'up'    = pieces spawn below and fall upward toward a ceiling.
// 'left'  = pieces spawn at right edge and fall left.
// 'right' = pieces spawn at left edge and fall right.
let gravityDirection = 'down'; // 'down' | 'up' | 'left' | 'right'

// ── Practice mode state ───────────────────────────────────────────────────────
// isPracticeMode: true while a Practice session is active.
// practiceUndoEnabled: whether undo (Z key) is on for this session.
// practiceUndoHistory: stack of world snapshots for undo (max 20 entries).
let isPracticeMode      = false;
let practiceUndoEnabled = true;
let practiceUndoHistory = [];

// ── Training mode state ───────────────────────────────────────────────────────
// isTrainingMode: true while a Training scenario session is active.
// Training scenarios are managed by js/modes/training.js.
let isTrainingMode = false;

// ── Zen mode state ────────────────────────────────────────────────────────────
// Relaxed endless mode: no time pressure, no game-over from block height,
// slow fixed fall speed, ambient visuals, and a meditation (elapsed) timer.
// Personal best is tracked by longest session time (tiebreak: lines cleared).
let isZenMode = false;
const ZEN_FIXED_MULTIPLIER = 0.35; // ~65% slower than default fall speed

// ── Countdown mode state ──────────────────────────────────────────────────────
// Survival mode: gravity escalates every 30s through 10 speed stages.
// Stage 1 = Level 1 gravity. Stage 5 = Level 8. Stage 9 = Level 18. Stage 10 = 20G.
// Timer counts elapsed time survived. Game ends on normal game over (stack reaches top).
// Score = time_survived_seconds * 10 + linesCleared * 100.
// Leaderboard ranked by score (time-dominated with lines as meaningful bonus).
let isCountdownMode          = false;
let countdownTimerActive     = false;  // becomes true on first piece drop
let countdownElapsedMs       = 0;      // milliseconds survived
let countdownComplete        = false;  // true once game-over fires
let countdownSpeedStage      = 1;      // current stage (1–10)
let countdownStageTimer      = 0;      // seconds since last stage advance
let countdownWarningActive   = false;  // true during the 5s warning before a stage change

const COUNTDOWN_TOTAL_STAGES   = 10;
const COUNTDOWN_STAGE_INTERVAL = 30;    // seconds between speed stages
const COUNTDOWN_WARNING_SECS   = 5;     // warn this many seconds before each stage advance

// Per-stage fall-speed multipliers calibrated to spec:
//   Stage 1:  Level 1  (1.1^0  = 1.000)
//   Stage 2:  Level 3  (1.1^2  ≈ 1.210)
//   Stage 3:  Level 5  (1.1^4  ≈ 1.464)
//   Stage 4:  Level 6  (1.1^5  ≈ 1.611)
//   Stage 5:  Level 8  (1.1^7  ≈ 1.949)
//   Stage 6:  Level 10 (1.1^9  ≈ 2.358)
//   Stage 7:  Level 13 (1.1^12 ≈ 3.138)
//   Stage 8:  Level 15 (1.1^14 ≈ 3.797)
//   Stage 9:  Level 18 (1.1^17 ≈ 5.054)
//   Stage 10: 20G (near-instant, 40× base)
const COUNTDOWN_STAGE_MULTIPLIERS = [
  1.000,                         // Stage 1:  Level 1
  Math.pow(1.1, 2),              // Stage 2:  Level 3  ≈ 1.210
  Math.pow(1.1, 4),              // Stage 3:  Level 5  ≈ 1.464
  Math.pow(1.1, 5),              // Stage 4:  Level 6  ≈ 1.611
  Math.pow(1.1, 7),              // Stage 5:  Level 8  ≈ 1.949
  Math.pow(1.1, 9),              // Stage 6:  Level 10 ≈ 2.358
  Math.pow(1.1, 12),             // Stage 7:  Level 13 ≈ 3.138
  Math.pow(1.1, 14),             // Stage 8:  Level 15 ≈ 3.797
  Math.pow(1.1, 17),             // Stage 9:  Level 18 ≈ 5.054
  40.0,                          // Stage 10: 20G (near-instant drop)
];

function getCountdownMultiplier(stage) {
  const idx = Math.max(0, Math.min(stage - 1, COUNTDOWN_STAGE_MULTIPLIERS.length - 1));
  return COUNTDOWN_STAGE_MULTIPLIERS[idx];
}

// ── Cheese Race mode state ─────────────────────────────────────────────────────
// Start with 10 garbage rows; clear them all as fast as possible.
let isCheeseRaceMode      = false;
let cheeseRaceTimerActive = false;  // starts on first piece drop
let cheeseRaceElapsedMs   = 0;
let cheeseRaceComplete    = false;
const CHEESE_RACE_ROWS    = 10;     // garbage rows injected at start
const CHEESE_RACE_FIXED_MULTIPLIER = Math.pow(1.1, 4); // Level 5 speed

// ── Dig Mode state ─────────────────────────────────────────────────────────────
// Garbage rows rise from the bottom every 5 seconds. Survive as long as possible.
let isDigMode             = false;
let digTimerActive        = false;  // starts on first piece drop
let digElapsedMs          = 0;
let digGarbageAccMs       = 0;      // accumulator toward next row injection
const DIG_GARBAGE_INTERVAL_MS = 5000; // inject 1 row every 5 seconds
const DIG_FIXED_MULTIPLIER    = Math.pow(1.1, 4); // Level 5 speed

// ── Ultra Mode state ───────────────────────────────────────────────────────────
// Score as many points as possible in exactly 3 minutes.
// Like Blitz but longer, with bonus multiplier in the last 60 seconds.
let isUltraMode          = false;
let ultraTimerActive     = false;
let ultraRemainingMs     = 180000;  // 3 minutes countdown
let ultraComplete        = false;
let ultraBonusActive     = false;   // true when ≤ 60s remaining (2× multiplier)
const ULTRA_DURATION_MS         = 180000;
const ULTRA_BONUS_THRESHOLD_MS  = 60000;  // final 60 seconds
const ULTRA_FIXED_MULTIPLIER    = Math.pow(1.1, 4); // Level 5 speed

// ── Block Puzzle mini-game state ───────────────────────────────────────────────
// Each level pre-fills garbage rows; player clears them with a limited piece set.
let isBlockPuzzleMiniMode   = false;
let blockPuzzleMiniLevel    = 1;     // 1–20
let blockPuzzleMiniPiecesLeft = 0;   // pieces remaining before the puzzle ends
let blockPuzzleMiniRowsTarget = 0;   // lines that must be cleared to win
let blockPuzzleMiniComplete  = false;
let blockPuzzleMiniSuccess   = false; // true on win, false on fail/timeout
const BLOCK_PUZZLE_MINI_MAX_LEVEL = 20;
const BLOCK_PUZZLE_MINI_FIXED_MULTIPLIER = Math.pow(1.1, 3); // Level 4 (slower for puzzling)

// ── Tool tier abilities (MINAA-630) ───────────────────────────────────────────
// Stone pickaxe: consecutive click streak for the cleave-on-every-3rd-click bonus.
let stonePickaxeClickStreak = 0;
let stonePickaxeLastClickTime = -1;

// ── Classic mining layer (MINAA-629) ──────────────────────────────────────────
// true when Classic mode is active — enables stone-tier pickaxe and score-only mining.
let classicMiningEnabled = false;
// Current mining streak count (1 = first break, 2+ = consecutive breaks within window).
let miningStreak = 0;
// Countdown timer in seconds; resets to MINING_STREAK_WINDOW on each break.
let miningStreakTimer = 0;
// clock.getElapsedTime() at last block break (-1 = no break yet this session).
let lastMineTime = -1;
// true when checkLineClear is triggered by block physics (not piece landing).
let isPhysicsCascade = false;
// Current cascade depth (0-based) when isPhysicsCascade is true.
let cascadeLevel = 0;

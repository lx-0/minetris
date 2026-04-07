// Cosmetic data model and unlock system — foundation for all cosmetic categories.
//
// Categories: block_skin, pickaxe_skin, trail, landing_effect, border, title
// Rarities:   common, rare, epic, legendary
// Unlock conditions: level, prestige, achievement, mastery, season
//
// Depends on: stats.js (loadLifetimeStats), leveling.js (getLevelFromXP),
//             achievements.js (loadAchievements)

// ── Storage keys ────────────────────────────────────────────────────────────────

const COSMETICS_UNLOCKED_KEY             = 'mineCtris_cosmetics_unlocked';
const COSMETICS_EQUIPPED_KEY             = 'mineCtris_cosmetics_equipped';
const INFINITE_DEPTHS_HIGHEST_FLOOR_KEY  = 'mineCtris_infiniteDepths_highestFloor';

// ── Registry ────────────────────────────────────────────────────────────────────

const COSMETIC_REGISTRY = [
  // ── Block Skins ───────────────────────────────────────────────────────────
  {
    id:              'block_skin_default',
    category:        'block_skin',
    name:            'Default',
    rarity:          'common',
    unlockCondition: null, // always unlocked
    assets:          { themeKey: 'default' },
  },
  {
    id:              'block_skin_neon',
    category:        'block_skin',
    name:            'Neon',
    rarity:          'rare',
    unlockCondition: { type: 'level', value: 5 },
    assets:          { themeKey: 'neon' },
  },
  {
    id:              'block_skin_lava',
    category:        'block_skin',
    name:            'Lava',
    rarity:          'epic',
    unlockCondition: { type: 'level', value: 15 },
    assets:          { themeKey: 'lava' },
  },
  {
    id:              'block_skin_pixel',
    category:        'block_skin',
    name:            'Pixel',
    rarity:          'rare',
    unlockCondition: { type: 'level', value: 10 },
    assets:          { themeKey: 'pixel' },
    description:     'Flat retro palette — pure pixel art vibes.',
    icon:            '🎮',
  },
  {
    id:              'block_skin_crystal',
    category:        'block_skin',
    name:            'Crystal',
    rarity:          'epic',
    unlockCondition: { type: 'level', value: 20 },
    assets:          { themeKey: 'crystal' },
    description:     'Icy crystalline sheen — cold and beautiful.',
    icon:            '❄',
  },
  {
    id:              'block_skin_obsidian',
    category:        'block_skin',
    name:            'Obsidian',
    rarity:          'epic',
    unlockCondition: { type: 'level', value: 25 },
    assets:          { themeKey: 'obsidian' },
    description:     'Dark volcanic glass — forged in the deep.',
    icon:            '🌑',
  },
  {
    id:              'block_skin_diamond_classic',
    category:        'block_skin',
    name:            'Diamond',
    rarity:          'legendary',
    unlockCondition: { type: 'level', value: 35 },
    assets:          { themeKey: 'diamond_classic' },
    description:     'Prismatic diamond facets — the pinnacle of craft.',
    icon:            '💎',
  },

  // ── Animated Block Skins (6) ─────────────────────────────────────────────
  // Frame-animated skins driven by block-skin-anim.js.
  // Unlock: mix of level milestones, achievements, and boss defeats.

  {
    id:              'animated_block_skin_lava',
    category:        'block_skin',
    name:            'Flowing Lava',
    rarity:          'epic',
    unlockCondition: { type: 'level', value: 20 },
    assets:          { themeKey: 'animated_lava', animated: true },
    description:     'Lava flows and pulses through every block face — scorching.',
    icon:            '🌋',
  },
  {
    id:              'animated_block_skin_enchanted',
    category:        'block_skin',
    name:            'Enchanted Shimmer',
    rarity:          'epic',
    unlockCondition: { type: 'achievement', value: 'tetramino' },
    assets:          { themeKey: 'animated_enchanted', animated: true },
    description:     'Purple enchantment light cycles through the blocks.',
    icon:            '✨',
  },
  {
    id:              'animated_block_skin_redstone',
    category:        'block_skin',
    name:            'Redstone Pulse',
    rarity:          'epic',
    unlockCondition: { type: 'boss_defeat', value: 'wither' },
    assets:          { themeKey: 'animated_redstone', animated: true },
    description:     'Redstone signal pulses with each tick — defeat the Wither to unlock.',
    icon:            '⚡',
  },
  {
    id:              'animated_block_skin_diamond',
    category:        'block_skin',
    name:            'Diamond Sparkle',
    rarity:          'legendary',
    unlockCondition: { type: 'level', value: 30 },
    assets:          { themeKey: 'animated_diamond', animated: true },
    description:     'Prismatic diamond facets sparkle and catch the light.',
    icon:            '💎',
  },
  {
    id:              'animated_block_skin_prismarine',
    category:        'block_skin',
    name:            'Prismarine Shift',
    rarity:          'epic',
    unlockCondition: { type: 'achievement', value: 'architect' },
    assets:          { themeKey: 'animated_prismarine', animated: true },
    description:     'Deep ocean teal and green shift like living prismarine.',
    icon:            '🌊',
  },
  {
    id:              'animated_block_skin_nether_star',
    category:        'block_skin',
    name:            'Nether Star',
    rarity:          'legendary',
    unlockCondition: { type: 'boss_defeat', value: 'ender_dragon' },
    assets:          { themeKey: 'animated_nether_star', animated: true },
    description:     'Blinding white radiance of a Nether Star — defeat the Ender Dragon.',
    icon:            '⭐',
  },

  // ── Pickaxe Skins ─────────────────────────────────────────────────────────
  {
    id:              'pickaxe_skin_default',
    category:        'pickaxe_skin',
    name:            'Default',
    rarity:          'common',
    unlockCondition: null,
    assets:          { meshKey: 'pickaxe_default' },
  },
  {
    id:              'pickaxe_skin_obsidian',
    category:        'pickaxe_skin',
    name:            'Obsidian',
    rarity:          'epic',
    unlockCondition: { type: 'achievement', value: 'geologist' },
    assets:          { meshKey: 'pickaxe_obsidian' },
  },

  // ── Titles ────────────────────────────────────────────────────────────────
  {
    id:              'title_newcomer',
    category:        'title',
    name:            'Newcomer',
    rarity:          'common',
    unlockCondition: null,
    assets:          { displayText: 'Newcomer' },
  },
  {
    id:              'title_veteran',
    category:        'title',
    name:            'Veteran',
    rarity:          'rare',
    unlockCondition: { type: 'level', value: 30 },
    assets:          { displayText: 'Veteran' },
  },

  // ── Prestige Cosmetics ──────────────────────────────────────────────────
  {
    id:              'title_prestige_1',
    category:        'title',
    name:            'Prestigious',
    rarity:          'epic',
    unlockCondition: { type: 'prestige', value: 1 },
    assets:          { displayText: 'Prestigious', nameColor: '#FFD700' },
  },
  {
    id:              'trail_prestige_2',
    category:        'trail',
    name:            'Diamond Trail',
    rarity:          'epic',
    unlockCondition: { type: 'prestige', value: 2 },
    assets:          { trailKey: 'diamond', nameColor: '#B9F2FF' },
  },
  {
    id:              'block_skin_prestige_3',
    category:        'block_skin',
    name:            'Grandmaster',
    rarity:          'legendary',
    unlockCondition: { type: 'prestige', value: 3 },
    assets:          { themeKey: 'grandmaster' },
  },
  {
    id:              'title_grandmaster',
    category:        'title',
    name:            'Grandmaster',
    rarity:          'legendary',
    unlockCondition: { type: 'prestige', value: 3 },
    assets:          { displayText: 'Grandmaster' },
  },
  {
    id:              'border_prestige_5',
    category:        'border',
    name:            'Legendary Aura',
    rarity:          'legendary',
    unlockCondition: { type: 'prestige', value: 5 },
    assets:          { borderKey: 'legendary_aura', animated: true },
  },
  {
    id:              'title_legend',
    category:        'title',
    name:            'Legend',
    rarity:          'legendary',
    unlockCondition: { type: 'prestige', value: 5 },
    assets:          { displayText: 'Legend' },
  },
  {
    id:              'title_prestige_10',
    category:        'title',
    name:            'Crown',
    rarity:          'legendary',
    unlockCondition: { type: 'prestige', value: 10 },
    assets:          { displayText: 'Crown', leaderboardIcon: '\uD83D\uDC51' },
  },

  // ── Mastery Cosmetics (35 total: 7 modes × 5 tiers) ──────────────────────
  // Bronze → title, Silver → block_skin, Gold → trail,
  // Diamond → landing_effect, Obsidian → border

  // Classic
  { id: 'mastery_classic_bronze',   category: 'title',          name: 'Classic Runner',      rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'classic',    tier: 'bronze'   }, assets: { displayText: 'Classic Runner' } },
  { id: 'mastery_classic_silver',   category: 'block_skin',     name: 'Classic Stone',       rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'classic',    tier: 'silver'   }, assets: { themeKey: 'classic_stone' } },
  { id: 'mastery_classic_gold',     category: 'trail',          name: 'Classic Glow',        rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'classic',    tier: 'gold'     }, assets: { trailKey: 'classic_glow' } },
  { id: 'mastery_classic_diamond',  category: 'landing_effect', name: 'Classic Shatter',     rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'classic',    tier: 'diamond'  }, assets: { effectKey: 'classic_shatter' } },
  { id: 'mastery_classic_obsidian', category: 'border',         name: 'Classic Obsidian',    rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'classic',    tier: 'obsidian' }, assets: { borderKey: 'classic_obsidian', animated: true } },

  // Sprint
  { id: 'mastery_sprint_bronze',    category: 'title',          name: 'Sprint Initiate',     rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'sprint',     tier: 'bronze'   }, assets: { displayText: 'Sprint Initiate' } },
  { id: 'mastery_sprint_silver',    category: 'block_skin',     name: 'Sprint Flash',        rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'sprint',     tier: 'silver'   }, assets: { themeKey: 'sprint_flash' } },
  { id: 'mastery_sprint_gold',      category: 'trail',          name: 'Speed Trail',         rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'sprint',     tier: 'gold'     }, assets: { trailKey: 'speed_trail' } },
  { id: 'mastery_sprint_diamond',   category: 'landing_effect', name: 'Sprint Burst',        rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'sprint',     tier: 'diamond'  }, assets: { effectKey: 'sprint_burst' } },
  { id: 'mastery_sprint_obsidian',  category: 'border',         name: 'Sprint Obsidian',     rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'sprint',     tier: 'obsidian' }, assets: { borderKey: 'sprint_obsidian', animated: true } },

  // Blitz
  { id: 'mastery_blitz_bronze',     category: 'title',          name: 'Blitz Initiate',      rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'blitz',      tier: 'bronze'   }, assets: { displayText: 'Blitz Initiate' } },
  { id: 'mastery_blitz_silver',     category: 'block_skin',     name: 'Blitz Neon',          rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'blitz',      tier: 'silver'   }, assets: { themeKey: 'blitz_neon' } },
  { id: 'mastery_blitz_gold',       category: 'trail',          name: 'Blitz Flare',         rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'blitz',      tier: 'gold'     }, assets: { trailKey: 'blitz_flare' } },
  { id: 'mastery_blitz_diamond',    category: 'landing_effect', name: 'Blitz Impact',        rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'blitz',      tier: 'diamond'  }, assets: { effectKey: 'blitz_impact' } },
  { id: 'mastery_blitz_obsidian',   category: 'border',         name: 'Blitz Halo',          rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'blitz',      tier: 'obsidian' }, assets: { borderKey: 'blitz_halo', animated: true } },

  // Daily
  { id: 'mastery_daily_bronze',     category: 'title',          name: 'Daily Runner',        rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'daily',      tier: 'bronze'   }, assets: { displayText: 'Daily Runner' } },
  { id: 'mastery_daily_silver',     category: 'block_skin',     name: 'Daily Amber',         rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'daily',      tier: 'silver'   }, assets: { themeKey: 'daily_amber' } },
  { id: 'mastery_daily_gold',       category: 'trail',          name: 'Daily Star',          rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'daily',      tier: 'gold'     }, assets: { trailKey: 'daily_star' } },
  { id: 'mastery_daily_diamond',    category: 'landing_effect', name: 'Daily Shimmer',       rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'daily',      tier: 'diamond'  }, assets: { effectKey: 'daily_shimmer' } },
  { id: 'mastery_daily_obsidian',   category: 'border',         name: 'Daily Legend',        rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'daily',      tier: 'obsidian' }, assets: { borderKey: 'daily_legend', animated: true } },

  // Survival
  { id: 'mastery_survival_bronze',   category: 'title',          name: 'Survivor',            rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'survival',   tier: 'bronze'   }, assets: { displayText: 'Survivor' } },
  { id: 'mastery_survival_silver',   category: 'block_skin',     name: 'Forest Green',        rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'survival',   tier: 'silver'   }, assets: { themeKey: 'forest_green' } },
  { id: 'mastery_survival_gold',     category: 'trail',          name: 'Jungle Trail',        rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'survival',   tier: 'gold'     }, assets: { trailKey: 'jungle_trail' } },
  { id: 'mastery_survival_diamond',  category: 'landing_effect', name: 'Nature Bloom',        rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'survival',   tier: 'diamond'  }, assets: { effectKey: 'nature_bloom' } },
  { id: 'mastery_survival_obsidian', category: 'border',         name: 'Survivor Halo',       rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'survival',   tier: 'obsidian' }, assets: { borderKey: 'survivor_halo', animated: true } },

  // Battle
  { id: 'mastery_battle_bronze',    category: 'title',          name: 'Battle Initiate',     rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'battle',     tier: 'bronze'   }, assets: { displayText: 'Battle Initiate' } },
  { id: 'mastery_battle_silver',    category: 'block_skin',     name: 'Battle Scarlet',      rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'battle',     tier: 'silver'   }, assets: { themeKey: 'battle_scarlet' } },
  { id: 'mastery_battle_gold',      category: 'trail',          name: 'Combat Trail',        rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'battle',     tier: 'gold'     }, assets: { trailKey: 'combat_trail' } },
  { id: 'mastery_battle_diamond',   category: 'landing_effect', name: 'Battle Shockwave',    rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'battle',     tier: 'diamond'  }, assets: { effectKey: 'battle_shockwave' } },
  { id: 'mastery_battle_obsidian',  category: 'border',         name: 'Battle Crown',        rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'battle',     tier: 'obsidian' }, assets: { borderKey: 'battle_crown', animated: true } },

  // Expedition
  { id: 'mastery_expedition_bronze',   category: 'title',          name: 'Explorer',            rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'expedition', tier: 'bronze'   }, assets: { displayText: 'Explorer' } },
  { id: 'mastery_expedition_silver',   category: 'block_skin',     name: 'Expedition Mossy',    rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'expedition', tier: 'silver'   }, assets: { themeKey: 'expedition_mossy' } },
  { id: 'mastery_expedition_gold',     category: 'trail',          name: 'Explorer Trail',      rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'expedition', tier: 'gold'     }, assets: { trailKey: 'explorer_trail' } },
  { id: 'mastery_expedition_diamond',  category: 'landing_effect', name: 'Expedition Burst',    rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'expedition', tier: 'diamond'  }, assets: { effectKey: 'expedition_burst' } },
  { id: 'mastery_expedition_obsidian', category: 'border',         name: 'Explorer Wreath',     rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'expedition', tier: 'obsidian' }, assets: { borderKey: 'explorer_wreath', animated: true } },

  // ── Seasonal Event Cosmetics — "The Corruption Spreads" (S1) ─────────────
  // These are time-limited (never return) and unlocked by participating in the event.
  {
    id:              'seasonal_corruption_block_skin',
    category:        'block_skin',
    name:            'Corruption',
    rarity:          'seasonal',
    unlockCondition: { type: 'seasonal', eventId: 'corruption_spreads_s1' },
    assets:          { themeKey: 'corruption_void' },
    icon:            '☠',
    timeLimited:     true,
  },
  {
    id:              'seasonal_void_cleansing_trail',
    category:        'trail',
    name:            'Void Cleansing',
    rarity:          'seasonal',
    unlockCondition: { type: 'seasonal', eventId: 'corruption_spreads_s1' },
    assets:          { trailKey: 'void_cleansing', nameColor: '#88ffcc' },
    icon:            '✨',
    timeLimited:     true,
  },
  {
    id:              'seasonal_purifier_title',
    category:        'title',
    name:            'Purifier',
    rarity:          'seasonal',
    unlockCondition: { type: 'seasonal', eventId: 'corruption_spreads_s1' },
    assets:          { displayText: 'Purifier', nameColor: '#88ffcc' },
    icon:            '🌟',
    timeLimited:     true,
  },

  // ── Tournament Cosmetics ────────────────────────────────────────────────────
  {
    id:              'tournament_champion_badge',
    category:        'badge',
    name:            'Tournament Champion',
    rarity:          'rare',
    unlockCondition: { type: 'achievement', value: 'champion' },
    assets:          { icon: '🏆', nameColor: '#ffd700' },
    icon:            '🏆',
    description:     'Awarded for winning a tournament bracket.',
  },
  {
    id:              'tournament_finalist_badge',
    category:        'badge',
    name:            'Tournament Finalist',
    rarity:          'uncommon',
    unlockCondition: { type: 'achievement', value: 'finalist' },
    assets:          { icon: '🥈', nameColor: '#c0c0c0' },
    icon:            '🥈',
    description:     'Awarded for reaching a tournament final.',
  },

  // ── Seasonal Event Cosmetics — "Spring Mining Festival" (2026) ───────────
  // Earned by clearing 100 lines during the Spring Mining Festival event window.
  {
    id:              'seasonal_spring_badge',
    category:        'badge',
    name:            'Spring Miner',
    rarity:          'seasonal',
    unlockCondition: { type: 'seasonal', eventId: 'spring_mining_festival_2026' },
    assets:          { icon: '🌸', nameColor: '#ec4899' },
    icon:            '🌸',
    timeLimited:     true,
    description:     'Awarded for clearing 100 lines during the Spring Mining Festival.',
  },
  {
    id:              'seasonal_spring_border',
    category:        'border',
    name:            'Cherry Blossom',
    rarity:          'seasonal',
    unlockCondition: { type: 'seasonal', eventId: 'spring_mining_festival_2026' },
    assets:          { borderKey: 'cherry_blossom', nameColor: '#ec4899' },
    icon:            '🌸',
    timeLimited:     true,
    description:     'A delicate pink border for Spring Festival champions.',
  },

  // ── Seasonal Event Cosmetics — "Nether Invasion" (2026) ─────────────────
  // Earned by reaching 15,000 points in a single game during the Nether Invasion event.
  {
    id:              'seasonal_nether_crown',
    category:        'title',
    name:            'Nether Crown',
    rarity:          'seasonal',
    unlockCondition: { type: 'seasonal', eventId: 'nether_invasion_2026' },
    assets:          { displayText: 'Nether Crown', nameColor: '#ff4500' },
    icon:            '👑',
    timeLimited:     true,
    description:     'Claimed by survivors of the Nether Invasion 2026.',
  },

  // ── Infinite Depths — Free Progression Milestone Cosmetics ───────────────
  //
  // FREE / PREMIUM COSMETIC BOUNDARY (design rule):
  //   Free progression cosmetics — earned exclusively through gameplay skill
  //   (floor milestones, achievements, mastery). Themed around depth, skill,
  //   and accomplishment.
  //
  //   Premium cosmetics (future) — purchased only. Themed around aesthetic
  //   variety (seasonal themes, pop culture, abstract art). Never obtainable
  //   through gameplay.
  //
  //   RULE: No free progression cosmetic may share a visual theme or rarity
  //   tier with premium cosmetics. Premium cosmetics are never gameplay-gated.
  //
  // Thresholds: Floor 14 (Descent 2), 28 (Descent 4), 49 (Descent 7),
  //             70 (Descent 10), 100 (Descent ~14).
  {
    id:              'depths_title_depth_diver',
    category:        'title',
    name:            'Depth Diver',
    rarity:          'rare',
    unlockCondition: { type: 'infinite_depths_floor', value: 14 },
    assets:          { displayText: 'Depth Diver' },
  },
  {
    id:              'depths_block_skin_abyssal',
    category:        'block_skin',
    name:            'Abyssal',
    rarity:          'epic',
    unlockCondition: { type: 'infinite_depths_floor', value: 28 },
    assets:          { themeKey: 'abyssal' },
    description:     'Dark blue with depth-pressure cracks',
  },
  {
    id:              'depths_trail_entropy',
    category:        'trail',
    name:            'Entropy Trail',
    rarity:          'epic',
    unlockCondition: { type: 'infinite_depths_floor', value: 49 },
    assets:          { trailKey: 'entropy_dissolve' },
    description:     'Blocks dissolve behind you as you descend',
  },
  {
    id:              'depths_landing_void_walker',
    category:        'landing_effect',
    name:            'Void Walker',
    rarity:          'legendary',
    unlockCondition: { type: 'infinite_depths_floor', value: 70 },
    assets:          { effectKey: 'void_ripple' },
    description:     'Void ripple on piece land',
  },
  {
    id:              'depths_border_infinite',
    category:        'border',
    name:            'Infinite',
    rarity:          'legendary',
    unlockCondition: { type: 'infinite_depths_floor', value: 100 },
    assets:          { borderKey: 'infinite_depths', animated: true },
    description:     'Shifting depth colors — animated border',
  },

  // ── Boss Battle Cosmetics ─────────────────────────────────────────────────
  // Unlocked by defeating each boss in Boss Battle mode.
  {
    id:              'boss_block_skin_wither',
    category:        'block_skin',
    name:            'Wither Bone',
    rarity:          'epic',
    unlockCondition: { type: 'boss_defeat', value: 'wither' },
    assets:          { themeKey: 'wither' },
    description:     'Dark bone-and-soul sand texture — proof of Wither mastery',
  },
  {
    id:              'boss_title_wither_slayer',
    category:        'title',
    name:            'Wither Slayer',
    rarity:          'epic',
    unlockCondition: { type: 'boss_defeat', value: 'wither' },
    assets:          { displayText: 'Wither Slayer', nameColor: '#888' },
    description:     'Defeated the Wither in Boss Battle mode',
  },
  {
    id:              'boss_block_skin_ender',
    category:        'block_skin',
    name:            'End Stone',
    rarity:          'legendary',
    unlockCondition: { type: 'boss_defeat', value: 'ender_dragon' },
    assets:          { themeKey: 'ender' },
    description:     'Purple-veined End Stone blocks — proof of Dragon mastery',
  },
  {
    id:              'boss_title_dragon_slayer',
    category:        'title',
    name:            'Dragon Slayer',
    rarity:          'legendary',
    unlockCondition: { type: 'boss_defeat', value: 'ender_dragon' },
    assets:          { displayText: 'Dragon Slayer', nameColor: '#ce8aff' },
    description:     'Defeated the Ender Dragon in Boss Battle mode',
  },
  {
    id:              'boss_block_skin_warden',
    category:        'block_skin',
    name:            'Sculk',
    rarity:          'legendary',
    unlockCondition: { type: 'boss_defeat', value: 'warden' },
    assets:          { themeKey: 'sculk' },
    description:     'Deep Dark sculk texture — proof of Warden mastery',
  },
  {
    id:              'boss_title_warden_walker',
    category:        'title',
    name:            'Warden Walker',
    rarity:          'legendary',
    unlockCondition: { type: 'boss_defeat', value: 'warden' },
    assets:          { displayText: 'Warden Walker', nameColor: '#5dade2' },
    description:     'Defeated the Warden in Boss Battle mode',
  },

  // ── Achievement / Milestone Titles ───────────────────────────────────────
  {
    id:              'title_block_breaker',
    category:        'title',
    name:            'Block Breaker',
    rarity:          'common',
    unlockCondition: { type: 'level', value: 10 },
    assets:          { displayText: 'Block Breaker' },
    description:     'Reach level 10',
  },
  {
    id:              'title_speed_demon',
    category:        'title',
    name:            'Speed Demon',
    rarity:          'rare',
    unlockCondition: { type: 'mastery', mode: 'sprint', tier: 'bronze' },
    assets:          { displayText: 'Speed Demon', nameColor: '#ff6600' },
    description:     'Earn Bronze mastery in Sprint mode',
  },
  {
    id:              'title_peaceful_soul',
    category:        'title',
    name:            'Peaceful Soul',
    rarity:          'rare',
    unlockCondition: { type: 'level', value: 20 },
    assets:          { displayText: 'Peaceful Soul', nameColor: '#9B59B6' },
    description:     'Reach level 20',
  },
  {
    id:              'title_dungeon_delver',
    category:        'title',
    name:            'Dungeon Delver',
    rarity:          'epic',
    unlockCondition: { type: 'achievement', value: 'geologist' },
    assets:          { displayText: 'Dungeon Delver', nameColor: '#8B6914' },
    description:     'Unlock the Geologist achievement',
  },
  {
    id:              'title_puzzle_solver',
    category:        'title',
    name:            'Puzzle Solver',
    rarity:          'rare',
    unlockCondition: { type: 'mastery', mode: 'daily', tier: 'bronze' },
    assets:          { displayText: 'Puzzle Solver', nameColor: '#4fc3f7' },
    description:     'Earn Bronze mastery in Daily Challenge mode',
  },

];

// ── Persistence helpers ─────────────────────────────────────────────────────────

function _loadUnlockedCosmetics() {
  try {
    const raw = localStorage.getItem(COSMETICS_UNLOCKED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function _saveUnlockedCosmetics(ids) {
  try {
    localStorage.setItem(COSMETICS_UNLOCKED_KEY, JSON.stringify(ids));
  } catch (_) {}
  if (typeof onAutoSync === 'function') onAutoSync();
}

// Public wrappers used by seasonal-events.js to grant time-limited cosmetics.
function loadUnlockedCosmetics()      { return _loadUnlockedCosmetics(); }
function saveUnlockedCosmetics(ids)   { return _saveUnlockedCosmetics(ids); }

function _loadEquippedCosmetics() {
  try {
    const raw = localStorage.getItem(COSMETICS_EQUIPPED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function _saveEquippedCosmetics(map) {
  try {
    localStorage.setItem(COSMETICS_EQUIPPED_KEY, JSON.stringify(map));
  } catch (_) {}
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Look up a cosmetic definition by id.
 * @param {string} id
 * @returns {object|undefined}
 */
function getCosmeticById(id) {
  return COSMETIC_REGISTRY.find(c => c.id === id);
}

/**
 * Return all unlocked cosmetic objects.
 * Always includes cosmetics with no unlock condition (defaults).
 * @returns {object[]}
 */
function getUnlockedCosmetics() {
  const unlockedIds = new Set(_loadUnlockedCosmetics());
  return COSMETIC_REGISTRY.filter(
    c => c.unlockCondition === null || unlockedIds.has(c.id)
  );
}

/**
 * Check if a specific cosmetic is unlocked.
 * @param {string} id
 * @returns {boolean}
 */
function isCosmeticUnlocked(id) {
  const cosmetic = getCosmeticById(id);
  if (!cosmetic) return false;
  if (cosmetic.unlockCondition === null) return true;
  return _loadUnlockedCosmetics().includes(id);
}

/**
 * Equip a cosmetic in its category slot. The cosmetic must be unlocked.
 * Pass null as id to unequip the category.
 * @param {string|null} id
 * @returns {boolean} true if equipped successfully
 */
function equipCosmetic(id) {
  if (id === null) return false;

  const cosmetic = getCosmeticById(id);
  if (!cosmetic) return false;
  if (!isCosmeticUnlocked(id)) return false;

  const equipped = _loadEquippedCosmetics();
  equipped[cosmetic.category] = id;
  _saveEquippedCosmetics(equipped);
  return true;
}

/**
 * Unequip the cosmetic in a given category.
 * @param {string} category
 */
function unequipCosmetic(category) {
  const equipped = _loadEquippedCosmetics();
  delete equipped[category];
  _saveEquippedCosmetics(equipped);
}

/**
 * Get the currently equipped cosmetic object for a category, or null.
 * @param {string} category
 * @returns {object|null}
 */
function getEquipped(category) {
  const equipped = _loadEquippedCosmetics();
  const id = equipped[category];
  if (!id) return null;
  const cosmetic = getCosmeticById(id);
  // If the cosmetic was removed from registry, clean up
  if (!cosmetic) {
    delete equipped[category];
    _saveEquippedCosmetics(equipped);
    return null;
  }
  return cosmetic;
}

/**
 * Return the full equipped map: { category: cosmeticObject }.
 * @returns {object}
 */
function getAllEquipped() {
  const equipped = _loadEquippedCosmetics();
  const result = {};
  for (const [category, id] of Object.entries(equipped)) {
    const cosmetic = getCosmeticById(id);
    if (cosmetic) result[category] = cosmetic;
  }
  return result;
}

/**
 * Evaluate whether a cosmetic's unlock condition is met.
 * @param {object} cosmetic — a COSMETIC_REGISTRY entry
 * @returns {boolean}
 */
function checkUnlockCondition(cosmetic) {
  if (!cosmetic || cosmetic.unlockCondition === null) return true;

  const cond = cosmetic.unlockCondition;

  switch (cond.type) {
    case 'level': {
      if (typeof getPlayerLevel !== 'function') return false;
      return getPlayerLevel() >= cond.value;
    }
    case 'achievement': {
      if (typeof loadAchievements !== 'function') return false;
      const achs = loadAchievements();
      return !!achs[cond.value];
    }
    case 'prestige': {
      if (typeof getPrestigeLevel !== 'function') return false;
      return getPrestigeLevel() >= cond.value;
    }
    case 'mastery': {
      if (typeof getMasteryTier !== 'function') return false;
      var tierOrder = ['bronze', 'silver', 'gold', 'diamond', 'obsidian'];
      var requiredIdx = tierOrder.indexOf(cond.tier);
      var currentTier = getMasteryTier(cond.mode); // returns 0-5
      return currentTier >= requiredIdx + 1;
    }
    case 'infinite_depths_floor': {
      return _loadHighestInfiniteDepthsFloor() >= cond.value;
    }
    case 'boss_defeat': {
      try { return localStorage.getItem('mineCtris_bossDefeated_' + cond.value) === 'true'; } catch (_) { return false; }
    }
    case 'season': {
      // Season unlock — not yet wired
      return false;
    }
    default:
      return false;
  }
}

/**
 * Check all locked cosmetics, unlock any whose conditions are now met.
 * @returns {object[]} array of newly unlocked cosmetic objects
 */
function processUnlocks() {
  const unlockedIds = _loadUnlockedCosmetics();
  const unlockedSet = new Set(unlockedIds);
  const newlyUnlocked = [];

  for (const cosmetic of COSMETIC_REGISTRY) {
    // Skip already-unlocked and always-unlocked
    if (cosmetic.unlockCondition === null) continue;
    if (unlockedSet.has(cosmetic.id)) continue;

    if (checkUnlockCondition(cosmetic)) {
      unlockedIds.push(cosmetic.id);
      unlockedSet.add(cosmetic.id);
      newlyUnlocked.push(cosmetic);
    }
  }

  if (newlyUnlocked.length > 0) {
    _saveUnlockedCosmetics(unlockedIds);
  }

  return newlyUnlocked;
}

/**
 * Return all cosmetics in a given category.
 * @param {string} category
 * @returns {object[]}
 */
function getCosmeticsByCategory(category) {
  return COSMETIC_REGISTRY.filter(c => c.category === category);
}

// ── Infinite Depths — floor tracking & milestone awards ─────────────────────

function _loadHighestInfiniteDepthsFloor() {
  try {
    var v = parseInt(localStorage.getItem(INFINITE_DEPTHS_HIGHEST_FLOOR_KEY), 10);
    return isNaN(v) ? 0 : v;
  } catch (_) { return 0; }
}

function _saveHighestInfiniteDepthsFloor(floor) {
  try { localStorage.setItem(INFINITE_DEPTHS_HIGHEST_FLOOR_KEY, String(floor)); } catch (_) {}
}

/**
 * Get the player's all-time highest Infinite Depths floor.
 * @returns {number}
 */
function getHighestInfiniteDepthsFloor() {
  return _loadHighestInfiniteDepthsFloor();
}

/**
 * Called when an Infinite Depths run ends (game over or extraction).
 * Updates the persistent highest-floor record and awards any newly reached
 * milestone cosmetics, queuing an unlock notification for each.
 *
 * @param {number} floor  Descent level reached this run (dungeonDescentLevel).
 * @returns {object[]} Newly unlocked cosmetic objects (may be empty).
 */
function checkInfiniteDepthsMilestones(floor) {
  var prev    = _loadHighestInfiniteDepthsFloor();
  var highest = Math.max(prev, floor);
  if (highest > prev) {
    _saveHighestInfiniteDepthsFloor(highest);
  }

  // Scan registry for milestone cosmetics not yet unlocked
  var unlockedIds = _loadUnlockedCosmetics();
  var unlockedSet = new Set(unlockedIds);
  var newlyUnlocked = [];

  for (var i = 0; i < COSMETIC_REGISTRY.length; i++) {
    var cosmetic = COSMETIC_REGISTRY[i];
    if (!cosmetic.unlockCondition) continue;
    if (cosmetic.unlockCondition.type !== 'infinite_depths_floor') continue;
    if (unlockedSet.has(cosmetic.id)) continue;
    if (highest >= cosmetic.unlockCondition.value) {
      unlockedIds.push(cosmetic.id);
      unlockedSet.add(cosmetic.id);
      newlyUnlocked.push(cosmetic);
    }
  }

  if (newlyUnlocked.length > 0) {
    _saveUnlockedCosmetics(unlockedIds);
    for (var j = 0; j < newlyUnlocked.length; j++) {
      _queueCosmeticUnlockToast(newlyUnlocked[j]);
    }
  }

  return newlyUnlocked;
}

/** Queue a cosmetic unlock notification via the shared level-up toast system. */
function _queueCosmeticUnlockToast(cosmetic) {
  if (typeof _levelUpToastQueue !== 'undefined') {
    _levelUpToastQueue.push({ type: 'cosmetic_unlock', cosmetic: cosmetic });
    if (!_levelUpToastRunning && typeof _drainLevelUpQueue === 'function') {
      _drainLevelUpQueue();
    }
  }
}

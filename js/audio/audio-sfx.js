// Sound effects — block hits/breaks, line clears, jingles, game events.
// Requires: audio/audio.js loaded first.

function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** Play Tone.js hit layer — subtle pitched sine alongside the Howler sample. */
function _playBlockHitTone(blockCategory) {
  if (!blockHitSynth) return;
  var pitches = _BLOCK_HIT_PITCHES[blockCategory] || _BLOCK_HIT_PITCHES.generic;
  try {
    blockHitSynth.triggerAttackRelease(_pick(pitches), '32n', Tone.now());
  } catch (_e) {}
}

/** Play Tone.js break layer — slightly longer burst for satisfying shatter. */
function _playBlockBreakTone(blockCategory) {
  if (!blockBreakSynth) return;
  var pitches = _BLOCK_BREAK_PITCHES[blockCategory] || _BLOCK_BREAK_PITCHES.generic;
  try {
    blockBreakSynth.triggerAttackRelease(_pick(pitches), '16n', Tone.now());
  } catch (_e) {}
}

/** Play a Howler sound with randomised pitch for variety. */
function _playSfx(key, rateMin, rateMax) {
  const h = sfx[key];
  if (!h) return;
  const id = h.play();
  h.rate(rateMin + Math.random() * (rateMax - rateMin), id);
}

/** Play the appropriate hit sound for a block's object type. */
function playHitSound(objType) {
  if (!audioReady) return;
  if (objType === "trunk") {
    _playSfx("woodHit", 0.85, 1.15);
    _playBlockHitTone('wood');
  } else if (objType === "leaf") {
    _playSfx("leafHit", 0.9, 1.2);
    _playBlockHitTone('leaf');
  } else if (objType === "rock") {
    _playSfx("stoneHit", 0.88, 1.12);
    _playBlockHitTone('stone');
  } else {
    _playSfx("stoneHit", 0.75, 1.0);
    _playBlockHitTone('generic');
  }
}

/** Play the appropriate break sound for a block's object type. */
function playBreakSound(objType) {
  if (!audioReady) return;
  if (objType === "trunk") {
    _playSfx("woodBreak", 0.85, 1.1);
    _playBlockBreakTone('wood');
  } else if (objType === "leaf") {
    _playSfx("leafBreak", 0.9, 1.2);
    _playBlockBreakTone('leaf');
  } else if (objType === "rock") {
    _playSfx("stoneBreak", 0.88, 1.05);
    _playBlockBreakTone('stone');
  } else {
    _playSfx("woodBreak", 0.75, 1.0);
    _playBlockBreakTone('generic');
  }
}

/** Play rubble hit sound — lower pitch stoneHit for a crunchier feel. */
function playRubbleHitSound() {
  if (!audioReady) return;
  _playSfx("stoneHit", 0.55, 0.70);
  _playBlockHitTone('rubble');
}

/** Play rubble break sound — low-pitch stone break for a heavy crunch. */
function playRubbleBreakSound() {
  if (!audioReady) return;
  _playSfx("stoneBreak", 0.50, 0.65);
  _playBlockBreakTone('rubble');
}

// Placement click pitches — warm mid-register tones with subtle variety
const _PLACE_PITCHES = ['C4', 'D4', 'E4', 'G4', 'A4'];

/** Play block placement thud + tonal click with reverb tail. */
function playPlaceSound() {
  if (!audioReady) return;
  _playSfx("place", 0.88, 1.12);
  // Tonal click layer — sine through dedicated reverb for satisfying weight
  if (blockPlaceSynth) {
    try {
      blockPlaceSynth.triggerAttackRelease(_pick(_PLACE_PITCHES), '32n', Tone.now());
    } catch (_e) {}
  }
}

// ── Musical events (Tone.js) ──────────────────────────────────────────────────

/** Low bass rumble during line-clear anticipation build-up. */
function playLineClearRumble() {
  if (!audioReady || !rumbleSynth) return;
  rumbleSynth.triggerAttackRelease("C1", "4n", Tone.now());
}

/** Descending melancholic phrase on game over — soft, piano-like, ~3.5 s. */
function playGameOverJingle() {
  if (!audioReady || !gameOverSynth) return;
  const now = Tone.now();
  // Descending A-minor phrase — melancholic, unhurried, like a sigh
  const notes   = ["E5", "C5", "A4", "G4", "E4", "C4"];
  const spacing = 0.45; // slower spacing for weight and sadness
  for (let i = 0; i < notes.length; i++) {
    gameOverSynth.triggerAttackRelease(notes[i], "4n", now + i * spacing);
  }
  // Soft low thud for finality — gentle, not jarring
  if (rumbleSynth) {
    rumbleSynth.triggerAttackRelease("A1", "4n", now + notes.length * spacing + 0.2);
  }
}

/**
 * Line clear: Minecraft anvil strike + glass break shatter.
 * Anvil hit scales with number of lines; glass break layered on top.
 * @param {number} numLines  1–4 lines cleared
 */
function playLineClearSound(numLines) {
  if (!audioReady) return;
  const now = Tone.now();
  // Anvil strike — metallic clang, pitch lower for more lines (heavier hit)
  if (anvilSynth) {
    const anvilPitch = numLines >= 4 ? 'A1' : numLines === 3 ? 'C2' : numLines === 2 ? 'E2' : 'G2';
    const anvilVol = -5 - (4 - numLines) * 2; // louder for more lines
    anvilSynth.volume.value = anvilVol;
    try { anvilSynth.triggerAttackRelease(anvilPitch, '8n', now); } catch (_e) {}
    // Secondary metallic overtone
    if (numLines >= 2) {
      anvilSynth.volume.value = anvilVol - 6;
      try { anvilSynth.triggerAttackRelease(anvilPitch === 'A1' ? 'A2' : 'E3', '16n', now + 0.06); } catch (_e) {}
    }
    anvilSynth.volume.value = anvilVol; // restore
  }
  // Glass break — noise burst, louder for more lines
  if (glassBreakSynth) {
    const glassVol = -14 + numLines * 2;
    glassBreakSynth.volume.value = Math.min(glassVol, -6);
    try { glassBreakSynth.triggerAttackRelease('32n', now + 0.08); } catch (_e) {}
    // For Tetris (4 lines): second shard burst
    if (numLines >= 4) {
      try { glassBreakSynth.triggerAttackRelease('32n', now + 0.18); } catch (_e) {}
    }
  }
  // Melodic sting for 1-2 line clears — brief ascending note pair/triplet
  if (clearSynth && numLines <= 2) {
    if (numLines === 1) {
      try { clearSynth.triggerAttackRelease('E4', '16n', now + 0.05, 0.30); } catch (_e) {}
      try { clearSynth.triggerAttackRelease('G4', '16n', now + 0.16, 0.22); } catch (_e) {}
    } else { // 2 lines
      try { clearSynth.triggerAttackRelease('E4', '16n', now + 0.05, 0.35); } catch (_e) {}
      try { clearSynth.triggerAttackRelease('G4', '16n', now + 0.14, 0.30); } catch (_e) {}
      try { clearSynth.triggerAttackRelease('A4', '16n', now + 0.23, 0.25); } catch (_e) {}
    }
  }
  // Subtle rising tone layer for 3-4 line clears (satisfying sweep)
  if (clearSynth && numLines >= 3) {
    const sweepNotes = numLines >= 4
      ? ['A3', 'C4', 'E4', 'A4', 'C5', 'E5']
      : ['A3', 'C4', 'E4', 'A4'];
    sweepNotes.forEach((note, i) => {
      try { clearSynth.triggerAttackRelease(note, '16n', now + 0.1 + i * 0.06); } catch (_e) {}
    });
  }
}

// ── Tetris celebration fanfare ────────────────────────────────────────────────

/**
 * Short triumphant arpeggio played on a 4-line (Tetris) clear.
 * Layered on top of the standard anvil+glass hit sound — fires slightly delayed
 * so it cuts through as the explosion visual peaks.
 */
function playTetrisCelebration() {
  if (!audioReady || !clearSynth) return;
  const now = Tone.now() + 0.12;  // slight delay so it doesn't clash with the hit
  // Ascending C-major triad cascade — bright, triumphant
  const notes = ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6'];
  for (let i = 0; i < notes.length; i++) {
    const isLast = i === notes.length - 1;
    const vel = Math.min(0.55 + i * 0.06, 1.0);
    try { clearSynth.triggerAttackRelease(notes[i], isLast ? '8n' : '16n', now + i * 0.08, vel); } catch (_e) {}
  }
  // Bass punch on the final note for weight
  if (rumbleSynth) {
    try { rumbleSynth.triggerAttackRelease('C2', '8n', now + (notes.length - 1) * 0.08 + 0.05); } catch (_e) {}
  }
}

// ── Piece Storm sounds ────────────────────────────────────────────────────────

/** Deep ominous rumble played when Piece Storm begins. */
function playStormRumble() {
  if (!audioReady || !rumbleSynth) return;
  const now = Tone.now();
  rumbleSynth.triggerAttackRelease("A1", "4n", now);
  rumbleSynth.triggerAttackRelease("C1", "4n", now + 0.35);
  rumbleSynth.triggerAttackRelease("E1", "4n", now + 0.7);
}

/** Short sawtooth swoosh played on each piece spawn during Piece Storm. */
function playStormSwoosh() {
  if (!audioReady || !stormSwooshSynth) return;
  stormSwooshSynth.triggerAttackRelease("E4", "32n", Tone.now());
}

// ── The Core (Floor 7 Boss) sounds ────────────────────────────────────────────

/** Deep menacing rumble when The Core activates — lower and more intense than storm. */
function playCoreRumble() {
  if (!audioReady || !rumbleSynth) return;
  const now = Tone.now();
  rumbleSynth.triggerAttackRelease("E1", "2n", now);
  rumbleSynth.triggerAttackRelease("A0", "2n", now + 0.4);
  rumbleSynth.triggerAttackRelease("D1", "2n", now + 0.8);
  rumbleSynth.triggerAttackRelease("A0", "4n", now + 1.3);
}

/** Victory fanfare when The Core is defeated — ascending triumphant notes. */
function playCoreVictoryFanfare() {
  if (!audioReady || !clearSynth) return;
  const now = Tone.now();
  var fanfare = ["C4", "E4", "G4", "C5", "E5", "G5", "C6"];
  for (var i = 0; i < fanfare.length; i++) {
    clearSynth.triggerAttackRelease(fanfare[i], "8n", now + i * 0.12);
  }
}

/** Triumphant victory fanfare for multiplayer / vs-AI wins — ascending G major with resolve. */
function playVictoryFanfare() {
  if (!audioReady || !clearSynth) return;
  const now = Tone.now();
  // Ascending G major arpeggio, crescendo to final held note
  const notes = ['G4', 'B4', 'D5', 'G5', 'B5', 'D6', 'G6'];
  for (let i = 0; i < notes.length; i++) {
    const dur = i === notes.length - 1 ? '4n' : '16n';
    const vel = Math.min(0.65 + i * 0.05, 1.0);
    try { clearSynth.triggerAttackRelease(notes[i], dur, now + i * 0.13, vel); } catch (_e) {}
  }
  // Warm bass resolution thud
  if (rumbleSynth) {
    try { rumbleSynth.triggerAttackRelease('G2', '2n', now + notes.length * 0.13 + 0.05); } catch (_e) {}
  }
}

// ── Golden Hour sounds ────────────────────────────────────────────────────────

/** Ascending angelic chime arpeggio played when Golden Hour begins. */
function playGoldenHourChime() {
  if (!audioReady || !goldenChimeSynth) return;
  const now = Tone.now();
  const notes = ["C5", "E5", "G5", "B5", "C6"];
  notes.forEach((note, i) => {
    goldenChimeSynth.triggerAttackRelease(note, "8n", now + i * 0.12);
  });
}

/** Triumphant fanfare played when Golden Hour ends. */
function playGoldenHourFanfare() {
  if (!audioReady || !goldenFanfareSynth) return;
  const now = Tone.now();
  const notes = ["G4", "C5", "E5", "G5", "C6"];
  notes.forEach((note, i) => {
    goldenFanfareSynth.triggerAttackRelease(note, "4n", now + i * 0.18);
  });
}

// ── Earthquake sounds ─────────────────────────────────────────────────────────

/** Deep seismic rumble sequence played when Earthquake begins. */
function playEarthquakeRumble() {
  if (!audioReady || !rumbleSynth) return;
  const now = Tone.now();
  rumbleSynth.triggerAttackRelease("D1", "4n", now);
  rumbleSynth.triggerAttackRelease("G1", "4n", now + 0.5);
  rumbleSynth.triggerAttackRelease("B1", "4n", now + 1.0);
}

/** Short crumbling stone pulse played during Earthquake shake bursts. */
function playEarthquakeCrumble() {
  if (!audioReady || !rumbleSynth) return;
  rumbleSynth.triggerAttackRelease("E1", "16n", Tone.now());
}

// ── Event stingers ─────────────────────────────────────────────────────────

/**
 * Level up: Minecraft XP orb collect sound — a rapid ascending burst of
 * bubbly sine pings that mimics the distinctive XP pickup chime cascade.
 */
function playLevelUpStinger() {
  if (!audioReady || !levelUpSynth) return;
  const now = Tone.now();
  // XP orbs: rapid-fire ascending pentatonic notes, staggered like orbs collecting
  const xpNotes = ['E5','G5','A5','C6','E6','G6','A6','C7'];
  xpNotes.forEach((note, i) => {
    const t = now + i * 0.055;
    const vel = 0.5 + i * 0.05;
    try { levelUpSynth.triggerAttackRelease(note, '32n', t, Math.min(vel, 0.9)); } catch (_e) {}
  });
}

/** Gentle awe chord on biome discovery — open voicing, sustained wash. */
function playBiomeDiscoveryStinger() {
  if (!audioReady || !biomeDiscoverSynth) return;
  const now = Tone.now();
  // Open fifth chord that swells in — wonder and discovery
  try {
    biomeDiscoverSynth.triggerAttackRelease(['E4', 'B4', 'E5'], '2n', now, 0.35);
  } catch (_e) {}
  // Second chord a moment later for movement
  try {
    biomeDiscoverSynth.triggerAttackRelease(['A4', 'C5', 'E5'], '2n', now + 0.8, 0.3);
  } catch (_e) {}
}

// ── Creeper sounds ───────────────────────────────────────────────────────────

/** Start the escalating hiss when fuse begins. Ramps volume over the fuse duration. */
function startCreeperHiss() {
  if (!audioReady || !creeperHissSynth || !_creeperHissGain) return;
  _creeperHissGain.gain.cancelScheduledValues(Tone.now());
  _creeperHissGain.gain.setValueAtTime(0.15, Tone.now());
  _creeperHissGain.gain.linearRampToValueAtTime(1.0, Tone.now() + 2.5);
  creeperHissSynth.triggerAttack(Tone.now());
}

/** Stop the hiss immediately (on defuse or explosion). */
function stopCreeperHiss() {
  if (!audioReady || !creeperHissSynth || !_creeperHissGain) return;
  creeperHissSynth.triggerRelease(Tone.now());
  _creeperHissGain.gain.cancelScheduledValues(Tone.now());
  _creeperHissGain.gain.setValueAtTime(0, Tone.now());
}

/** Deep boom + thud on creeper explosion. */
function playCreeperBoom() {
  if (!audioReady || !creeperBoomSynth) return;
  const now = Tone.now();
  creeperBoomSynth.triggerAttackRelease("C1", "4n", now);
  if (rumbleSynth) {
    rumbleSynth.triggerAttackRelease("E1", "4n", now + 0.05);
  }
}

// ── Hazard block sounds ──────────────────────────────────────────────────────

/** Short crack burst played as crumble blocks decay and on final break. */
let _lastCrumbleCrackleTime = 0;
function playCrumbleCrackle() {
  if (!audioReady || !crumbleCrackleSynth) return;
  // Throttle to avoid overlap when many crumble blocks are active
  var now = performance.now();
  if (now - _lastCrumbleCrackleTime < 120) return;
  _lastCrumbleCrackleTime = now;
  crumbleCrackleSynth.triggerAttackRelease("32n", Tone.now());
}

/** Sizzle sound played when magma deals damage to an adjacent block. */
let _lastMagmaSizzleTime = 0;
function playMagmaSizzle() {
  if (!audioReady || !magmaSizzleSynth) return;
  var now = performance.now();
  if (now - _lastMagmaSizzleTime < 200) return;
  _lastMagmaSizzleTime = now;
  magmaSizzleSynth.triggerAttackRelease("16n", Tone.now());
}

/** Low eerie hum played when a void block spawns. */
let _lastVoidHumTime = 0;
function playVoidHum() {
  if (!audioReady || !voidHumSynth) return;
  var now = performance.now();
  if (now - _lastVoidHumTime < 300) return;
  _lastVoidHumTime = now;
  voidHumSynth.triggerAttackRelease("D2", "8n", Tone.now());
}

/**
 * Crystalline dissolve sound played on Entropy block decay.
 * Plays a soft ascending two-note shimmer (similar vibe to crumble but more ethereal).
 */
let _lastEntropyDissolveTime = 0;
function playEntropyDissolve() {
  if (!audioReady || !entropyDissolveSynth) return;
  var now = performance.now();
  if (now - _lastEntropyDissolveTime < 150) return;
  _lastEntropyDissolveTime = now;
  var t = Tone.now();
  // Soft two-note rising chord — G5 + B5 for a crystal-clear dissolve
  entropyDissolveSynth.triggerAttackRelease("G5",  "4n", t);
  entropyDissolveSynth.triggerAttackRelease("B5",  "4n", t + 0.06);
}

// ── Minecraft-themed game-action SFX ─────────────────────────────────────────

/**
 * Set the stereo pan position for spatial SFX based on board X coordinate.
 * boardX: world X of the action (-WORLD_SIZE/2 to +WORLD_SIZE/2)
 * panRange: half-width to map to ±1 pan (defaults to 5 blocks)
 */
function _setSfxPan(boardX, panRange) {
  if (!sfxPanner) return;
  var range = panRange || 5;
  var pan = Math.max(-1, Math.min(1, boardX / range));
  try { sfxPanner.pan.value = pan; } catch (_e) {}
}

/**
 * Piece lateral move — softer sine click, distinct from rotation.
 * Throttled: ignores calls within 30ms to avoid DAS spam.
 */
let _lastMoveSoundTime = 0;
function playPieceMoveSound() {
  if (!audioReady || !moveSynth) return;
  var now = performance.now();
  if (now - _lastMoveSoundTime < 30) return;
  _lastMoveSoundTime = now;
  var pitches = ['A3', 'B3', 'C4'];
  try {
    moveSynth.triggerAttackRelease(_pick(pitches), '64n', Tone.now());
  } catch (_e) {}
}

/**
 * Soft drop activation tick — light high ping when soft drop starts.
 * Throttled: only fires once per soft-drop activation (100ms gate).
 */
let _lastSoftDropSoundTime = 0;
function playSoftDropSound() {
  if (!audioReady || !softDropSynth) return;
  var now = performance.now();
  if (now - _lastSoftDropSoundTime < 100) return;
  _lastSoftDropSoundTime = now;
  try {
    softDropSynth.triggerAttackRelease('C6', '64n', Tone.now(), 0.4);
  } catch (_e) {}
}

/**
 * Piece lock clunk — membrane thud when piece locks into place.
 * Lighter than hard drop; distinct from the block-placement Howler sound.
 */
function playPieceLockSound() {
  if (!audioReady || !lockClunkSynth) return;
  try {
    lockClunkSynth.triggerAttackRelease('G2', '16n', Tone.now());
  } catch (_e) {}
  // Short noise creak layer for tactile weight
  if (holdChestSynth) {
    try { holdChestSynth.triggerAttackRelease('32n', Tone.now() + 0.02); } catch (_e) {}
  }
}

/** Piece nudge/rotate click — short mechanical tick. */
function playRotateSound() {
  if (!audioReady || !rotateClickSynth) return;
  var pitches = ['C5', 'D5', 'E5'];
  try {
    rotateClickSynth.triggerAttackRelease(_pick(pitches), '64n', Tone.now());
  } catch (_e) {}
}

/**
 * Combo chimes — escalating pitched chimes that get higher and louder with combo count.
 * @param {number} n   current combo count (1 = no sound, 2+ = escalate)
 */
function playComboSound(n) {
  if (!audioReady || !comboChimeSynth || n < 2) return;
  const now = Tone.now();
  // Each combo tier adds a higher-pitched chord + higher volume
  const COMBO_CHORDS = [
    [],                              // 1 — no sound
    ['C5', 'E5'],                    // 2
    ['E5', 'G5', 'B5'],             // 3
    ['G5', 'B5', 'D6'],             // 4
    ['B5', 'D6', 'F#6', 'A6'],     // 5+
  ];
  const tier = Math.min(n - 1, 4);
  const chord = COMBO_CHORDS[tier];
  const vel = 0.4 + tier * 0.12;
  const baseVol = -10 + tier * 2;  // louder for higher combos
  comboChimeSynth.volume.value = Math.min(baseVol, -2);
  chord.forEach((note, i) => {
    try { comboChimeSynth.triggerAttackRelease(note, '8n', now + i * 0.04, vel); } catch (_e) {}
  });
}

/**
 * T-spin enchantment sound — shimmering rapid arpeggio like an enchanting table.
 */
function playTSpinSound() {
  if (!audioReady || !tspinEnchantSynth) return;
  const now = Tone.now();
  // Rapid upward shimmer: enchantment table-style arpeggio
  const notes = ['E5','G#5','B5','E6','G#6','B6','E7'];
  notes.forEach((note, i) => {
    const vel = 0.3 + i * 0.08;
    try { tspinEnchantSynth.triggerAttackRelease(note, '16n', now + i * 0.04, Math.min(vel, 0.8)); } catch (_e) {}
  });
}

/**
 * Hard drop / heavy landing impact — deep thud with spatial panning.
 * @param {number} [boardX]  piece center X for stereo placement
 * @param {number} [intensity] 0–1 scale for how hard the drop was
 */
function playHardDropSound(boardX, intensity) {
  if (!audioReady || !hardDropSynth) return;
  _setSfxPan(boardX || 0);
  var vol = -4 - (1 - (intensity || 0.8)) * 6;
  hardDropSynth.volume.value = Math.max(vol, -10);
  try { hardDropSynth.triggerAttackRelease('C1', '16n', Tone.now()); } catch (_e) {}
  // Rumble follow-through
  if (rumbleSynth) {
    try { rumbleSynth.triggerAttackRelease('E1', '32n', Tone.now() + 0.05); } catch (_e) {}
  }
}

/**
 * Hold piece / power-up activation — chest creak sound.
 */
function playHoldSound() {
  if (!audioReady || !holdChestSynth) return;
  const now = Tone.now();
  // Pink noise burst (chest creak)
  try { holdChestSynth.triggerAttackRelease('16n', now); } catch (_e) {}
  // Short metallic ping for the latch
  if (blockPlaceSynth) {
    try { blockPlaceSynth.triggerAttackRelease('G5', '32n', now + 0.05); } catch (_e) {}
  }
}

/**
 * Menu navigation click — short UI button sound.
 */
function playMenuClickSound() {
  if (!audioReady || !menuClickSynth) return;
  try { menuClickSynth.triggerAttackRelease('G5', '64n', Tone.now()); } catch (_e) {}
}

/**
 * Notification chime — soft two-note ascending sparkle played when a toast appears.
 * Volume is controlled by the SFX slider and respects the mute setting.
 */
function playNotificationChime() {
  if (!audioReady || !notifChimeSynth) return;
  const now = Tone.now();
  try {
    notifChimeSynth.triggerAttackRelease('E6', '16n', now, 0.55);
    notifChimeSynth.triggerAttackRelease('A6', '16n', now + 0.07, 0.45);
  } catch (_e) {}
}

// ── Volume settings ───────────────────────────────────────────────────────────

/**
 * Apply master / SFX / music volume settings (each 0–100).
 *   master → Tone.js Destination volume (dB) + Howler global (× sfx factor)
 *   sfx    → Howler global (× master factor)
 *   music  → ambient music gain level (relative to Tone Destination)
 */
function applyAudioSettings(master, sfx, music) {
  _volMaster = master;
  _volSfx    = sfx;
  _volMusic  = music;

  // Howler global: effective SFX = master × sfx
  if (typeof Howler !== "undefined") {
    Howler.volume((master / 100) * (sfx / 100));
  }

  // Tone.js Destination: master level in dB (affects all Tone synths)
  if (typeof Tone !== "undefined") {
    Tone.Destination.volume.value = master > 0
      ? 20 * Math.log10(master / 100)
      : -100;
  }

  // Tone.js SFX gain bus: SFX slider controls all SFX synths independently of music.
  // Respect SFX mute — if muted, keep gain at 0 regardless of slider.
  if (typeof sfxGain !== 'undefined' && sfxGain) {
    sfxGain.gain.rampTo(_sfxMuted ? 0 : sfx / 100, 0.05);
  }

  // Ambient music gain (relative within Tone, controlled by music slider)
  // Respect mute: if music is muted, keep gain at 0 regardless of slider.
  if (_amb.gain && bgMusicPlaying) {
    _amb.gain.gain.rampTo(_musicMuted ? 0 : music / 100, 0.1);
  }

  // Environmental soundscape gain (tracks music volume at 50%)
  if (_env.gain && _env.active) {
    _env.gain.gain.rampTo(music / 100 * 0.5, 0.1);
  }

  // Seasonal event audio gain (tracks music volume at 45%)
  if (typeof applyEventAudioVolume === 'function') {
    applyEventAudioVolume(music);
  }
}

// ── SFX mute toggle ────────────────────────────────────────────────────────────

var _sfxMuted = false;

/**
 * Mute or unmute all SFX (independent of the SFX volume slider).
 * When muted, sfxGain is silenced; when unmuted, restored to current slider level.
 * @param {boolean} muted
 */
function setSfxMuted(muted) {
  _sfxMuted = !!muted;
  if (typeof sfxGain === 'undefined' || !sfxGain) return;
  if (_sfxMuted) {
    sfxGain.gain.rampTo(0, 0.05);
  } else {
    sfxGain.gain.rampTo(_volSfx / 100, 0.05);
  }
}

/** Returns true if SFX is currently muted. */
function isSfxMuted() {
  return _sfxMuted;
}

/**
 * Achievement unlock fanfare — ascending arpeggio followed by a triumphant chord.
 * Uses levelUpSynth (orb-like ascent) + goldenChimeSynth (sustaining chord).
 */
function playAchievementUnlockSfx() {
  if (!audioReady) return;
  const now = Tone.now();
  // Rapid ascending phrase (XP orb style, slightly slower for weight)
  if (levelUpSynth) {
    const ascent = ['C5','E5','G5','C6','E6'];
    ascent.forEach((note, i) => {
      try { levelUpSynth.triggerAttackRelease(note, '16n', now + i * 0.07, 0.55 + i * 0.06); } catch (_e) {}
    });
  }
  // Triumphant chord bloom half a second later
  if (goldenChimeSynth) {
    const landTime = now + 0.42;
    ['C6','E6','G6'].forEach((note, i) => {
      try { goldenChimeSynth.triggerAttackRelease(note, '4n', landTime + i * 0.04, 0.45); } catch (_e) {}
    });
  }
}

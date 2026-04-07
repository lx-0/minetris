// Music jukebox — 5 procedurally generated background tracks with playlist controls.
// Requires: audio.js (masterCompressor, _amb, bgMusicPlaying, _volMusic, setMusicMuted)
// Loaded after audio.js; all variables below are global (non-module script).

// ── Constants ─────────────────────────────────────────────────────────────────

const JUKEBOX_PREFS_KEY = 'mineCtris_jukeboxPrefs';

const JUKEBOX_TRACKS = [
  { id: 'calm',    name: 'Calm',    hint: 'Menu ambient \u2014 sparse piano & pads',   bpm: 65  },
  { id: 'upbeat',  name: 'Upbeat',  hint: 'Gameplay \u2014 bouncy bass & melody',       bpm: 108 },
  { id: 'intense', name: 'Intense', hint: 'High speed \u2014 driving rhythm & bass',    bpm: 135 },
  { id: 'retro',   name: 'Retro',   hint: '8-Bit \u2014 chiptune square-wave arpeggios', bpm: 120 },
  { id: 'ambient', name: 'Ambient', hint: 'Zen mode \u2014 slow atmospheric drones',    bpm: 50  },
];

// ── State ─────────────────────────────────────────────────────────────────────

var _jbReady    = false;
var _jbTrack    = -1;     // -1 = auto (_amb system), 0–4 = manual track
var _jbShuffle  = false;
var _jbVolume   = 60;     // 0–100 (independent jukebox volume, default mirrors _volMusic)
var _jbPlaying  = false;  // true once transport has been started for jukebox

// Per-track synthesis objects.  Each entry: { gain, synths:{}, loopIds:[] }
var _jbT = [];

// Crossfade timer ID for preventing rapid double-fades
var _jbCrossfadeTimer = null;

// ── Persistence ───────────────────────────────────────────────────────────────

function _jbSavePrefs() {
  try {
    localStorage.setItem(JUKEBOX_PREFS_KEY, JSON.stringify({
      track:   _jbTrack,
      shuffle: _jbShuffle,
      volume:  _jbVolume,
    }));
  } catch (_) {}
}

function _jbLoadPrefs() {
  try {
    var raw = localStorage.getItem(JUKEBOX_PREFS_KEY);
    if (!raw) return;
    var p = JSON.parse(raw);
    if (typeof p.track   === 'number') _jbTrack   = p.track;
    if (typeof p.shuffle === 'boolean') _jbShuffle = p.shuffle;
    if (typeof p.volume  === 'number') _jbVolume  = p.volume;
  } catch (_) {}
}

// ── Track initialisation ──────────────────────────────────────────────────────

function _jbMakeGain() {
  var g = new Tone.Gain(0);
  g.connect(masterCompressor);
  return g;
}

// Track 0: Calm — sparse piano motifs over a warm pad drone.
function _jbInitTrack0() {
  var t = { gain: _jbMakeGain(), synths: {}, loopIds: [] };

  // Piano — warm triangle oscillator, medium release
  t.synths.piano = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 4,
    options: {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.06, decay: 1.0, sustain: 0.12, release: 2.0 },
    },
  }).connect(t.gain);
  t.synths.piano.volume.value = -8;

  // Pad — slow-attack sine for warmth
  t.synths.pad = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 3,
    options: {
      oscillator: { type: 'sine' },
      envelope: { attack: 2.5, decay: 1.0, sustain: 0.7, release: 3.5 },
    },
  }).connect(t.gain);
  t.synths.pad.volume.value = -18;

  // Bass drone — very quiet
  t.synths.bass = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 1.2, decay: 0.5, sustain: 0.8, release: 3.0 },
  }).connect(t.gain);
  t.synths.bass.volume.value = -22;

  var _calmScale = ['C4','D4','E4','G4','A4','C5','D5','E5'];
  var _calmPadChords = [['C3','E3','G3'],['F3','A3','C4'],['G3','B3','D4']];
  var _calmChordIdx = 0;
  var _calmPadPhase = 0;

  // Piano motif — a sparse note every 2–4 beats
  var pianoId = Tone.Transport.scheduleRepeat(function(time) {
    var note = _calmScale[Math.floor(Math.random() * _calmScale.length)];
    var vel  = 0.2 + Math.random() * 0.3;
    if (t.synths.piano) {
      try { t.synths.piano.triggerAttackRelease(note, '2n', time, vel); } catch (_) {}
    }
    // Occasionally add a second note
    if (Math.random() < 0.35) {
      var note2 = _calmScale[Math.floor(Math.random() * _calmScale.length)];
      var offset = 0.4 + Math.random() * 0.8;
      if (t.synths.piano) {
        try { t.synths.piano.triggerAttackRelease(note2, '4n', time + offset, vel * 0.8); } catch (_) {}
      }
    }
  }, '2n');
  t.loopIds.push(pianoId);

  // Pad chord — change every 4 bars
  var padId = Tone.Transport.scheduleRepeat(function(time) {
    if (_calmPadPhase % 4 === 0) {
      _calmChordIdx = (_calmChordIdx + 1) % _calmPadChords.length;
    }
    _calmPadPhase++;
    var chord = _calmPadChords[_calmChordIdx];
    if (t.synths.pad) {
      try { t.synths.pad.triggerAttackRelease(chord, '2n', time, 0.4); } catch (_) {}
    }
  }, '1m');
  t.loopIds.push(padId);

  // Bass — slow pulse every 2 bars
  var bassId = Tone.Transport.scheduleRepeat(function(time) {
    if (t.synths.bass) {
      try { t.synths.bass.triggerAttackRelease('C2', '1m', time, 0.5); } catch (_) {}
    }
  }, '2m');
  t.loopIds.push(bassId);

  _jbT[0] = t;
}

// Track 1: Upbeat — bouncy bass + bright melody in C major.
function _jbInitTrack1() {
  var t = { gain: _jbMakeGain(), synths: {}, loopIds: [] };

  // Bass — warm saw
  t.synths.bass = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.01, decay: 0.18, sustain: 0.4, release: 0.25 },
  }).connect(t.gain);
  t.synths.bass.volume.value = -12;

  // Melody — brighter triangle
  t.synths.melody = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.3, release: 0.4 },
  }).connect(t.gain);
  t.synths.melody.volume.value = -10;

  // Harmony pad — warm chords
  t.synths.pad = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 3,
    options: {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.5, decay: 0.5, sustain: 0.5, release: 1.5 },
    },
  }).connect(t.gain);
  t.synths.pad.volume.value = -20;

  var _ubBass    = ['C2','C2','G2','G2','A2','A2','F2','F2'];
  var _ubMelody  = ['E4','G4','A4','G4','E4','C4','D4','E4',
                    'F4','E4','D4','C4','E4','G4','A4','C5'];
  var _ubChords  = [['C3','E3','G3'],['G2','B2','D3'],['A2','C3','E3'],['F2','A2','C3']];
  var _ubBassIdx = 0, _ubMelIdx = 0, _ubChordIdx = 0;

  var bassId = Tone.Transport.scheduleRepeat(function(time) {
    var note = _ubBass[_ubBassIdx % _ubBass.length];
    _ubBassIdx++;
    if (t.synths.bass) {
      try { t.synths.bass.triggerAttackRelease(note, '4n', time, 0.7); } catch (_) {}
    }
  }, '4n');
  t.loopIds.push(bassId);

  var melId = Tone.Transport.scheduleRepeat(function(time) {
    var note = _ubMelody[_ubMelIdx % _ubMelody.length];
    _ubMelIdx++;
    // Add occasional grace note
    if (Math.random() < 0.15) {
      _ubMelIdx = (_ubMelIdx + 1) % _ubMelody.length;
    }
    if (t.synths.melody) {
      try { t.synths.melody.triggerAttackRelease(note, '8n', time, 0.55 + Math.random() * 0.15); } catch (_) {}
    }
  }, '8n');
  t.loopIds.push(melId);

  var padId = Tone.Transport.scheduleRepeat(function(time) {
    var chord = _ubChords[_ubChordIdx % _ubChords.length];
    _ubChordIdx++;
    if (t.synths.pad) {
      try { t.synths.pad.triggerAttackRelease(chord, '1m', time, 0.35); } catch (_) {}
    }
  }, '1m');
  t.loopIds.push(padId);

  _jbT[1] = t;
}

// Track 2: Intense — driving bass riff + arpeggiated lead in F minor.
function _jbInitTrack2() {
  var t = { gain: _jbMakeGain(), synths: {}, loopIds: [] };

  // Bass — deep sawtooth
  t.synths.bass = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.005, decay: 0.12, sustain: 0.5, release: 0.15 },
  }).connect(t.gain);
  t.synths.bass.volume.value = -6;

  // Lead arpeggio — bright pulse-like tone
  t.synths.lead = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.15 },
  }).connect(t.gain);
  t.synths.lead.volume.value = -12;

  // Kick-like impact (membraneSynth)
  t.synths.kick = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 5,
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
  }).connect(t.gain);
  t.synths.kick.volume.value = -10;

  var _inBass  = ['F1','F1','C2','F1','Ab1','Bb1','C2','C2'];
  var _inArp   = ['F3','Ab3','C4','Eb4','F4','Eb4','C4','Ab3',
                  'F3','G3','Ab3','Bb3','C4','Bb3','Ab3','G3'];
  var _inBIdx  = 0, _inAIdx = 0, _inKick = 0;

  var bassId = Tone.Transport.scheduleRepeat(function(time) {
    var note = _inBass[_inBIdx % _inBass.length];
    _inBIdx++;
    if (t.synths.bass) {
      try { t.synths.bass.triggerAttackRelease(note, '8n', time, 0.8); } catch (_) {}
    }
  }, '8n');
  t.loopIds.push(bassId);

  var leadId = Tone.Transport.scheduleRepeat(function(time) {
    var note = _inArp[_inAIdx % _inArp.length];
    _inAIdx++;
    if (t.synths.lead) {
      try { t.synths.lead.triggerAttackRelease(note, '16n', time, 0.6); } catch (_) {}
    }
  }, '16n');
  t.loopIds.push(leadId);

  var kickId = Tone.Transport.scheduleRepeat(function(time) {
    var beat = _inKick % 8;
    _inKick++;
    // Kick on beats 1 and 5 (quarter-note downbeats)
    if (beat === 0 || beat === 4) {
      if (t.synths.kick) {
        try { t.synths.kick.triggerAttackRelease('C1', '8n', time, 1.0); } catch (_) {}
      }
    }
  }, '8n');
  t.loopIds.push(kickId);

  _jbT[2] = t;
}

// Track 3: Retro — 8-bit chiptune square-wave arpeggios.
function _jbInitTrack3() {
  var t = { gain: _jbMakeGain(), synths: {}, loopIds: [] };

  // Chiptune arpeggio — square wave, classic game feel
  t.synths.arp = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.005, decay: 0.08, sustain: 0.5, release: 0.08 },
  }).connect(t.gain);
  t.synths.arp.volume.value = -14;

  // Bass — square wave, lower register
  t.synths.bass = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0.6, release: 0.1 },
  }).connect(t.gain);
  t.synths.bass.volume.value = -10;

  // Hi-hat-like noise pulse
  t.synths.hat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0.0, release: 0.02 },
  }).connect(t.gain);
  t.synths.hat.volume.value = -22;

  // Classic I–V–vi–IV chord arpeggios in C major (chiptune style)
  var _rtChords = [
    ['C4','E4','G4','C5'],   // I
    ['G3','B3','D4','G4'],   // V
    ['A3','C4','E4','A4'],   // vi
    ['F3','A3','C4','F4'],   // IV
  ];
  var _rtBassNotes = ['C2','G2','A2','F2'];
  var _rtChordIdx = 0, _rtArpPos = 0, _rtBassPhase = 0, _rtHatPhase = 0;
  var _rtBarCount = 0;

  var arpId = Tone.Transport.scheduleRepeat(function(time) {
    var chord = _rtChords[_rtChordIdx % _rtChords.length];
    var note  = chord[_rtArpPos % chord.length];
    _rtArpPos++;
    // Change chord every 4 notes (one beat at 16th subdivisions)
    if (_rtArpPos % 4 === 0) {
      _rtChordIdx = (_rtChordIdx + 1) % _rtChords.length;
    }
    if (t.synths.arp) {
      try { t.synths.arp.triggerAttackRelease(note, '16n', time, 0.7); } catch (_) {}
    }
  }, '16n');
  t.loopIds.push(arpId);

  var bassId = Tone.Transport.scheduleRepeat(function(time) {
    var note = _rtBassNotes[_rtBassPhase % _rtBassNotes.length];
    _rtBassPhase++;
    if (t.synths.bass) {
      try { t.synths.bass.triggerAttackRelease(note, '4n', time, 0.9); } catch (_) {}
    }
  }, '4n');
  t.loopIds.push(bassId);

  var hatId = Tone.Transport.scheduleRepeat(function(time) {
    var beat = _rtHatPhase % 2;
    _rtHatPhase++;
    if (beat === 1 && t.synths.hat) {
      try { t.synths.hat.triggerAttackRelease('8n', time); } catch (_) {}
    }
  }, '8n');
  t.loopIds.push(hatId);

  _jbT[3] = t;
}

// Track 4: Ambient — slow atmospheric drones, meditative and warm.
function _jbInitTrack4() {
  var t = { gain: _jbMakeGain(), synths: {}, loopIds: [] };

  // Drone 1 — fundamental C2, very slow
  t.synths.drone1 = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 3.0, decay: 1.0, sustain: 1.0, release: 5.0 },
  }).connect(t.gain);
  t.synths.drone1.volume.value = -16;

  // Drone 2 — perfect fifth G2
  t.synths.drone2 = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 4.0, decay: 1.5, sustain: 0.8, release: 5.0 },
  }).connect(t.gain);
  t.synths.drone2.volume.value = -20;

  // Pad — slow chord swells
  t.synths.pad = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 4,
    options: {
      oscillator: { type: 'sine' },
      envelope: { attack: 3.5, decay: 2.0, sustain: 0.6, release: 6.0 },
    },
  }).connect(t.gain);
  t.synths.pad.volume.value = -14;

  // Occasional high chime
  t.synths.chime = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 1.5, sustain: 0.05, release: 3.0 },
  }).connect(t.gain);
  t.synths.chime.volume.value = -18;

  var _amPadChords = [
    ['C3','E3','G3','B3'],
    ['A2','C3','E3','G3'],
    ['F2','A2','C3','E3'],
    ['G2','B2','D3','F3'],
  ];
  var _amChordIdx   = 0;
  var _amChimeNotes = ['C5','E5','G5','B5','D6'];
  var _amChimeTimer = 0;

  // Drone loop — sustain C and G continuously
  var droneId = Tone.Transport.scheduleRepeat(function(time) {
    if (t.synths.drone1) {
      try { t.synths.drone1.triggerAttackRelease('C2', '2m', time, 0.6); } catch (_) {}
    }
    if (t.synths.drone2) {
      try { t.synths.drone2.triggerAttackRelease('G2', '2m', time, 0.4); } catch (_) {}
    }
  }, '2m');
  t.loopIds.push(droneId);

  // Pad chord swell every 4 bars
  var padId = Tone.Transport.scheduleRepeat(function(time) {
    var chord = _amPadChords[_amChordIdx % _amPadChords.length];
    _amChordIdx++;
    if (t.synths.pad) {
      try { t.synths.pad.triggerAttackRelease(chord, '2m', time, 0.45); } catch (_) {}
    }
  }, '4m');
  t.loopIds.push(padId);

  // Sparse chime — fires only occasionally
  var chimeId = Tone.Transport.scheduleRepeat(function(time) {
    _amChimeTimer++;
    if (_amChimeTimer % 8 === 0 || (_amChimeTimer % 3 === 0 && Math.random() < 0.3)) {
      var note = _amChimeNotes[Math.floor(Math.random() * _amChimeNotes.length)];
      if (t.synths.chime) {
        try { t.synths.chime.triggerAttackRelease(note, '2n', time, 0.3 + Math.random() * 0.2); } catch (_) {}
      }
    }
  }, '2n');
  t.loopIds.push(chimeId);

  _jbT[4] = t;
}

// ── Core init ─────────────────────────────────────────────────────────────────

function initJukebox() {
  if (_jbReady) return;
  if (typeof Tone === 'undefined' || typeof masterCompressor === 'undefined') return;

  _jbReady = true;
  _jbLoadPrefs();

  _jbInitTrack0();
  _jbInitTrack1();
  _jbInitTrack2();
  _jbInitTrack3();
  _jbInitTrack4();

  // Sync HUD mute button state
  _jbSyncHudMute();

  console.log('[Jukebox] Initialized. Track:', _jbTrack, 'Shuffle:', _jbShuffle);
}

// ── Playback control ─────────────────────────────────────────────────────────

/**
 * Called by audio.js startBgMusic() so jukebox can activate if a track is selected.
 */
function jukeboxOnBgMusicStart() {
  if (!_jbReady) return;
  _jbPlaying = true;
  if (_jbTrack >= 0) {
    // Suppress _amb system — jukebox takes over
    _jbSuppressAmb(true);
    _jbSetTrackGain(_jbTrack, _jbVolume / 100, 1.5);
    _jbApplyBpm(_jbTrack, 2.0);
  }
}

/**
 * Called by audio.js stopBgMusic() so jukebox can clean up.
 */
function jukeboxOnBgMusicStop() {
  if (!_jbReady) return;
  _jbPlaying = false;
  // Fade out all jukebox tracks
  for (var i = 0; i < _jbT.length; i++) {
    if (_jbT[i] && _jbT[i].gain) {
      _jbT[i].gain.gain.rampTo(0, 2.0);
    }
  }
}

/**
 * Auto-switch track based on game speed (called from game-loop.js).
 * Only activates when in auto mode (_jbTrack === -1).
 * @param {number} speedMult  difficultyMultiplier (1.0 = normal, up to ~3.0)
 */
function jukeboxAutoSwitch(speedMult) {
  if (!_jbReady || !_jbPlaying || _jbTrack !== -1) return;
  // In auto mode, just let _amb handle it — no jukebox track intervention.
  // (The _amb system already does dynamic tempo/mood switching.)
}

// ── Track selection ───────────────────────────────────────────────────────────

/**
 * Select a jukebox track.
 * @param {number} trackIdx  -1 = auto, 0–4 = specific track
 */
function jukeboxSelectTrack(trackIdx) {
  if (!_jbReady) {
    // Lazy init — audio might not be ready yet
    if (typeof Tone !== 'undefined' && typeof masterCompressor !== 'undefined') {
      initJukebox();
    } else {
      return;
    }
  }

  var oldTrack = _jbTrack;
  _jbTrack = trackIdx;
  _jbSavePrefs();

  var FADE_OUT = 2.0;
  var FADE_IN  = 2.0;

  // Fade out the current track
  if (oldTrack >= 0 && _jbT[oldTrack]) {
    _jbSetTrackGain(oldTrack, 0, FADE_OUT);
  }

  if (trackIdx === -1) {
    // Auto mode: restore _amb system
    _jbSuppressAmb(false);
  } else {
    // Specific track: suppress _amb, fade in new track
    _jbSuppressAmb(true);

    if (_jbT[trackIdx]) {
      _jbApplyBpm(trackIdx, FADE_IN);
      if (_jbPlaying || (typeof bgMusicPlaying !== 'undefined' && bgMusicPlaying)) {
        _jbPlaying = true;
        // Ensure transport is running (may not be if music hasn't started)
        if (typeof Tone !== 'undefined') {
          if (Tone.Transport.state !== 'started') {
            Tone.Transport.start();
          }
        }
        setTimeout(function() {
          _jbSetTrackGain(trackIdx, _jbVolume / 100, FADE_IN);
        }, Math.round(oldTrack >= 0 ? FADE_OUT * 500 : 0));
      }
    }
  }

  _jbSyncSettingsPanel();
  _jbSyncHudMute();
}

/**
 * Move to the next track in order (or shuffle).
 */
function jukeboxNext() {
  var next;
  if (_jbShuffle) {
    next = Math.floor(Math.random() * JUKEBOX_TRACKS.length);
  } else {
    var cur = _jbTrack < 0 ? -1 : _jbTrack;
    next = (cur + 1) % JUKEBOX_TRACKS.length;
  }
  jukeboxSelectTrack(next);
}

/**
 * Move to the previous track.
 */
function jukeboxPrev() {
  var cur = _jbTrack < 0 ? 0 : _jbTrack;
  var prev = (cur - 1 + JUKEBOX_TRACKS.length) % JUKEBOX_TRACKS.length;
  jukeboxSelectTrack(prev);
}

/**
 * Toggle shuffle mode.
 */
function jukeboxToggleShuffle() {
  _jbShuffle = !_jbShuffle;
  _jbSavePrefs();
  _jbSyncSettingsPanel();
  return _jbShuffle;
}

/**
 * Set jukebox volume (0–100). Updates the active track's gain immediately.
 */
function jukeboxSetVolume(vol) {
  _jbVolume = Math.max(0, Math.min(100, vol));
  _jbSavePrefs();
  // Apply immediately to active track
  if (_jbTrack >= 0 && _jbT[_jbTrack] && _jbPlaying) {
    var muted = (typeof isMusicMuted === 'function' && isMusicMuted());
    _jbT[_jbTrack].gain.gain.rampTo(muted ? 0 : _jbVolume / 100, 0.1);
  }
}

/**
 * Returns current jukebox track index (-1 = auto).
 */
function jukeboxGetTrack() {
  return _jbTrack;
}

/**
 * Returns current shuffle state.
 */
function jukeboxGetShuffle() {
  return _jbShuffle;
}

/**
 * Returns current jukebox volume (0–100).
 */
function jukeboxGetVolume() {
  return _jbVolume;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Suppress or restore the _amb ambient system gain. */
function _jbSuppressAmb(suppress) {
  try {
    if (typeof _amb !== 'undefined' && _amb.gain) {
      _amb.gain.gain.rampTo(suppress ? 0 : (_jbVolume / 100), 2.0);
    }
  } catch (_) {}
}

/** Ramp a track's gain node. */
function _jbSetTrackGain(trackIdx, targetGain, time) {
  if (!_jbT[trackIdx] || !_jbT[trackIdx].gain) return;
  var muted = (typeof isMusicMuted === 'function' && isMusicMuted());
  _jbT[trackIdx].gain.gain.rampTo(muted ? 0 : targetGain, time);
}

/** Apply a track's preferred BPM to the Tone.Transport. */
function _jbApplyBpm(trackIdx, rampTime) {
  if (!JUKEBOX_TRACKS[trackIdx]) return;
  var bpm = JUKEBOX_TRACKS[trackIdx].bpm;
  if (typeof Tone !== 'undefined' && Tone.Transport) {
    Tone.Transport.bpm.rampTo(bpm, rampTime);
  }
}

// ── Mute integration ─────────────────────────────────────────────────────────

/**
 * Toggle music mute (shared with the main music-mute-toggle).
 * Updates the HUD button and syncs the settings toggle.
 */
function toggleMusicMuteJukebox() {
  var nowMuted = !(typeof isMusicMuted === 'function' && isMusicMuted());
  if (typeof setMusicMuted === 'function') setMusicMuted(nowMuted);
  // Persist via settings key
  try { localStorage.setItem('mineCtris_musicMute', String(nowMuted)); } catch (_) {}
  // Sync settings toggle
  var toggle = document.getElementById('music-mute-toggle');
  if (toggle) toggle.checked = nowMuted;
  // Apply to active jukebox track
  if (_jbTrack >= 0 && _jbT[_jbTrack] && _jbT[_jbTrack].gain) {
    _jbT[_jbTrack].gain.gain.rampTo(nowMuted ? 0 : _jbVolume / 100, 0.2);
  }
  _jbSyncHudMute();
  return nowMuted;
}

/** Sync HUD mute button icon with current mute state. */
function _jbSyncHudMute() {
  var btn = document.getElementById('hud-music-mute-btn');
  if (!btn) return;
  var muted = (typeof isMusicMuted === 'function' && isMusicMuted());
  btn.textContent = muted ? '\uD83D\uDD07' : '\uD83C\uDFB5';
  btn.title = muted ? 'Unmute music (M)' : 'Mute music (M)';
  btn.classList.toggle('muted', muted);
}

// ── Settings panel sync ───────────────────────────────────────────────────────

/** Sync all jukebox UI controls with current state. Called on openSettings(). */
function jukeboxSyncPanel() {
  _jbSyncSettingsPanel();
}

function _jbSyncSettingsPanel() {
  // Track list — highlight active
  for (var i = 0; i < JUKEBOX_TRACKS.length; i++) {
    var btn = document.getElementById('jukebox-track-btn-' + i);
    if (!btn) continue;
    btn.classList.toggle('jukebox-track-active', _jbTrack === i);
  }
  var autoBtn = document.getElementById('jukebox-track-btn-auto');
  if (autoBtn) autoBtn.classList.toggle('jukebox-track-active', _jbTrack === -1);

  // Shuffle button
  var shuffleBtn = document.getElementById('jukebox-shuffle-btn');
  if (shuffleBtn) shuffleBtn.classList.toggle('jukebox-shuffle-active', _jbShuffle);

  // Volume slider
  var volSlider = document.getElementById('jukebox-vol-slider');
  var volVal    = document.getElementById('jukebox-vol-val');
  if (volSlider) volSlider.value = _jbVolume;
  if (volVal)    volVal.textContent = _jbVolume;

  // Now-playing label
  var npLabel = document.getElementById('jukebox-now-playing');
  if (npLabel) {
    npLabel.textContent = _jbTrack === -1
      ? 'Auto (Dynamic)'
      : JUKEBOX_TRACKS[_jbTrack].name + ' \u2014 ' + JUKEBOX_TRACKS[_jbTrack].hint;
  }
}

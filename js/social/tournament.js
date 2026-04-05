// js/tournament.js — Tournament lobby: browse, register, bracket view, match entry.
// Uses localStorage for persistence (client-side simulation — no server required).

const TOURNAMENT_STORAGE_KEY      = 'mineCtris_tournaments';
const TOURNAMENT_REGISTRATIONS_KEY = 'mineCtris_tournamentRegs';
const TOURNAMENT_MAX_PLAYERS       = 8; // legacy default; new tournaments use bracketSize
const TOURNAMENT_CHAT_KEY          = 'mineCtris_tournChat';
const TOURNAMENT_CHAT_MAX          = 60;

const TournamentStatus = {
  OPEN:        'open',
  IN_PROGRESS: 'in_progress',
  COMPLETED:   'completed',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function _tMakePlayer(name, rating) {
  return { name: name, rating: rating, result: null };
}

function _tBotName() {
  var firsts = ['Notch', 'Creeper', 'Diamond', 'Obsidian', 'Lava', 'Stone',
                'Iron', 'Nether', 'Pixel', 'Block', 'RedDust', 'Cave'];
  var lasts  = ['King', 'Miner', 'Lord', 'Rider', 'Warden', 'Golem',
                'Walker', 'Slayer', 'Smith', 'Digger', 'Stoker', 'Blaster'];
  return firsts[Math.floor(Math.random() * firsts.length)] +
         lasts[Math.floor(Math.random() * lasts.length)] +
         Math.floor(Math.random() * 90 + 10);
}

// ── Unified bracket round accessor ────────────────────────────────────────────

/**
 * Returns a normalized rounds array from any bracket format.
 * Each element: { label: string, matches: Array<match> }
 */
function _tGetRounds(bracket) {
  if (!bracket) return [];
  if (bracket.rounds) return bracket.rounds;
  // Legacy format (qf/sf/final fixed for 8-player)
  var rounds = [];
  if (bracket.r16)   rounds.push({ label: 'ROUND OF 16',    matches: bracket.r16   });
  if (bracket.qf)    rounds.push({ label: 'QUARTER-FINALS', matches: bracket.qf    });
  if (bracket.sf)    rounds.push({ label: 'SEMI-FINALS',    matches: bracket.sf    });
  if (bracket.final) rounds.push({ label: 'FINAL',          matches: [bracket.final] });
  return rounds;
}

// ── Flexible single-elimination bracket builder ───────────────────────────────

/**
 * Build an empty single-elimination bracket for `size` players (4, 8, or 16).
 * Players must already be sorted by rating descending (seed 1 = index 0).
 * Returns { rounds: [...], size } where rounds is an array of { label, matches }.
 */
function _tBuildFlexBracket(players, size) {
  var roundLabels = ['FINAL', 'SEMI-FINALS', 'QUARTER-FINALS', 'ROUND OF 16'];
  var numRounds   = Math.log2(size); // 2 for 4p, 3 for 8p, 4 for 16p

  // First round: snake seeding (top vs bottom, working inward)
  var half          = size / 2;
  var firstMatches  = [];
  for (var i = 0; i < half; i++) {
    firstMatches.push({
      p1:     players[i]               || null,
      p2:     players[size - 1 - i]    || null,
      result: null,
      live:   false,
    });
  }

  // Build subsequent rounds (empty TBD slots)
  var allRounds = [firstMatches];
  for (var r = 1; r < numRounds; r++) {
    var n = allRounds[r - 1].length / 2;
    var nextMatches = [];
    for (var m = 0; m < n; m++) {
      nextMatches.push({ p1: null, p2: null, result: null, live: false });
    }
    allRounds.push(nextMatches);
  }

  // Apply labels (last round = FINAL, working backwards)
  var rounds = allRounds.map(function (matches, i) {
    var labelIdx = numRounds - 1 - i;
    return {
      label:   labelIdx < roundLabels.length ? roundLabels[labelIdx] : ('ROUND ' + (i + 1)),
      matches: matches,
    };
  });

  return { rounds: rounds, size: size };
}

// ── Seed data ─────────────────────────────────────────────────────────────────

/**
 * Build a fully-resolved 8-player single-elimination bracket.
 * Players must already be sorted by rating descending (seed 1 = index 0).
 */
function _tBuildCompletedBracket(players, modes) {
  modes = modes || ['Survival', 'Score Race', 'Survival', 'Score Race', 'Score Race', 'Survival', 'Score Race'];
  // QF: seed 1v8, 2v7, 3v6, 4v5; slight upset in match 2
  var qf = [
    { p1: players[0], p2: players[7], result: 'p1', live: false, gameMode: modes[0] },
    { p1: players[1], p2: players[6], result: 'p1', live: false, gameMode: modes[1] },
    { p1: players[2], p2: players[5], result: 'p2', live: false, gameMode: modes[2] }, // upset
    { p1: players[3], p2: players[4], result: 'p1', live: false, gameMode: modes[3] },
  ];
  // SF winners: qf0→p1=players[0], qf1→p1=players[1], qf2→p2=players[5], qf3→p1=players[3]
  var sf = [
    { p1: players[0], p2: players[1], result: 'p1', live: false, gameMode: modes[4] },
    { p1: players[5], p2: players[3], result: 'p2', live: false, gameMode: modes[5] }, // players[3] wins
  ];
  // Final: players[0] vs players[3]; players[0] wins championship
  var final = { p1: players[0], p2: players[3], result: 'p1', live: false, gameMode: modes[6] };
  return { qf: qf, sf: sf, final: final };
}

function _tSeedTournaments() {
  var now = Date.now();

  // ── In-progress bracket ──
  var ipPlayers = [];
  for (var i = 0; i < 8; i++) {
    ipPlayers.push(_tMakePlayer(_tBotName(), Math.floor(Math.random() * 500) + 1000));
  }
  ipPlayers.sort(function (a, b) { return b.rating - a.rating; });

  var qf = [
    { p1: ipPlayers[0], p2: ipPlayers[7], result: 'p1', live: false },
    { p1: ipPlayers[1], p2: ipPlayers[6], result: 'p1', live: false },
    { p1: ipPlayers[2], p2: ipPlayers[5], result: null,  live: true  },
    { p1: ipPlayers[3], p2: ipPlayers[4], result: null,  live: false },
  ];
  var sf = [
    { p1: qf[0].p1, p2: qf[1].p1, result: null, live: false },
    { p1: null,     p2: null,      result: null, live: false },
  ];
  var final = { p1: null, p2: null, result: null, live: false };

  // ── Classic Cup — completed with full bracket ──
  var ccPlayers = [];
  for (var j = 0; j < 8; j++) {
    ccPlayers.push(_tMakePlayer(_tBotName(), Math.floor(Math.random() * 400) + 1050));
  }
  ccPlayers.sort(function (a, b) { return b.rating - a.rating; });
  var ccBracket = _tBuildCompletedBracket(ccPlayers);
  var ccWinner  = ccBracket.final.p1.name;

  // ── Winter Blitz — older completed tournament ──
  var wbPlayers = [];
  for (var k = 0; k < 8; k++) {
    wbPlayers.push(_tMakePlayer(_tBotName(), Math.floor(Math.random() * 400) + 1000));
  }
  wbPlayers.sort(function (a, b) { return b.rating - a.rating; });
  var wbBracket = _tBuildCompletedBracket(wbPlayers,
    ['Score Race', 'Survival', 'Score Race', 'Survival', 'Score Race', 'Survival', 'Survival']);
  // Give the underdog (p2) the championship for variety
  wbBracket.final.result = 'p2';
  var wbWinner = wbBracket.final.p2.name;

  // ── Spring Sprint — open 4-player ──
  var sp4Players = [];
  for (var s = 0; s < 2; s++) {
    sp4Players.push(_tMakePlayer(_tBotName(), Math.floor(Math.random() * 300) + 1100));
  }

  // ── Mega Cup — open 16-player ──
  var mc16Players = [];
  for (var mc = 0; mc < 5; mc++) {
    mc16Players.push(_tMakePlayer(_tBotName(), Math.floor(Math.random() * 400) + 1050));
  }

  return [
    {
      id: 'tourn_grand',
      name: 'Grand Invitational',
      prize: { label: '\u2605 Grand', color: '#ffd700' },
      status: TournamentStatus.OPEN,
      bracketSize: 8,
      gameMode: 'Survival',
      players: [
        _tMakePlayer(_tBotName(), 1380),
        _tMakePlayer(_tBotName(), 1250),
        _tMakePlayer(_tBotName(), 1420),
      ],
      bracket: null,
      matchReady: false,
      createdAt: now - 3600000,
    },
    {
      id: 'tourn_spring4',
      name: 'Spring Sprint',
      prize: { label: '\u2665 Open', color: '#cd7f32' },
      status: TournamentStatus.OPEN,
      bracketSize: 4,
      gameMode: 'Score Race',
      players: sp4Players,
      bracket: null,
      matchReady: false,
      createdAt: now - 1800000,
    },
    {
      id: 'tourn_mega16',
      name: 'Mega Cup',
      prize: { label: '\u26a1 Pro', color: '#c0c0c0' },
      status: TournamentStatus.OPEN,
      bracketSize: 16,
      gameMode: 'Survival',
      players: mc16Players,
      bracket: null,
      matchReady: false,
      createdAt: now - 900000,
    },
    {
      id: 'tourn_elite',
      name: 'Elite Challenge',
      prize: { label: '\u26A1 Elite', color: '#c0c0c0' },
      status: TournamentStatus.IN_PROGRESS,
      bracketSize: 8,
      gameMode: 'Survival',
      players: ipPlayers,
      bracket: { qf: qf, sf: sf, final: final },
      matchReady: false,
      createdAt: now - 7200000,
    },
    {
      id: 'tourn_classic',
      name: 'Classic Cup',
      prize: { label: '\u2764 Classic', color: '#cd7f32' },
      status: TournamentStatus.COMPLETED,
      bracketSize: 8,
      gameMode: 'Survival',
      players: ccPlayers,
      bracket: ccBracket,
      winner: ccWinner,
      completedAt: now - 79200000,
      matchReady: false,
      createdAt: now - 86400000,
    },
    {
      id: 'tourn_winter',
      name: 'Winter Blitz',
      prize: { label: '\u2744 Winter', color: '#88ccff' },
      status: TournamentStatus.COMPLETED,
      bracketSize: 8,
      gameMode: 'Score Race',
      players: wbPlayers,
      bracket: wbBracket,
      winner: wbWinner,
      completedAt: now - 259200000,
      matchReady: false,
      createdAt: now - 345600000,
    },
  ];
}

// ── Storage ───────────────────────────────────────────────────────────────────

function _tLoadTournaments() {
  try {
    var raw = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function _tSaveTournaments(data) {
  try { localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
}

function _tLoadRegistrations() {
  try {
    var raw = localStorage.getItem(TOURNAMENT_REGISTRATIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

function _tSaveRegistrations(data) {
  try { localStorage.setItem(TOURNAMENT_REGISTRATIONS_KEY, JSON.stringify(data)); } catch (_) {}
}

// ── Tournament chat (client-side, localStorage) ───────────────────────────────

function _tcKey(id) { return TOURNAMENT_CHAT_KEY + '_' + id; }

function tcLoad(tournamentId) {
  try { return JSON.parse(localStorage.getItem(_tcKey(tournamentId)) || '[]'); } catch (_) { return []; }
}

function tcPost(tournamentId, text) {
  var msgs = tcLoad(tournamentId);
  var name;
  try { name = localStorage.getItem('mineCtris_displayName') || 'You'; } catch (_) { name = 'You'; }
  text = (text || '').trim().slice(0, 200);
  if (!text) return msgs;
  msgs.push({
    id:     Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    userId: name,
    text:   text,
    ts:     Date.now(),
  });
  if (msgs.length > TOURNAMENT_CHAT_MAX) msgs = msgs.slice(-TOURNAMENT_CHAT_MAX);
  try { localStorage.setItem(_tcKey(tournamentId), JSON.stringify(msgs)); } catch (_) {}
  return msgs;
}

/**
 * Seed initial bot messages when chat is empty, so the chat feels alive.
 */
function tcSeedBotMessages(tournamentId) {
  if (tcLoad(tournamentId).length > 0) return;
  var bots  = [_tBotName(), _tBotName(), _tBotName()];
  var lines = [
    'gl hf everyone!',
    'This bracket looks tough',
    'Let\'s go!',
    'May the best miner win!',
    'Who\'s the favorite here?',
    'Ready to mine some Ws',
  ];
  var now  = Date.now() - 240000;
  var msgs = bots.map(function (b, i) {
    return { id: (now + i * 40000).toString(36), userId: b, text: lines[i % lines.length], ts: now + i * 40000 };
  });
  try { localStorage.setItem(_tcKey(tournamentId), JSON.stringify(msgs)); } catch (_) {}
}

// ── Submit tournament win to leaderboard ──────────────────────────────────────

function _tSubmitWin(tournament) {
  try {
    var myName;
    try { myName = localStorage.getItem('mineCtris_displayName') || ''; } catch (_) { myName = ''; }
    if (!myName || myName === 'You') return;
    fetch('https://minectris-leaderboard.workers.dev/api/tournament/wins', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName:    myName,
        tournamentId:   tournament.id,
        tournamentName: tournament.name,
        bracketSize:    tournament.bracketSize || 8,
        gameMode:       tournament.gameMode || 'Survival',
        wonAt:          Date.now(),
      }),
    }).catch(function () {}); // silent — endpoint may not exist yet
  } catch (_) {}
}

// ── Module ────────────────────────────────────────────────────────────────────

var tournamentLobby = (function () {
  var _tournaments     = null;
  var _registrations   = null; // { tournamentId: { playerName, rating, seedPos } }
  var _countdownTimer  = null;
  var _countdownSecs   = 0;
  var _onCountdownEnd  = null;

  // ── Init ──

  function _ensure() {
    if (!_tournaments) {
      _tournaments = _tLoadTournaments();
      if (!_tournaments) {
        _tournaments = _tSeedTournaments();
        _tSaveTournaments(_tournaments);
      }
    }
    if (!_registrations) {
      _registrations = _tLoadRegistrations();
    }
  }

  // ── Accessors ──

  function getAll() {
    _ensure();
    return _tournaments.slice();
  }

  function getById(id) {
    _ensure();
    return _tournaments.find(function (t) { return t.id === id; }) || null;
  }

  function isRegistered(id) {
    _ensure();
    return !!_registrations[id];
  }

  function getRegistration(id) {
    _ensure();
    return _registrations[id] || null;
  }

  // ── Helpers ──

  function _getMyName() {
    try { return localStorage.getItem('mineCtris_displayName') || 'You'; } catch (_) { return 'You'; }
  }

  function _getMyRating() {
    if (typeof loadBattleRating === 'function') return loadBattleRating().rating;
    return 1000;
  }

  // ── Auto-start when bracket is full ──────────────────────────────────────────

  function _tAutoStart(tournamentId) {
    var t = getById(tournamentId);
    if (!t || t.status !== TournamentStatus.OPEN) return;
    var size = t.bracketSize || TOURNAMENT_MAX_PLAYERS;
    if (t.players.length < size) return;

    // Sort by rating, build bracket
    var sorted  = t.players.slice().sort(function (a, b) { return b.rating - a.rating; });
    t.bracket   = _tBuildFlexBracket(sorted, size);
    t.status    = TournamentStatus.IN_PROGRESS;
    t.startedAt = Date.now();

    // Mark the player's first-round match as live
    var myName = _getMyName();
    if (_registrations[tournamentId]) {
      var rounds = _tGetRounds(t.bracket);
      if (rounds.length > 0) {
        rounds[0].matches.forEach(function (match) {
          if (!match) return;
          var inMatch = (match.p1 && match.p1.name === myName) ||
                        (match.p2 && match.p2.name === myName);
          if (inMatch) { match.live = true; t.matchReady = true; }
        });
      }
    }

    // Seed chat with opening bot messages
    tcSeedBotMessages(tournamentId);
    _tSaveTournaments(_tournaments);
  }

  // ── Registration ──

  function register(tournamentId) {
    _ensure();
    var t    = getById(tournamentId);
    var size = (t && t.bracketSize) || TOURNAMENT_MAX_PLAYERS;
    if (!t)                                return { ok: false, reason: 'not_found' };
    if (t.status !== TournamentStatus.OPEN) return { ok: false, reason: 'not_open' };
    if (t.players.length >= size)           return { ok: false, reason: 'full' };
    if (_registrations[tournamentId])       return { ok: false, reason: 'already_registered' };

    var myName   = _getMyName();
    var myRating = _getMyRating();
    t.players.push(_tMakePlayer(myName, myRating));

    // Estimate seed position by rating rank
    var sorted  = t.players.slice().sort(function (a, b) { return b.rating - a.rating; });
    var seedPos = sorted.findIndex(function (p) { return p.name === myName; }) + 1;

    _registrations[tournamentId] = { playerName: myName, rating: myRating, seedPos: seedPos };
    _tSaveTournaments(_tournaments);
    _tSaveRegistrations(_registrations);
    if (typeof recordSeasonTournamentEntered === 'function') recordSeasonTournamentEntered();
    if (typeof onSeasonMissionTournamentEntered === 'function') onSeasonMissionTournamentEntered();

    // Auto-start if bracket is now full
    _tAutoStart(tournamentId);

    return { ok: true, seedPos: seedPos, rating: myRating, count: t.players.length };
  }

  // ── Create tournament ─────────────────────────────────────────────────────────

  function createTournament(name, bracketSize, gameMode) {
    _ensure();
    var validSizes = [4, 8, 16];
    name = (name || '').trim().slice(0, 32);
    if (!name)                            return { ok: false, reason: 'invalid_name' };
    if (validSizes.indexOf(bracketSize) === -1) return { ok: false, reason: 'invalid_size' };

    var prizeBySize  = { 4: { label: '\u2665 Open',  color: '#cd7f32' },
                         8: { label: '\u26a1 Pro',   color: '#c0c0c0' },
                        16: { label: '\u2605 Grand', color: '#ffd700' } };

    var id = 'tourn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var t  = {
      id:          id,
      name:        name,
      prize:       prizeBySize[bracketSize] || prizeBySize[8],
      status:      TournamentStatus.OPEN,
      bracketSize: bracketSize,
      gameMode:    gameMode || 'Survival',
      players:     [],
      bracket:     null,
      matchReady:  false,
      createdBy:   _getMyName(),
      createdAt:   Date.now(),
    };

    _tournaments.unshift(t); // add to front so it appears first
    _tSaveTournaments(_tournaments);
    return { ok: true, id: id };
  }

  // ── Match result ──────────────────────────────────────────────────────────────

  /**
   * Record a match result for the player in a tournament bracket.
   * Advances winner through the bracket; marks tournament completed when Final is done.
   * If the player wins the whole tournament (Final match), applies the +50 rating bonus.
   * @param {string} tournamentId
   * @param {boolean} won  true if the player won this match
   * @returns {{ advanced: boolean, tournamentWon: boolean }}
   */
  function recordMatchResult(tournamentId, won) {
    _ensure();
    var t = getById(tournamentId);
    if (!t || t.status !== TournamentStatus.IN_PROGRESS || !t.bracket) {
      return { advanced: false, tournamentWon: false };
    }

    var myName     = _getMyName();
    var rounds     = _tGetRounds(t.bracket);
    var advanced   = false;
    var tournamentWon = false;

    for (var ri = 0; ri < rounds.length; ri++) {
      var round = rounds[ri].matches;
      for (var mi = 0; mi < round.length; mi++) {
        var match = round[mi];
        if (!match || match.result) continue; // already resolved
        var isP1 = match.p1 && match.p1.name === myName;
        var isP2 = match.p2 && match.p2.name === myName;
        if (!isP1 && !isP2) continue;

        // Record result
        match.result = won ? (isP1 ? 'p1' : 'p2') : (isP1 ? 'p2' : 'p1');
        match.live   = false;
        advanced     = true;

        // Determine winner object
        var winner = won ? (isP1 ? match.p1 : match.p2) : (isP1 ? match.p2 : match.p1);

        // Is this the Final match?
        if (ri === rounds.length - 1) {
          t.status      = TournamentStatus.COMPLETED;
          t.winner      = winner ? winner.name : null;
          t.completedAt = Date.now();
          if (won) {
            tournamentWon = true;
            if (typeof applyTournamentWinBonus === 'function') applyTournamentWinBonus();
            _tSubmitWin(t);
          }
        } else {
          // Advance winner to next round slot
          var nextRound    = rounds[ri + 1].matches;
          var nextSlotIdx  = Math.floor(mi / 2);
          if (nextRound && nextRound[nextSlotIdx]) {
            var nextMatch = nextRound[nextSlotIdx];
            if (mi % 2 === 0) { nextMatch.p1 = winner; }
            else               { nextMatch.p2 = winner; }
            // Mark as live if player advanced
            if (won) { nextMatch.live = true; t.matchReady = true; }
          }
          // If player won the semi-final, they've reached the Final
          if (won && ri === rounds.length - 2) {
            if (typeof achOnTournamentFinalReached === 'function') achOnTournamentFinalReached();
          }
        }
        break;
      }
      if (advanced) break;
    }

    _tSaveTournaments(_tournaments);

    // Fire tournament achievements
    if (advanced && won) {
      // Count how many matches this player has won in this tournament
      var winsInTournament = 0;
      var allRounds = _tGetRounds(t.bracket);
      allRounds.forEach(function (round) {
        round.matches.forEach(function (match) {
          if (!match || !match.result) return;
          var isP1 = match.p1 && match.p1.name === myName;
          var isP2 = match.p2 && match.p2.name === myName;
          if ((isP1 && match.result === 'p1') || (isP2 && match.result === 'p2')) {
            winsInTournament++;
          }
        });
      });
      if (typeof achOnTournamentMatchWin === 'function') achOnTournamentMatchWin(winsInTournament);
      if (typeof onSeasonMissionTournamentMatchWon === 'function') onSeasonMissionTournamentMatchWon();
    }
    if (tournamentWon) {
      if (typeof achOnTournamentWon === 'function') achOnTournamentWon();
    }

    return { advanced: advanced, tournamentWon: tournamentWon };
  }

  // ── Registrations accessor ──

  function getRegistrations() {
    _ensure();
    return Object.assign({}, _registrations);
  }

  // ── Past tournaments ──

  /** Returns completed tournaments sorted by completedAt descending (most recent first). */
  function getPast() {
    _ensure();
    return _tournaments
      .filter(function (t) { return t.status === TournamentStatus.COMPLETED; })
      .sort(function (a, b) { return (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt); });
  }

  /**
   * Returns the current player's tournament history stats.
   * { entered, wins, bestFinish: 'Champion'|'Finalist'|null }
   */
  function getTournamentStats() {
    _ensure();
    var myName  = _getMyName();
    var entered = 0;
    var wins    = 0;
    var finalist = false;

    _tournaments.forEach(function (t) {
      if (!_registrations[t.id]) return;
      entered++;
      if (t.status !== TournamentStatus.COMPLETED) return;
      if (t.winner === myName) {
        wins++;
      } else if (t.bracket) {
        var rounds  = _tGetRounds(t.bracket);
        var lastRd  = rounds.length > 0 ? rounds[rounds.length - 1] : null;
        if (lastRd) {
          lastRd.matches.forEach(function (f) {
            if (!f) return;
            if ((f.p1 && f.p1.name === myName) || (f.p2 && f.p2.name === myName)) {
              finalist = true;
            }
          });
        }
      }
    });

    var bestFinish = wins > 0 ? 'Champion' : finalist ? 'Finalist' : null;
    return { entered: entered, wins: wins, bestFinish: bestFinish };
  }

  // ── Countdown ──

  function startCountdown(secs, onEnd) {
    stopCountdown();
    _countdownSecs  = secs;
    _onCountdownEnd = onEnd;
    _countdownTimer = setInterval(function () {
      _countdownSecs--;
      if (typeof _onCountdownTick === 'function') _onCountdownTick(_countdownSecs);
      if (_countdownSecs <= 0) {
        stopCountdown();
        if (_onCountdownEnd) _onCountdownEnd();
      }
    }, 1000);
  }

  function stopCountdown() {
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
    _countdownSecs  = 0;
    _onCountdownEnd = null;
  }

  function getCountdownSecs() { return _countdownSecs; }

  // ── Match room code (for spectator Watch buttons in bracket) ──

  /**
   * Store the battle room code for the player's current live tournament match.
   * This is called when the host creates a room for a tournament match.
   * Stores in localStorage so spectators can discover it via the bracket view.
   * @param {string} roomCode  4-character room code
   */
  function setMatchRoomCode(roomCode) {
    _ensure();
    // Find the live match involving the current player across all tournaments
    var myName  = _getMyName();
    var changed = false;
    _tournaments.forEach(function (t) {
      if (t.status !== TournamentStatus.IN_PROGRESS || !t.bracket) return;
      var rounds = _tGetRounds(t.bracket);
      rounds.forEach(function (round) {
        round.matches.forEach(function (match) {
          if (!match || match.result || !match.live) return;
          var isInMatch = (match.p1 && match.p1.name === myName) ||
                          (match.p2 && match.p2.name === myName);
          if (isInMatch) { match.roomCode = roomCode; changed = true; }
        });
      });
    });
    if (changed) _tSaveTournaments(_tournaments);
  }

  return {
    getAll:               getAll,
    getById:              getById,
    getPast:              getPast,
    getTournamentStats:   getTournamentStats,
    isRegistered:         isRegistered,
    getRegistration:      getRegistration,
    getRegistrations:     getRegistrations,
    register:             register,
    createTournament:     createTournament,
    recordMatchResult:    recordMatchResult,
    setMatchRoomCode:     setMatchRoomCode,
    startCountdown:       startCountdown,
    stopCountdown:        stopCountdown,
    getCountdownSecs:     getCountdownSecs,
    // Chat
    chatLoad:             tcLoad,
    chatPost:             tcPost,
    chatSeedBots:         tcSeedBotMessages,
  };
}());

// ── Countdown tick callback — set by UI layer ─────────────────────────────────
var _onCountdownTick = null;

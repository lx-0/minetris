// mini-game.js — Quick skill challenges shown between rounds (during reset transitions).
// Three mini-game types: Block Buster (reflex click), Key Rush (keyboard reflex),
// and Line Dash (mini Tetris placement).
//
// Public API:
//   miniGameShow(onComplete)  — Show a random mini-game. Calls onComplete() when done/skipped.
//   miniGameSkipNext()        — Set a flag to skip the next mini-game (for special transitions).

(function (global) {
  'use strict';

  var _skipNext = false;

  // ── Timing constants ──────────────────────────────────────────────────────
  var AUTO_CLOSE_MS  = 12000;   // auto-close if player ignores it
  var SKIP_DELAY_MS  = 2500;    // show SKIP button after this many ms
  var BONUS_XP_MAX   = 50;      // max XP bonus awarded

  // ── Helper: pick random item ──────────────────────────────────────────────
  function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ── XP bonus helper ───────────────────────────────────────────────────────
  function _awardBonus(xp) {
    if (xp <= 0) return;
    if (typeof awardXP === 'function') {
      try { awardXP(xp * 10, 'mini_game'); } catch (e) { /* ignore */ }
    }
    if (typeof updateStreakHUD === 'function') {
      try { updateStreakHUD(); } catch (e) { /* ignore */ }
    }
  }

  // ── Build/get overlay element ─────────────────────────────────────────────
  function _getOverlay() {
    return document.getElementById('mini-game-overlay');
  }

  function _showOverlay() {
    var el = _getOverlay();
    if (el) el.style.display = 'flex';
  }

  function _hideOverlay(onComplete) {
    var el = _getOverlay();
    if (!el) { if (onComplete) onComplete(); return; }
    el.style.opacity = '0';
    setTimeout(function () {
      el.style.display = 'none';
      el.style.opacity = '1';
      el.innerHTML = '';
      if (onComplete) onComplete();
    }, 350);
  }

  // ── SKIP button logic ─────────────────────────────────────────────────────
  function _addSkipBtn(container, onSkip) {
    var skipBtn = document.createElement('button');
    skipBtn.id = 'mg-skip-btn';
    skipBtn.textContent = 'SKIP';
    skipBtn.style.cssText = 'display:none;';
    skipBtn.addEventListener('click', onSkip);
    container.appendChild(skipBtn);
    var skipTimer = setTimeout(function () {
      skipBtn.style.display = '';
    }, SKIP_DELAY_MS);
    return function cancelSkipTimer() { clearTimeout(skipTimer); };
  }

  // ── Timer bar ─────────────────────────────────────────────────────────────
  function _makeTimerBar(container, durationMs) {
    var wrap = document.createElement('div');
    wrap.className = 'mg-timer-wrap';
    var bar = document.createElement('div');
    bar.className = 'mg-timer-bar';
    wrap.appendChild(bar);
    container.appendChild(wrap);

    var start = performance.now();
    var rafId;
    function tick() {
      var elapsed = performance.now() - start;
      var pct = Math.max(0, 1 - elapsed / durationMs);
      bar.style.width = (pct * 100) + '%';
      if (pct > 0) rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return function cancel() { cancelAnimationFrame(rafId); };
  }

  // ── Result flash ──────────────────────────────────────────────────────────
  function _flashResult(container, text, color, onDone) {
    container.innerHTML =
      '<div class="mg-result-flash" style="color:' + color + '">' + text + '</div>';
    setTimeout(onDone, 1200);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MINI-GAME 1: Block Buster — click/tap the glowing block before it moves
  // ══════════════════════════════════════════════════════════════════════════
  function _playBlockBuster(container, onComplete) {
    var ROUNDS    = 8;
    var BLOCK_MS  = 900;   // how long block stays lit
    var GRID_SIZE = 9;     // 3×3

    var hits = 0, total = 0;
    var activeIdx = -1;
    var roundTimer = null, autoTimer = null;
    var finished = false;

    // Title
    var title = document.createElement('div');
    title.className = 'mg-title';
    title.textContent = 'BLOCK BUSTER';
    container.appendChild(title);

    var sub = document.createElement('div');
    sub.className = 'mg-sub';
    sub.textContent = 'Tap the glowing block!';
    container.appendChild(sub);

    // Score
    var scoreEl = document.createElement('div');
    scoreEl.className = 'mg-score';
    scoreEl.textContent = '0 / ' + ROUNDS;
    container.appendChild(scoreEl);

    // Grid
    var grid = document.createElement('div');
    grid.className = 'mg-grid';
    var cells = [];
    for (var i = 0; i < GRID_SIZE; i++) {
      (function (idx) {
        var cell = document.createElement('div');
        cell.className = 'mg-cell';
        cell.addEventListener('click', function () { onCellClick(idx); });
        cell.addEventListener('touchstart', function (e) { e.preventDefault(); onCellClick(idx); }, { passive: false });
        cells.push(cell);
        grid.appendChild(cell);
      })(i);
    }
    container.appendChild(grid);

    var cancelTimer = _makeTimerBar(container, ROUNDS * BLOCK_MS + 1000);

    var cancelSkip = _addSkipBtn(container, finish.bind(null, true));

    autoTimer = setTimeout(finish.bind(null, true), AUTO_CLOSE_MS);

    function lightUp() {
      if (finished) return;
      // Clear previous
      cells.forEach(function (c) { c.classList.remove('mg-cell-active', 'mg-cell-miss'); });
      var idx;
      do { idx = Math.floor(Math.random() * GRID_SIZE); } while (idx === activeIdx);
      activeIdx = idx;
      cells[idx].classList.add('mg-cell-active');
      total++;
      roundTimer = setTimeout(function () {
        if (finished) return;
        cells[idx].classList.remove('mg-cell-active');
        cells[idx].classList.add('mg-cell-miss');
        if (total < ROUNDS) {
          setTimeout(lightUp, 200);
        } else {
          setTimeout(finish.bind(null, false), 400);
        }
      }, BLOCK_MS);
    }

    function onCellClick(idx) {
      if (finished || idx !== activeIdx) return;
      clearTimeout(roundTimer);
      cells[idx].classList.remove('mg-cell-active');
      cells[idx].classList.add('mg-cell-hit');
      hits++;
      scoreEl.textContent = hits + ' / ' + ROUNDS;
      if (total < ROUNDS) {
        setTimeout(lightUp, 200);
      } else {
        setTimeout(finish.bind(null, false), 400);
      }
    }

    function finish(skipped) {
      if (finished) return;
      finished = true;
      clearTimeout(roundTimer);
      clearTimeout(autoTimer);
      cancelTimer();
      cancelSkip();
      cells.forEach(function (c) { c.classList.remove('mg-cell-active'); });

      if (skipped) { onComplete(0); return; }

      var ratio = total > 0 ? hits / total : 0;
      var xp = Math.round(ratio * BONUS_XP_MAX);
      _awardBonus(xp);

      var pct = Math.round(ratio * 100);
      var msg = pct >= 80 ? 'EXCELLENT! +' + xp + ' XP'
              : pct >= 50 ? 'GOOD! +' + xp + ' XP'
              : 'KEEP PRACTICING!';
      var col = pct >= 80 ? '#00ff88' : pct >= 50 ? '#ffcc00' : '#ff6666';
      _flashResult(container, msg, col, function () { onComplete(xp); });
    }

    lightUp();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MINI-GAME 2: Key Rush — press the arrow key shown on screen
  // ══════════════════════════════════════════════════════════════════════════
  function _playKeyRush(container, onComplete) {
    var ROUNDS   = 6;
    var ROUND_MS = 1400;

    var ARROWS = [
      { key: 'ArrowLeft',  label: '←', code: 37 },
      { key: 'ArrowRight', label: '→', code: 39 },
      { key: 'ArrowUp',    label: '↑', code: 38 },
      { key: 'ArrowDown',  label: '↓', code: 40 },
    ];

    var hits = 0, total = 0;
    var currentArrow = null;
    var roundTimer = null, autoTimer = null;
    var finished = false;

    var title = document.createElement('div');
    title.className = 'mg-title';
    title.textContent = 'KEY RUSH';
    container.appendChild(title);

    var sub = document.createElement('div');
    sub.className = 'mg-sub';
    sub.textContent = 'Press the arrow key!';
    container.appendChild(sub);

    var scoreEl = document.createElement('div');
    scoreEl.className = 'mg-score';
    scoreEl.textContent = '0 / ' + ROUNDS;
    container.appendChild(scoreEl);

    var arrowEl = document.createElement('div');
    arrowEl.className = 'mg-arrow-display';
    arrowEl.textContent = '?';
    container.appendChild(arrowEl);

    var feedbackEl = document.createElement('div');
    feedbackEl.className = 'mg-feedback';
    container.appendChild(feedbackEl);

    var cancelTimer = _makeTimerBar(container, ROUNDS * ROUND_MS + 500);
    var cancelSkip = _addSkipBtn(container, finish.bind(null, true));
    autoTimer = setTimeout(finish.bind(null, true), AUTO_CLOSE_MS);

    function onKey(e) {
      if (finished || !currentArrow) return;
      var matched = e.key === currentArrow.key || e.keyCode === currentArrow.code;
      handleResponse(matched);
    }
    document.addEventListener('keydown', onKey);

    // Touch buttons for mobile
    var touchRow = document.createElement('div');
    touchRow.className = 'mg-touch-arrows';
    ARROWS.forEach(function (arrow) {
      var btn = document.createElement('button');
      btn.className = 'mg-touch-btn';
      btn.textContent = arrow.label;
      btn.dataset.key = arrow.key;
      btn.addEventListener('click', function () {
        if (finished || !currentArrow) return;
        handleResponse(arrow.key === currentArrow.key);
      });
      touchRow.appendChild(btn);
    });
    container.appendChild(touchRow);

    function handleResponse(correct) {
      if (finished || !currentArrow) return;
      clearTimeout(roundTimer);
      if (correct) {
        hits++;
        arrowEl.style.color = '#00ff88';
        feedbackEl.textContent = '✓';
        feedbackEl.style.color = '#00ff88';
      } else {
        arrowEl.style.color = '#ff4444';
        feedbackEl.textContent = '✗';
        feedbackEl.style.color = '#ff4444';
      }
      scoreEl.textContent = hits + ' / ' + ROUNDS;
      if (total < ROUNDS) {
        setTimeout(nextRound, 300);
      } else {
        setTimeout(finish.bind(null, false), 400);
      }
    }

    function nextRound() {
      if (finished) return;
      var prev = currentArrow;
      do { currentArrow = _pick(ARROWS); } while (currentArrow === prev && ARROWS.length > 1);
      total++;
      arrowEl.textContent = currentArrow.label;
      arrowEl.style.color = '';
      arrowEl.classList.add('mg-arrow-pop');
      setTimeout(function () { arrowEl.classList.remove('mg-arrow-pop'); }, 150);
      feedbackEl.textContent = '';

      roundTimer = setTimeout(function () {
        // Missed
        arrowEl.style.color = '#ff4444';
        feedbackEl.textContent = '✗';
        feedbackEl.style.color = '#ff4444';
        scoreEl.textContent = hits + ' / ' + ROUNDS;
        if (total < ROUNDS) {
          setTimeout(nextRound, 300);
        } else {
          setTimeout(finish.bind(null, false), 400);
        }
      }, ROUND_MS);
    }

    function finish(skipped) {
      if (finished) return;
      finished = true;
      clearTimeout(roundTimer);
      clearTimeout(autoTimer);
      cancelTimer();
      cancelSkip();
      document.removeEventListener('keydown', onKey);

      if (skipped) { onComplete(0); return; }

      var ratio = total > 0 ? hits / total : 0;
      var xp = Math.round(ratio * BONUS_XP_MAX);
      _awardBonus(xp);

      var pct = Math.round(ratio * 100);
      var msg = pct >= 83 ? 'PERFECT! +' + xp + ' XP'
              : pct >= 50 ? 'NICE! +' + xp + ' XP'
              : 'KEEP GOING!';
      var col = pct >= 83 ? '#00ff88' : pct >= 50 ? '#ffcc00' : '#ff6666';
      _flashResult(container, msg, col, function () { onComplete(xp); });
    }

    nextRound();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MINI-GAME 3: Line Dash — guide a block into the gap to clear the row
  // ══════════════════════════════════════════════════════════════════════════
  function _playLineDash(container, onComplete) {
    var COLS    = 7;
    var ROWS    = 5;
    var FALL_MS = 120;   // ms per step down

    var finished = false;
    var autoTimer = null;
    var fallInterval = null;

    var title = document.createElement('div');
    title.className = 'mg-title';
    title.textContent = 'LINE DASH';
    container.appendChild(title);

    var sub = document.createElement('div');
    sub.className = 'mg-sub';
    sub.textContent = '← → to fill the gap!';
    container.appendChild(sub);

    // Build a board: bottom row has one gap, rest empty
    var gapCol = Math.floor(Math.random() * COLS);
    var board = []; // board[row][col] = 'empty' | 'filled' | 'piece' | 'gap-marker'
    for (var r = 0; r < ROWS; r++) {
      board[r] = [];
      for (var c = 0; c < COLS; c++) {
        board[r][c] = 'empty';
      }
    }
    // Bottom row filled except gap
    for (var c2 = 0; c2 < COLS; c2++) {
      board[ROWS - 1][c2] = c2 === gapCol ? 'empty' : 'filled';
    }

    var pieceCol = Math.floor(Math.random() * COLS);
    var pieceRow = 0;

    // Build grid UI
    var gridEl = document.createElement('div');
    gridEl.className = 'mg-ld-grid';
    gridEl.style.gridTemplateColumns = 'repeat(' + COLS + ', 1fr)';
    var cellEls = [];
    for (var r2 = 0; r2 < ROWS; r2++) {
      cellEls[r2] = [];
      for (var c3 = 0; c3 < COLS; c3++) {
        var cell = document.createElement('div');
        cell.className = 'mg-ld-cell';
        gridEl.appendChild(cell);
        cellEls[r2][c3] = cell;
      }
    }
    container.appendChild(gridEl);

    // Gap indicator arrow
    var gapArrow = document.createElement('div');
    gapArrow.className = 'mg-gap-arrow';
    gapArrow.textContent = '▼';
    gapArrow.style.marginLeft = 'calc(' + gapCol + ' * (28px + 3px) + 7px)';
    container.appendChild(gapArrow);

    var cancelSkip = _addSkipBtn(container, finish.bind(null, 'skip'));
    autoTimer = setTimeout(finish.bind(null, 'timeout'), AUTO_CLOSE_MS);

    // Key handler
    function onKey(e) {
      if (finished) return;
      if (e.key === 'ArrowLeft' || e.keyCode === 37) { movePiece(-1); e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.keyCode === 39) { movePiece(1); e.preventDefault(); }
      if (e.key === 'ArrowDown' || e.keyCode === 40) { dropPiece(); e.preventDefault(); }
    }
    document.addEventListener('keydown', onKey);

    // Touch buttons
    var touchRow = document.createElement('div');
    touchRow.className = 'mg-touch-arrows';
    [['←', -1], ['↓', 0], ['→', 1]].forEach(function (pair) {
      var btn = document.createElement('button');
      btn.className = 'mg-touch-btn';
      btn.textContent = pair[0];
      btn.addEventListener('click', function () {
        if (pair[1] === 0) dropPiece(); else movePiece(pair[1]);
      });
      touchRow.appendChild(btn);
    });
    container.appendChild(touchRow);

    function movePiece(dir) {
      var next = pieceCol + dir;
      if (next < 0 || next >= COLS) return;
      pieceCol = next;
      renderBoard();
    }

    function dropPiece() {
      // Instantly drop to resting position
      clearInterval(fallInterval);
      while (!willCollide(pieceRow + 1)) { pieceRow++; }
      land();
    }

    function willCollide(row) {
      if (row >= ROWS) return true;
      if (board[row][pieceCol] === 'filled') return true;
      return false;
    }

    function renderBoard() {
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var el = cellEls[r][c];
          var state = board[r][c];
          var isPiece = (r === pieceRow && c === pieceCol);
          el.className = 'mg-ld-cell' +
            (isPiece ? ' mg-ld-piece' :
             state === 'filled' ? ' mg-ld-filled' : '');
        }
      }
    }

    function land() {
      board[pieceRow][pieceCol] = 'filled';
      renderBoard();
      // Check if bottom row complete
      var rowComplete = true;
      for (var c = 0; c < COLS; c++) {
        if (board[ROWS - 1][c] !== 'filled') { rowComplete = false; break; }
      }
      if (rowComplete) {
        // Flash clear
        for (var c2 = 0; c2 < COLS; c2++) {
          cellEls[ROWS - 1][c2].classList.add('mg-ld-clear');
        }
        setTimeout(function () { finish('win'); }, 600);
      } else {
        finish('lose');
      }
    }

    // Auto-fall
    fallInterval = setInterval(function () {
      if (finished) return;
      if (willCollide(pieceRow + 1)) {
        clearInterval(fallInterval);
        land();
      } else {
        pieceRow++;
        renderBoard();
      }
    }, FALL_MS);

    renderBoard();

    function finish(reason) {
      if (finished) return;
      finished = true;
      clearInterval(fallInterval);
      clearTimeout(autoTimer);
      cancelSkip();
      document.removeEventListener('keydown', onKey);

      if (reason === 'skip' || reason === 'timeout') { onComplete(0); return; }

      if (reason === 'win') {
        var xp = BONUS_XP_MAX;
        _awardBonus(xp);
        _flashResult(container, 'LINE CLEAR! +' + xp + ' XP', '#00ff88', function () { onComplete(xp); });
      } else {
        _flashResult(container, 'ALMOST! KEEP TRYING', '#ffcc00', function () { onComplete(0); });
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Public: show a random mini-game
  // ══════════════════════════════════════════════════════════════════════════
  function miniGameShow(onComplete) {
    var cb = typeof onComplete === 'function' ? onComplete : function () {};

    if (_skipNext) {
      _skipNext = false;
      cb();
      return;
    }

    var overlay = _getOverlay();
    if (!overlay) { cb(); return; }

    overlay.innerHTML = '';
    overlay.style.display = 'flex';
    overlay.style.opacity = '1';

    var container = document.createElement('div');
    container.className = 'mg-container';
    overlay.appendChild(container);

    var header = document.createElement('div');
    header.className = 'mg-header';
    header.textContent = 'MINI CHALLENGE';
    container.appendChild(header);

    var games = [_playBlockBuster, _playKeyRush, _playLineDash];
    var chosen = _pick(games);

    chosen(container, function (xpEarned) {
      _hideOverlay(cb);
    });
  }

  function miniGameSkipNext() {
    _skipNext = true;
  }

  global.miniGameShow     = miniGameShow;
  global.miniGameSkipNext = miniGameSkipNext;

}(window));

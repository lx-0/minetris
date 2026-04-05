// js/local-multi/local-multi.js
// Self-contained split-screen local 1v1 Tetris — two players on one device.
// Player 1: WASD + Space (custom via mineCtris_keyBindings).
// Player 2: Arrow keys + Enter (custom via mineCtris_keyBindings_p2).
// Garbage rows, best-of-3 rounds, fully offline.

(function () {
  'use strict';

  // ── Board constants ───────────────────────────────────────────────────────────
  const COLS = 10;
  const ROWS = 20;
  const VISIBLE_ROWS = 20;

  // ── Piece definitions (7-bag) ─────────────────────────────────────────────────
  // Each entry: { matrix: number[][], color: hex string }
  const PIECE_DEFS = [
    { matrix: [[1, 1, 1, 1]],          color: '#22d3ee' }, // I — ice cyan
    { matrix: [[1, 1], [1, 1]],        color: '#ffd700' }, // O — gold
    { matrix: [[0,1,0],[1,1,1]],       color: '#a855f7' }, // T — crystal purple
    { matrix: [[0,1,1],[1,1,0]],       color: '#4ade80' }, // S — grass green
    { matrix: [[1,1,0],[0,1,1]],       color: '#f87171' }, // Z — redstone red
    { matrix: [[1,0,0],[1,1,1]],       color: '#60a5fa' }, // J — diamond blue
    { matrix: [[0,0,1],[1,1,1]],       color: '#fb923c' }, // L — lava orange
  ];

  const GARBAGE_COLOR = '#4b5563'; // rubble gray

  // ── Scoring ───────────────────────────────────────────────────────────────────
  const SCORE_TABLE   = [0, 100, 300, 500, 800]; // lines 0-4
  const GARBAGE_TABLE = [0, 0,   1,   2,   4  ]; // garbage rows per 1-4 line clear

  // ── Timings (ms) ─────────────────────────────────────────────────────────────
  const GRAVITY_MS        = 800;   // time per natural drop step
  const LOCK_DELAY_MS     = 500;   // time before locked after piece hits floor
  const DAS_MS            = 167;   // delayed auto-shift initial delay
  const ARR_MS            = 33;    // auto-repeat rate
  const ROUND_PAUSE_MS    = 2500;  // pause between rounds
  const SOFT_DROP_FACTOR  = 0.1;   // soft drop fraction of gravity

  // ── Layout helpers ────────────────────────────────────────────────────────────
  function computeLayout(vw, vh) {
    // Each half of the screen: vw/2 wide, vh tall.
    // Board aspect: COLS wide × ROWS tall.
    const margin     = Math.max(8, Math.floor(vw * 0.02));
    const halfW      = Math.floor(vw / 2);
    const cellW      = Math.floor((halfW - margin * 3) / (COLS + 4)); // 4 extra cols for preview
    const cellH      = Math.floor((vh - margin * 4) / ROWS);
    const cellSize   = Math.max(12, Math.min(cellW, cellH));
    const boardW     = cellSize * COLS;
    const boardH     = cellSize * ROWS;
    const topY       = Math.floor((vh - boardH) / 2);
    const sidePanel  = cellSize * 4;

    // Player 1: left half
    const p1Left = Math.floor((halfW - boardW - margin - sidePanel) / 2);
    // Player 2: right half (mirrored)
    const p2Left = halfW + Math.floor((halfW - boardW - margin - sidePanel) / 2) + sidePanel + margin;

    return { cellSize, boardW, boardH, topY, margin, sidePanel, halfW, p1Left, p2Left };
  }

  // ── Matrix utilities ──────────────────────────────────────────────────────────
  function rotateCW(matrix) {
    const rows = matrix.length, cols = matrix[0].length;
    const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        result[c][rows - 1 - r] = matrix[r][c];
    return result;
  }
  function rotateCCW(matrix) {
    return rotateCW(rotateCW(rotateCW(matrix)));
  }

  // ── 7-bag randomizer ──────────────────────────────────────────────────────────
  function createBag() { return [0,1,2,3,4,5,6]; }
  function shuffleBag(bag) {
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  }

  // ── Player state factory ──────────────────────────────────────────────────────
  function createPlayerState() {
    return {
      board:        Array.from({ length: ROWS }, () => new Array(COLS).fill(null)),
      piece:        null,   // { matrix, color, x, y }
      nextQueue:    [],     // next 3 pieces { matrix, color }
      bag:          [],
      score:        0,
      lines:        0,
      level:        1,
      wins:         0,
      dead:         false,
      lockTimer:    0,
      gravityAcc:   0,
      garbageQueue: [],     // pending garbage rows to deliver
      // DAS/ARR state
      dasLeft:  0, dasRight: 0, dasDown: 0,
      arrLeft:  0, arrRight: 0,
      heldLeft: false, heldRight: false, heldDown: false,
    };
  }

  // ── Keybindings ───────────────────────────────────────────────────────────────
  const KB_DEFAULTS_P1 = {
    moveLeft: 'KeyA', moveRight: 'KeyD', moveBackward: 'KeyS',
    nudgeLeft: 'KeyQ', nudgeRight: 'KeyE', jump: 'Space',
  };
  const KB_DEFAULTS_P2 = {
    moveLeft: 'ArrowLeft', moveRight: 'ArrowRight', moveBackward: 'ArrowDown',
    nudgeLeft: 'ControlRight', nudgeRight: 'ArrowUp', jump: 'Enter',
  };

  function loadKB(storageKey, defaults) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return Object.assign({}, defaults);
      const saved = JSON.parse(raw);
      const kb = Object.assign({}, defaults);
      for (const action of Object.keys(defaults)) {
        if (typeof saved[action] === 'string' && saved[action].length > 0)
          kb[action] = saved[action];
      }
      return kb;
    } catch (_) { return Object.assign({}, defaults); }
  }

  function saveKB(storageKey, kb) {
    try { localStorage.setItem(storageKey, JSON.stringify(kb)); } catch (_) {}
  }

  // Build reverse map: code → action
  function buildRev(kb) {
    const rev = {};
    for (const [action, code] of Object.entries(kb)) rev[code] = action;
    return rev;
  }

  // ── Queue management ──────────────────────────────────────────────────────────
  function refillQueue(ps) {
    while (ps.nextQueue.length < 3) {
      if (ps.bag.length === 0) ps.bag = shuffleBag(createBag());
      const idx = ps.bag.pop();
      ps.nextQueue.push({ matrix: PIECE_DEFS[idx].matrix.map(r => r.slice()), color: PIECE_DEFS[idx].color });
    }
  }

  function spawnPiece(ps) {
    refillQueue(ps);
    const next = ps.nextQueue.shift();
    refillQueue(ps);
    const spawnX = Math.floor((COLS - next.matrix[0].length) / 2);
    const spawnY = 0;
    ps.piece = { matrix: next.matrix, color: next.color, x: spawnX, y: spawnY };
    ps.lockTimer = 0;
    ps.gravityAcc = 0;
    if (!isValidPosition(ps.board, ps.piece, 0, 0)) {
      ps.dead = true;
      ps.piece = null;
    }
  }

  // ── Collision ─────────────────────────────────────────────────────────────────
  function isValidPosition(board, piece, dx, dy) {
    const { matrix, x, y } = piece;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const nx = x + c + dx, ny = y + r + dy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
        if (ny >= 0 && board[ny][nx]) return false;
      }
    }
    return true;
  }

  // ── Ghost position ────────────────────────────────────────────────────────────
  function ghostY(ps) {
    if (!ps.piece) return 0;
    let drop = 0;
    while (isValidPosition(ps.board, ps.piece, 0, drop + 1)) drop++;
    return ps.piece.y + drop;
  }

  // ── Lock piece ────────────────────────────────────────────────────────────────
  function lockPiece(ps, otherPs) {
    if (!ps.piece) return;
    const { matrix, color, x, y } = ps.piece;
    for (let r = 0; r < matrix.length; r++)
      for (let c = 0; c < matrix[r].length; c++)
        if (matrix[r][c] && y + r >= 0)
          ps.board[y + r][x + c] = color;
    ps.piece = null;
    const linesCleared = clearLines(ps);
    if (linesCleared > 0) {
      ps.score += SCORE_TABLE[linesCleared] * ps.level;
      ps.lines += linesCleared;
      ps.level = Math.floor(ps.lines / 10) + 1;
      const garbage = GARBAGE_TABLE[linesCleared];
      if (garbage > 0) sendGarbage(otherPs, garbage);
      playClearSound(linesCleared);
    } else {
      playLockSound();
    }
    deliverGarbage(ps);
    spawnPiece(ps);
  }

  // ── Line clear ────────────────────────────────────────────────────────────────
  function clearLines(ps) {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; ) {
      if (ps.board[r].every(c => c !== null)) {
        ps.board.splice(r, 1);
        ps.board.unshift(new Array(COLS).fill(null));
        cleared++;
      } else {
        r--;
      }
    }
    return cleared;
  }

  // ── Garbage ───────────────────────────────────────────────────────────────────
  function sendGarbage(targetPs, lines) {
    targetPs.garbageQueue.push(lines);
  }

  function deliverGarbage(ps) {
    if (ps.garbageQueue.length === 0) return;
    const lines = ps.garbageQueue.shift();
    for (let i = 0; i < lines; i++) {
      const gapCol = Math.floor(Math.random() * COLS);
      const row = new Array(COLS).fill(GARBAGE_COLOR);
      row[gapCol] = null;
      ps.board.shift();            // remove top row
      ps.board.push(row);          // add garbage at bottom
    }
  }

  // ── Movement ──────────────────────────────────────────────────────────────────
  function tryMove(ps, otherPs, dx, dy) {
    if (!ps.piece || ps.dead) return false;
    if (isValidPosition(ps.board, ps.piece, dx, dy)) {
      ps.piece.x += dx;
      ps.piece.y += dy;
      if (dy < 0 || dx !== 0) ps.lockTimer = 0; // reset lock on lateral move
      return true;
    }
    return false;
  }

  function tryRotate(ps, dir) {
    if (!ps.piece || ps.dead) return;
    const rotated = dir > 0 ? rotateCW(ps.piece.matrix) : rotateCCW(ps.piece.matrix);
    const kicks = [0, 1, -1, 2, -2];
    for (const kick of kicks) {
      if (isValidPosition(ps.board, { ...ps.piece, matrix: rotated }, kick, 0)) {
        ps.piece.matrix = rotated;
        ps.piece.x += kick;
        ps.lockTimer = 0;
        return;
      }
    }
  }

  function hardDrop(ps, otherPs) {
    if (!ps.piece || ps.dead) return;
    while (isValidPosition(ps.board, ps.piece, 0, 1)) {
      ps.piece.y++;
      ps.score += 2;
    }
    lockPiece(ps, otherPs);
  }

  // ── Gravity update ────────────────────────────────────────────────────────────
  function updateGravity(ps, otherPs, dt) {
    if (!ps.piece || ps.dead) return;
    const gravMs = Math.max(100, GRAVITY_MS - (ps.level - 1) * 50);
    const dropMs = ps.heldDown ? gravMs * SOFT_DROP_FACTOR : gravMs;
    ps.gravityAcc += dt;
    while (ps.gravityAcc >= dropMs) {
      ps.gravityAcc -= dropMs;
      if (!tryMove(ps, otherPs, 0, 1)) {
        // piece hit floor — start lock timer
        break;
      } else if (ps.heldDown) {
        ps.score += 1;
      }
    }
    // Lock delay
    if (ps.piece && !isValidPosition(ps.board, ps.piece, 0, 1)) {
      ps.lockTimer += dt;
      if (ps.lockTimer >= LOCK_DELAY_MS) lockPiece(ps, otherPs);
    } else {
      ps.lockTimer = 0;
    }
  }

  // ── DAS/ARR update ────────────────────────────────────────────────────────────
  function updateDAS(ps, otherPs, dt) {
    if (ps.heldLeft) {
      if (ps.dasLeft <= 0) {
        ps.arrLeft += dt;
        while (ps.arrLeft >= ARR_MS) { tryMove(ps, otherPs, -1, 0); ps.arrLeft -= ARR_MS; }
      } else {
        ps.dasLeft -= dt;
        if (ps.dasLeft <= 0) { ps.arrLeft = ARR_MS; tryMove(ps, otherPs, -1, 0); }
      }
    }
    if (ps.heldRight) {
      if (ps.dasRight <= 0) {
        ps.arrRight += dt;
        while (ps.arrRight >= ARR_MS) { tryMove(ps, otherPs, 1, 0); ps.arrRight -= ARR_MS; }
      } else {
        ps.dasRight -= dt;
        if (ps.dasRight <= 0) { ps.arrRight = ARR_MS; tryMove(ps, otherPs, 1, 0); }
      }
    }
  }

  // ── Audio stubs (reuse main game sounds if available) ─────────────────────────
  function playClearSound(lines) {
    try {
      if (typeof playLineClearSfx === 'function') playLineClearSfx(lines);
    } catch (_) {}
  }
  function playLockSound() {
    try {
      if (typeof playPieceLandSfx === 'function') playPieceLandSfx();
    } catch (_) {}
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────
  let _canvas = null, _ctx = null;
  let _layout = null;
  let _animId = null;

  function ensureCanvas() {
    _canvas = document.getElementById('local-multi-canvas');
    if (!_canvas) return false;
    _ctx = _canvas.getContext('2d');
    return true;
  }

  function resizeCanvas() {
    if (!_canvas) return;
    _canvas.width  = window.innerWidth;
    _canvas.height = window.innerHeight;
    _layout = computeLayout(_canvas.width, _canvas.height);
  }

  function drawCell(x, y, color, alpha) {
    if (!_ctx) return;
    const c = _layout.cellSize;
    _ctx.globalAlpha = alpha !== undefined ? alpha : 1;
    // Block face
    _ctx.fillStyle = color;
    _ctx.fillRect(x + 1, y + 1, c - 2, c - 2);
    // Highlight top-left
    _ctx.fillStyle = 'rgba(255,255,255,0.25)';
    _ctx.fillRect(x + 1, y + 1, c - 2, 3);
    _ctx.fillRect(x + 1, y + 1, 3, c - 2);
    // Shadow bottom-right
    _ctx.fillStyle = 'rgba(0,0,0,0.35)';
    _ctx.fillRect(x + 1, y + c - 4, c - 2, 3);
    _ctx.fillRect(x + c - 4, y + 1, 3, c - 2);
    _ctx.globalAlpha = 1;
  }

  function drawBoard(ps, boardX, boardY) {
    const cs = _layout.cellSize;
    // Board background
    _ctx.fillStyle = '#0a0f0a';
    _ctx.fillRect(boardX, boardY, COLS * cs, ROWS * cs);
    // Grid lines
    _ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    _ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      _ctx.beginPath(); _ctx.moveTo(boardX + c * cs, boardY);
      _ctx.lineTo(boardX + c * cs, boardY + ROWS * cs); _ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      _ctx.beginPath(); _ctx.moveTo(boardX, boardY + r * cs);
      _ctx.lineTo(boardX + COLS * cs, boardY + r * cs); _ctx.stroke();
    }
    // Placed blocks
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const color = ps.board[r][c];
        if (color) drawCell(boardX + c * cs, boardY + r * cs, color);
      }
    }
    // Ghost piece
    if (ps.piece) {
      const gy = ghostY(ps);
      if (gy !== ps.piece.y) {
        const { matrix, color, x } = ps.piece;
        for (let r = 0; r < matrix.length; r++)
          for (let c = 0; c < matrix[r].length; c++)
            if (matrix[r][c])
              drawCell(boardX + (x + c) * cs, boardY + (gy + r) * cs, color, 0.22);
      }
    }
    // Active piece
    if (ps.piece) {
      const { matrix, color, x, y } = ps.piece;
      for (let r = 0; r < matrix.length; r++)
        for (let c = 0; c < matrix[r].length; c++)
          if (matrix[r][c] && y + r >= 0)
            drawCell(boardX + (x + c) * cs, boardY + (y + r) * cs, color);
    }
    // Board border
    _ctx.strokeStyle = '#22c55e';
    _ctx.lineWidth = 2;
    _ctx.strokeRect(boardX - 1, boardY - 1, COLS * cs + 2, ROWS * cs + 2);
  }

  function drawNextQueue(ps, panelX, panelY, flipped) {
    const cs = _layout.cellSize;
    const cellSmall = Math.floor(cs * 0.7);
    _ctx.fillStyle = '#4ade80';
    _ctx.font = `${Math.max(7, Math.floor(cs * 0.38))}px 'Press Start 2P', monospace`;
    _ctx.textAlign = flipped ? 'right' : 'left';
    _ctx.fillText('NEXT', flipped ? panelX + cellSmall * 4 : panelX, panelY - 6);

    ps.nextQueue.slice(0, 3).forEach(function (piece, i) {
      const previewY = panelY + i * (cellSmall * 3 + 6);
      // Mini piece preview box
      _ctx.fillStyle = '#111';
      _ctx.fillRect(flipped ? panelX : panelX, previewY, cellSmall * 4, cellSmall * 3);
      _ctx.strokeStyle = '#2d4a2d';
      _ctx.lineWidth = 1;
      _ctx.strokeRect(flipped ? panelX : panelX, previewY, cellSmall * 4, cellSmall * 3);

      const { matrix, color } = piece;
      const offX = Math.floor((4 - matrix[0].length) / 2);
      const offY = Math.floor((3 - matrix.length) / 2);
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          const px = panelX + (offX + c) * cellSmall;
          const py = previewY + (offY + r) * cellSmall;
          _ctx.globalAlpha = 1;
          _ctx.fillStyle = color;
          _ctx.fillRect(px + 1, py + 1, cellSmall - 2, cellSmall - 2);
          _ctx.fillStyle = 'rgba(255,255,255,0.2)';
          _ctx.fillRect(px + 1, py + 1, cellSmall - 2, 2);
        }
      }
    });
  }

  function drawHUD(ps, hX, hY, label) {
    const cs = _layout.cellSize;
    const fontSize = Math.max(7, Math.floor(cs * 0.38));
    _ctx.font = `${fontSize}px 'Press Start 2P', monospace`;
    _ctx.textAlign = 'left';
    _ctx.fillStyle = '#4ade80';
    _ctx.fillText(label, hX, hY);
    _ctx.fillStyle = '#fff';
    _ctx.fillText('SCR', hX, hY + fontSize * 1.8);
    _ctx.fillStyle = '#ffd700';
    _ctx.fillText(ps.score.toLocaleString(), hX, hY + fontSize * 3.2);
    _ctx.fillStyle = '#fff';
    _ctx.fillText('LVL ' + ps.level, hX, hY + fontSize * 5.0);
    _ctx.fillText('LNS ' + ps.lines, hX, hY + fontSize * 6.4);
  }

  function drawWins(p1Wins, p2Wins, vw, vh) {
    const cs = _layout.cellSize;
    const cx = Math.floor(vw / 2);
    const topY = Math.floor(vh / 2) - cs * 2;

    _ctx.textAlign = 'center';
    _ctx.font = `${Math.max(8, Math.floor(cs * 0.45))}px 'Press Start 2P', monospace`;
    _ctx.fillStyle = '#ffd700';
    _ctx.fillText('ROUND', cx, topY);

    const dotSize = Math.max(8, cs * 0.6);
    const dotGap  = dotSize + 4;
    const totalW  = 3 * dotGap;
    const dotY    = topY + dotSize + 8;

    for (let i = 0; i < 3; i++) {
      const dx = cx - totalW / 2 + i * dotGap + dotSize / 2;
      _ctx.beginPath();
      _ctx.arc(dx, dotY, dotSize / 2, 0, Math.PI * 2);
      if (i < p1Wins) {
        _ctx.fillStyle = '#22d3ee';
        _ctx.fill();
      } else {
        _ctx.strokeStyle = '#22d3ee';
        _ctx.lineWidth = 1.5;
        _ctx.stroke();
      }
    }
    for (let i = 0; i < 3; i++) {
      const dx = cx - totalW / 2 + i * dotGap + dotSize / 2;
      const ry = dotY + dotSize + 4;
      _ctx.beginPath();
      _ctx.arc(dx, ry, dotSize / 2, 0, Math.PI * 2);
      if (i < p2Wins) {
        _ctx.fillStyle = '#fb923c';
        _ctx.fill();
      } else {
        _ctx.strokeStyle = '#fb923c';
        _ctx.lineWidth = 1.5;
        _ctx.stroke();
      }
    }
  }

  function drawDivider(vw, vh) {
    const cx = Math.floor(vw / 2);
    _ctx.strokeStyle = 'rgba(34,197,94,0.3)';
    _ctx.lineWidth = 2;
    _ctx.setLineDash([8, 6]);
    _ctx.beginPath();
    _ctx.moveTo(cx, 0);
    _ctx.lineTo(cx, vh);
    _ctx.stroke();
    _ctx.setLineDash([]);
  }

  function drawGarbageWarning(ps, boardX, boardY, flipped) {
    if (ps.garbageQueue.length === 0) return;
    const cs = _layout.cellSize;
    const total = ps.garbageQueue.reduce((s, n) => s + n, 0);
    const barH = Math.min(total * cs * 0.25, ROWS * cs);
    const barW = 6;
    const bx = flipped ? boardX + COLS * cs + 2 : boardX - 8;
    const by = boardY + ROWS * cs - barH;
    _ctx.fillStyle = '#ef4444';
    _ctx.fillRect(bx, by, barW, barH);
  }

  function drawPlayerLabel(label, x, y, color) {
    const cs = _layout.cellSize;
    _ctx.textAlign = 'center';
    _ctx.font = `bold ${Math.max(8, Math.floor(cs * 0.5))}px 'Press Start 2P', monospace`;
    _ctx.fillStyle = color;
    _ctx.fillText(label, x, y);
  }

  // ── Full render pass ──────────────────────────────────────────────────────────
  function renderFrame() {
    if (!_canvas || !_ctx || !_layout) return;
    const vw = _canvas.width, vh = _canvas.height;
    const { cellSize: cs, boardW, boardH, topY, margin, sidePanel, halfW, p1Left, p2Left } = _layout;

    // Background
    _ctx.clearRect(0, 0, vw, vh);
    _ctx.fillStyle = '#0d1117';
    _ctx.fillRect(0, 0, vw, vh);

    drawDivider(vw, vh);

    // ── Player 1 (left side) ──
    const p1BoardX = p1Left + sidePanel + margin;
    const p1BoardY = topY;
    drawBoard(state.p1, p1BoardX, p1BoardY);
    drawNextQueue(state.p1, p1BoardX + COLS * cs + margin, p1BoardY, false);
    drawGarbageWarning(state.p1, p1BoardX, p1BoardY, false);
    drawHUD(state.p1, p1Left, topY, 'P1');
    drawPlayerLabel('PLAYER 1', p1BoardX + boardW / 2, topY - margin - 4, '#22d3ee');

    // ── Player 2 (right side) ──
    const p2BoardX = p2Left;
    const p2BoardY = topY;
    const p2NextX  = p2BoardX - sidePanel - margin + margin;
    drawBoard(state.p2, p2BoardX, p2BoardY);
    drawNextQueue(state.p2, p2BoardX - sidePanel - margin, p2BoardY, true);
    drawGarbageWarning(state.p2, p2BoardX, p2BoardY, true);
    drawHUD(state.p2, p2BoardX + boardW + margin, topY, 'P2');
    drawPlayerLabel('PLAYER 2', p2BoardX + boardW / 2, topY - margin - 4, '#fb923c');

    // ── Round tracker ──
    drawWins(state.p1.wins, state.p2.wins, vw, vh);

    // ── Round/Game-over overlays ──
    if (state.phase === 'round_over' || state.phase === 'match_over') {
      _ctx.fillStyle = 'rgba(0,0,0,0.65)';
      _ctx.fillRect(0, 0, vw, vh);
      const msgFontSize = Math.max(10, Math.floor(cs * 0.7));
      _ctx.font = `${msgFontSize}px 'Press Start 2P', monospace`;
      _ctx.textAlign = 'center';
      if (state.phase === 'match_over') {
        const winner = state.p1.wins > state.p2.wins ? 'PLAYER 1 WINS!' : 'PLAYER 2 WINS!';
        const wColor = state.p1.wins > state.p2.wins ? '#22d3ee' : '#fb923c';
        _ctx.fillStyle = '#ffd700';
        _ctx.fillText('MATCH OVER', vw / 2, vh / 2 - msgFontSize * 2);
        _ctx.fillStyle = wColor;
        _ctx.fillText(winner, vw / 2, vh / 2);
        _ctx.fillStyle = '#4ade80';
        _ctx.font = `${Math.floor(msgFontSize * 0.6)}px 'Press Start 2P', monospace`;
        _ctx.fillText('PRESS ENTER to play again', vw / 2, vh / 2 + msgFontSize * 2.5);
        _ctx.fillText('PRESS ESC to return to menu', vw / 2, vh / 2 + msgFontSize * 4);
      } else {
        const roundWinner = state.roundWinner;
        const wLabel = roundWinner === 1 ? 'PLAYER 1 WINS ROUND' : 'PLAYER 2 WINS ROUND';
        const wColor = roundWinner === 1 ? '#22d3ee' : '#fb923c';
        _ctx.fillStyle = '#ffd700';
        _ctx.fillText('ROUND ' + state.round, vw / 2, vh / 2 - msgFontSize * 2);
        _ctx.fillStyle = wColor;
        _ctx.fillText(wLabel, vw / 2, vh / 2);
        _ctx.fillStyle = '#4ade80';
        _ctx.font = `${Math.floor(msgFontSize * 0.55)}px 'Press Start 2P', monospace`;
        _ctx.fillText('Next round starting...', vw / 2, vh / 2 + msgFontSize * 2.5);
      }
    } else if (state.phase === 'countdown') {
      const secs = Math.ceil((ROUND_PAUSE_MS - state.phaseTimer) / 1000);
      if (secs > 0) {
        _ctx.fillStyle = 'rgba(0,0,0,0.55)';
        _ctx.fillRect(0, 0, vw, vh);
        _ctx.font = `${Math.max(16, cs * 2)}px 'Press Start 2P', monospace`;
        _ctx.textAlign = 'center';
        _ctx.fillStyle = '#ffd700';
        _ctx.fillText(String(secs), vw / 2, vh / 2 + cs);
      }
    }

    // ── Controls legend (small, bottom corners) ──
    const legFont = Math.max(5, Math.floor(cs * 0.28));
    _ctx.font = `${legFont}px 'Press Start 2P', monospace`;
    _ctx.fillStyle = 'rgba(74,222,128,0.5)';
    _ctx.textAlign = 'left';
    const kb1 = _p1KB, kb2 = _p2KB;
    _ctx.fillText(codeLabel(kb1.moveLeft)+'/'+codeLabel(kb1.moveRight)+' move  '+codeLabel(kb1.moveBackward)+' drop  '+codeLabel(kb1.nudgeRight)+' rot  '+codeLabel(kb1.jump)+' hard', 8, vh - 8);
    _ctx.textAlign = 'right';
    _ctx.fillText(codeLabel(kb2.jump)+' hard  '+codeLabel(kb2.nudgeRight)+' rot  '+codeLabel(kb2.moveBackward)+' drop  '+codeLabel(kb2.moveLeft)+'/'+codeLabel(kb2.moveRight)+' move', vw - 8, vh - 8);
  }

  function codeLabel(code) {
    if (!code) return '?';
    return code
      .replace('Arrow', '↑↓←→'.includes(code.replace('Arrow','')) ? {'Up':'↑','Down':'↓','Left':'←','Right':'→'}[code.replace('Arrow','')] || code : code.replace('Arrow',''))
      .replace('ArrowUp','↑').replace('ArrowDown','↓').replace('ArrowLeft','←').replace('ArrowRight','→')
      .replace('Key','').replace('Digit','').replace('Space','SPC')
      .replace('Enter','RET').replace('ShiftLeft','LSH').replace('ShiftRight','RSH')
      .replace('ControlLeft','LCT').replace('ControlRight','RCT')
      .slice(0, 4);
  }

  // ── Game state machine ────────────────────────────────────────────────────────
  let state = null;
  let _lastTick = 0;
  let _p1KB = null, _p2KB = null;
  let _p1Rev = null, _p2Rev = null;

  function initRound() {
    state.p1.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    state.p1.piece = null;
    state.p1.nextQueue = [];
    state.p1.bag = [];
    state.p1.score = 0;
    state.p1.lines = 0;
    state.p1.level = 1;
    state.p1.dead = false;
    state.p1.lockTimer = 0;
    state.p1.gravityAcc = 0;
    state.p1.garbageQueue = [];
    state.p1.heldLeft = false; state.p1.heldRight = false; state.p1.heldDown = false;
    state.p1.dasLeft = 0; state.p1.dasRight = 0; state.p1.arrLeft = 0; state.p1.arrRight = 0;

    state.p2.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    state.p2.piece = null;
    state.p2.nextQueue = [];
    state.p2.bag = [];
    state.p2.score = 0;
    state.p2.lines = 0;
    state.p2.level = 1;
    state.p2.dead = false;
    state.p2.lockTimer = 0;
    state.p2.gravityAcc = 0;
    state.p2.garbageQueue = [];
    state.p2.heldLeft = false; state.p2.heldRight = false; state.p2.heldDown = false;
    state.p2.dasLeft = 0; state.p2.dasRight = 0; state.p2.arrLeft = 0; state.p2.arrRight = 0;

    // Sync piece bags for fairness — same shuffle for both
    const bag = shuffleBag(createBag());
    state.p1.bag = bag.slice();
    state.p2.bag = bag.slice();
    refillQueue(state.p1);
    refillQueue(state.p2);
    spawnPiece(state.p1);
    spawnPiece(state.p2);

    state.phase = 'playing';
    state.phaseTimer = 0;
  }

  function initMatch() {
    state = {
      p1: createPlayerState(),
      p2: createPlayerState(),
      round: 1,
      roundWinner: 0,
      phase: 'countdown',
      phaseTimer: 0,
    };
    // Pre-init boards but wait for countdown
    const bag = shuffleBag(createBag());
    state.p1.bag = bag.slice();
    state.p2.bag = bag.slice();
    refillQueue(state.p1);
    refillQueue(state.p2);
    spawnPiece(state.p1);
    spawnPiece(state.p2);
  }

  function endRound(winner) {
    state.roundWinner = winner;
    if (winner === 1) state.p1.wins++; else state.p2.wins++;
    state.phase = 'round_over';
    state.phaseTimer = 0;
    if (state.p1.wins >= 2 || state.p2.wins >= 2) {
      state.phase = 'match_over';
    }
  }

  // ── Main update tick ──────────────────────────────────────────────────────────
  function tick(now) {
    if (!state) return;
    const dt = Math.min(now - _lastTick, 100); // cap at 100ms
    _lastTick = now;

    if (state.phase === 'countdown') {
      state.phaseTimer += dt;
      if (state.phaseTimer >= ROUND_PAUSE_MS) {
        state.phase = 'playing';
        state.phaseTimer = 0;
      }
      return;
    }
    if (state.phase === 'round_over') {
      state.phaseTimer += dt;
      if (state.phaseTimer >= ROUND_PAUSE_MS) {
        state.round++;
        state.phase = 'countdown';
        state.phaseTimer = 0;
        initRound();
      }
      return;
    }
    if (state.phase === 'match_over') return;

    // Playing
    updateGravity(state.p1, state.p2, dt);
    updateGravity(state.p2, state.p1, dt);
    updateDAS(state.p1, state.p2, dt);
    updateDAS(state.p2, state.p1, dt);

    // Check top-out
    if (state.p1.dead && state.p2.dead) {
      // Both out: draw → whoever has more score wins round
      endRound(state.p1.score >= state.p2.score ? 1 : 2);
    } else if (state.p1.dead) {
      endRound(2);
    } else if (state.p2.dead) {
      endRound(1);
    }
  }

  // ── Game loop ─────────────────────────────────────────────────────────────────
  function loop(now) {
    if (!_active) return;
    tick(now);
    renderFrame();
    _animId = requestAnimationFrame(loop);
  }

  // ── Input handling ────────────────────────────────────────────────────────────
  let _active = false;

  function onKeyDown(e) {
    if (!_active || !state) return;
    e.preventDefault();
    e.stopPropagation();

    // Match-over / ESC to menu
    if (e.code === 'Escape') { stopLocalMulti(); return; }
    if (state.phase === 'match_over' && (e.code === 'Enter' || e.code === 'Space')) {
      // Restart match
      initMatch();
      _lastTick = performance.now();
      return;
    }
    if (state.phase !== 'playing') return;

    // Player 1
    const a1 = _p1Rev[e.code];
    if (a1) {
      switch (a1) {
        case 'moveLeft':
          if (!state.p1.heldLeft) { tryMove(state.p1, state.p2, -1, 0); state.p1.heldLeft = true; state.p1.dasLeft = DAS_MS; state.p1.arrLeft = 0; }
          break;
        case 'moveRight':
          if (!state.p1.heldRight) { tryMove(state.p1, state.p2, 1, 0); state.p1.heldRight = true; state.p1.dasRight = DAS_MS; state.p1.arrRight = 0; }
          break;
        case 'moveBackward': state.p1.heldDown = true; break;
        case 'nudgeLeft':    tryRotate(state.p1, -1); break;
        case 'nudgeRight':   tryRotate(state.p1,  1); break;
        case 'jump':         hardDrop(state.p1, state.p2); break;
      }
    }

    // Player 2
    const a2 = _p2Rev[e.code];
    if (a2) {
      switch (a2) {
        case 'moveLeft':
          if (!state.p2.heldLeft) { tryMove(state.p2, state.p1, -1, 0); state.p2.heldLeft = true; state.p2.dasLeft = DAS_MS; state.p2.arrLeft = 0; }
          break;
        case 'moveRight':
          if (!state.p2.heldRight) { tryMove(state.p2, state.p1, 1, 0); state.p2.heldRight = true; state.p2.dasRight = DAS_MS; state.p2.arrRight = 0; }
          break;
        case 'moveBackward': state.p2.heldDown = true; break;
        case 'nudgeLeft':    tryRotate(state.p2, -1); break;
        case 'nudgeRight':   tryRotate(state.p2,  1); break;
        case 'jump':         hardDrop(state.p2, state.p1); break;
      }
    }
  }

  function onKeyUp(e) {
    if (!_active) return;
    e.preventDefault();

    const a1 = _p1Rev[e.code];
    if (a1) {
      if (a1 === 'moveLeft')  { state.p1.heldLeft = false;  state.p1.dasLeft = 0;  state.p1.arrLeft = 0; }
      if (a1 === 'moveRight') { state.p1.heldRight = false; state.p1.dasRight = 0; state.p1.arrRight = 0; }
      if (a1 === 'moveBackward') state.p1.heldDown = false;
    }

    const a2 = _p2Rev[e.code];
    if (a2) {
      if (a2 === 'moveLeft')  { state.p2.heldLeft = false;  state.p2.dasLeft = 0;  state.p2.arrLeft = 0; }
      if (a2 === 'moveRight') { state.p2.heldRight = false; state.p2.dasRight = 0; state.p2.arrRight = 0; }
      if (a2 === 'moveBackward') state.p2.heldDown = false;
    }
  }

  // ── P2 keybinding settings ────────────────────────────────────────────────────
  // Accessible via the settings button in local-multi-overlay
  function showKBSettings() {
    const overlay = document.getElementById('lm-kb-settings');
    if (!overlay) return;
    // Temporarily pause DAS state
    if (state && state.p1) { state.p1.heldLeft = state.p1.heldRight = state.p1.heldDown = false; }
    if (state && state.p2) { state.p2.heldLeft = state.p2.heldRight = state.p2.heldDown = false; }
    renderKBSettings(overlay);
    overlay.style.display = 'flex';
  }

  function renderKBSettings(overlay) {
    overlay.innerHTML = '';
    const content = document.createElement('div');
    content.className = 'lm-kb-panel';
    content.innerHTML = `
      <h2 style="color:#4ade80;margin:0 0 12px;font-size:0.65em;letter-spacing:2px">KEYBINDINGS</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;margin-bottom:12px">
        <div style="color:#22d3ee;font-size:0.5em;letter-spacing:1px;margin-bottom:4px">PLAYER 1</div>
        <div style="color:#fb923c;font-size:0.5em;letter-spacing:1px;margin-bottom:4px">PLAYER 2</div>
      </div>
    `;
    const actions = [
      { key: 'moveLeft', label: 'Move Left' }, { key: 'moveRight', label: 'Move Right' },
      { key: 'moveBackward', label: 'Soft Drop' }, { key: 'nudgeLeft', label: 'Rotate CCW' },
      { key: 'nudgeRight', label: 'Rotate CW' }, { key: 'jump', label: 'Hard Drop' },
    ];
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin-bottom:16px';
    let waitingFor = null; // { player, action, btn }
    actions.forEach(function (a) {
      ['p1', 'p2'].forEach(function (p) {
        const kb = p === 'p1' ? _p1KB : _p2KB;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px';
        row.innerHTML = `<span style="font-size:0.42em;color:#ccc">${a.label}</span>`;
        const btn = document.createElement('button');
        btn.className = 'lm-kb-btn';
        btn.textContent = codeLabel(kb[a.key]);
        btn.setAttribute('data-player', p);
        btn.setAttribute('data-action', a.key);
        btn.addEventListener('click', function () {
          if (waitingFor) {
            waitingFor.btn.textContent = codeLabel((waitingFor.player === 'p1' ? _p1KB : _p2KB)[waitingFor.action]);
            waitingFor.btn.classList.remove('lm-kb-listening');
          }
          waitingFor = { player: p, action: a.key, btn };
          btn.textContent = '...';
          btn.classList.add('lm-kb-listening');
        });
        row.appendChild(btn);
        grid.appendChild(row);
      });
    });

    function onKBCapture(e) {
      if (!waitingFor) return;
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'Escape') {
        waitingFor.btn.textContent = codeLabel((waitingFor.player === 'p1' ? _p1KB : _p2KB)[waitingFor.action]);
        waitingFor.btn.classList.remove('lm-kb-listening');
        waitingFor = null;
        return;
      }
      const kb = waitingFor.player === 'p1' ? _p1KB : _p2KB;
      kb[waitingFor.action] = e.code;
      const storageKey = waitingFor.player === 'p1' ? 'mineCtris_keyBindings' : 'mineCtris_keyBindings_p2';
      saveKB(storageKey, kb);
      if (waitingFor.player === 'p1') _p1Rev = buildRev(_p1KB);
      else _p2Rev = buildRev(_p2KB);
      waitingFor.btn.textContent = codeLabel(e.code);
      waitingFor.btn.classList.remove('lm-kb-listening');
      waitingFor = null;
    }

    document.addEventListener('keydown', onKBCapture, true);

    content.appendChild(grid);

    const resetRow = document.createElement('div');
    resetRow.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;justify-content:center';
    ['P1 Reset', 'P2 Reset'].forEach(function (label, idx) {
      const btn = document.createElement('button');
      btn.className = 'lm-kb-btn';
      btn.textContent = label;
      btn.addEventListener('click', function () {
        if (idx === 0) {
          _p1KB = Object.assign({}, KB_DEFAULTS_P1);
          saveKB('mineCtris_keyBindings', _p1KB);
          _p1Rev = buildRev(_p1KB);
        } else {
          _p2KB = Object.assign({}, KB_DEFAULTS_P2);
          saveKB('mineCtris_keyBindings_p2', _p2KB);
          _p2Rev = buildRev(_p2KB);
        }
        document.removeEventListener('keydown', onKBCapture, true);
        const ov = document.getElementById('lm-kb-settings');
        if (ov) ov.style.display = 'none';
        showKBSettings();
      });
      resetRow.appendChild(btn);
    });
    content.appendChild(resetRow);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lm-kb-btn';
    closeBtn.style.cssText = 'width:100%;margin-top:4px;color:#4ade80';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', function () {
      document.removeEventListener('keydown', onKBCapture, true);
      overlay.style.display = 'none';
    });
    content.appendChild(closeBtn);
    overlay.appendChild(content);
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  function startLocalMulti() {
    // Load keybindings
    _p1KB = loadKB('mineCtris_keyBindings', KB_DEFAULTS_P1);
    _p2KB = loadKB('mineCtris_keyBindings_p2', KB_DEFAULTS_P2);
    _p1Rev = buildRev(_p1KB);
    _p2Rev = buildRev(_p2KB);

    // Show overlay
    const overlay = document.getElementById('local-multi-overlay');
    if (overlay) overlay.style.display = 'flex';

    if (!ensureCanvas()) {
      console.error('local-multi: canvas not found');
      return;
    }

    resizeCanvas();
    _active = true;

    // Set global flag so main game loop yields
    if (typeof window !== 'undefined') window.isLocalMultiActive = true;

    initMatch();
    _lastTick = performance.now();

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('resize', resizeCanvas);

    // Wire up settings button
    const settingsBtn = document.getElementById('lm-settings-btn');
    if (settingsBtn && !settingsBtn._lmBound) {
      settingsBtn._lmBound = true;
      settingsBtn.addEventListener('click', function (e) { e.stopPropagation(); showKBSettings(); });
    }

    _animId = requestAnimationFrame(loop);
  }

  function stopLocalMulti() {
    _active = false;
    if (typeof window !== 'undefined') window.isLocalMultiActive = false;

    if (_animId !== null) { cancelAnimationFrame(_animId); _animId = null; }
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('resize', resizeCanvas);

    const overlay = document.getElementById('local-multi-overlay');
    if (overlay) overlay.style.display = 'none';

    // Return to mode select
    if (typeof showModeSelect === 'function') showModeSelect('battle');
  }

  window.localMulti = { start: startLocalMulti, stop: stopLocalMulti };
  window.isLocalMultiActive = false;

})();

// js/ai/ai-opponent.js
// VS AI mode — split-screen Player vs AI bot with adjustable difficulty.
// Self-contained canvas-based game, same architecture as local-multi.js.
// Exposes: window.vsAI = { start, stop }

(function () {
  'use strict';

  // ── Board constants ───────────────────────────────────────────────────────────
  const COLS = 10;
  const ROWS = 20;

  // ── Piece definitions (7-bag) ─────────────────────────────────────────────────
  const PIECE_DEFS = [
    { matrix: [[1, 1, 1, 1]],          color: '#22d3ee' }, // I
    { matrix: [[1, 1], [1, 1]],        color: '#ffd700' }, // O
    { matrix: [[0,1,0],[1,1,1]],       color: '#a855f7' }, // T
    { matrix: [[0,1,1],[1,1,0]],       color: '#4ade80' }, // S
    { matrix: [[1,1,0],[0,1,1]],       color: '#f87171' }, // Z
    { matrix: [[1,0,0],[1,1,1]],       color: '#60a5fa' }, // J
    { matrix: [[0,0,1],[1,1,1]],       color: '#fb923c' }, // L
  ];

  const GARBAGE_COLOR = '#4b5563';

  // ── Scoring ───────────────────────────────────────────────────────────────────
  const SCORE_TABLE   = [0, 100, 300, 500, 800];
  const GARBAGE_TABLE = [0, 0,   1,   2,   4  ];

  // ── Timings (ms) ─────────────────────────────────────────────────────────────
  const GRAVITY_MS       = 800;
  const LOCK_DELAY_MS    = 500;
  const DAS_MS           = 167;
  const ARR_MS           = 33;
  const ROUND_PAUSE_MS   = 2500;
  const SOFT_DROP_FACTOR = 0.1;

  // ── Difficulty profiles ───────────────────────────────────────────────────────
  const DIFFICULTIES = {
    easy:   { label: 'EASY',   placementMs: 2000, errorRate: 0.40, color: '#4ade80' },
    medium: { label: 'MEDIUM', placementMs: 1000, errorRate: 0.20, color: '#ffd700' },
    hard:   { label: 'HARD',   placementMs:  500, errorRate: 0.00, color: '#f87171' },
  };

  // ── Layout helpers ────────────────────────────────────────────────────────────
  function computeLayout(vw, vh) {
    const margin    = Math.max(8, Math.floor(vw * 0.02));
    const halfW     = Math.floor(vw / 2);
    const cellW     = Math.floor((halfW - margin * 3) / (COLS + 4));
    const cellH     = Math.floor((vh - margin * 4) / ROWS);
    const cellSize  = Math.max(12, Math.min(cellW, cellH));
    const boardW    = cellSize * COLS;
    const boardH    = cellSize * ROWS;
    const topY      = Math.floor((vh - boardH) / 2);
    const sidePanel = cellSize * 4;
    const p1Left    = Math.floor((halfW - boardW - margin - sidePanel) / 2);
    const p2Left    = halfW + Math.floor((halfW - boardW - margin - sidePanel) / 2) + sidePanel + margin;
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

  function getAllRotations(matrix) {
    const rotations = [matrix];
    let cur = matrix;
    for (let i = 0; i < 3; i++) {
      cur = rotateCW(cur);
      // Deduplicate (O-piece has only 1 unique rotation)
      const curStr = JSON.stringify(cur);
      if (rotations.every(r => JSON.stringify(r) !== curStr)) rotations.push(cur);
    }
    return rotations;
  }

  // ── 7-bag randomizer ──────────────────────────────────────────────────────────
  function createBag() { return [0, 1, 2, 3, 4, 5, 6]; }
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
      piece:        null,
      nextQueue:    [],
      bag:          [],
      score:        0,
      lines:        0,
      level:        1,
      wins:         0,
      dead:         false,
      lockTimer:    0,
      gravityAcc:   0,
      garbageQueue: [],
      heldLeft: false, heldRight: false, heldDown: false,
      dasLeft: 0, dasRight: 0, dasDown: 0,
      arrLeft: 0, arrRight: 0,
    };
  }

  // ── Keybindings (P1 only) ─────────────────────────────────────────────────────
  const KB_DEFAULTS_P1 = {
    moveLeft: 'KeyA', moveRight: 'KeyD', moveBackward: 'KeyS',
    nudgeLeft: 'KeyQ', nudgeRight: 'KeyE', jump: 'Space',
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
    ps.piece = { matrix: next.matrix, color: next.color, x: spawnX, y: 0 };
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
      ps.board.shift();
      ps.board.push(row);
    }
  }

  // ── Movement ──────────────────────────────────────────────────────────────────
  function tryMove(ps, otherPs, dx, dy) {
    if (!ps.piece || ps.dead) return false;
    if (isValidPosition(ps.board, ps.piece, dx, dy)) {
      ps.piece.x += dx;
      ps.piece.y += dy;
      if (dy < 0 || dx !== 0) ps.lockTimer = 0;
      return true;
    }
    return false;
  }

  function tryRotate(ps, dir) {
    if (!ps.piece || ps.dead) return;
    const rotated = dir > 0 ? rotateCW(ps.piece.matrix) : rotateCW(rotateCW(rotateCW(ps.piece.matrix)));
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
      if (!tryMove(ps, otherPs, 0, 1)) break;
      else if (ps.heldDown) ps.score += 1;
    }
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

  // ── Audio stubs ───────────────────────────────────────────────────────────────
  function playClearSound(lines) {
    try { if (typeof playLineClearSfx === 'function') playLineClearSfx(lines); } catch (_) {}
  }
  function playLockSound() {
    try { if (typeof playPieceLandSfx === 'function') playPieceLandSfx(); } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AI HEURISTICS
  // ─────────────────────────────────────────────────────────────────────────────

  // Evaluate a board state after placement.
  // Returns a score — higher is better.
  function evaluateBoard(board, garbagePressure) {
    // Column heights
    const heights = new Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (board[r][c] !== null) { heights[c] = ROWS - r; break; }
      }
    }

    // Aggregate height
    const aggregateHeight = heights.reduce((s, h) => s + h, 0);

    // Count complete lines
    let completedLines = 0;
    for (let r = 0; r < ROWS; r++) {
      if (board[r].every(c => c !== null)) completedLines++;
    }

    // Count holes (empty cell with at least one filled cell above in same column)
    let holes = 0;
    for (let c = 0; c < COLS; c++) {
      let blockFound = false;
      for (let r = 0; r < ROWS; r++) {
        if (board[r][c] !== null) blockFound = true;
        else if (blockFound) holes++;
      }
    }

    // Bumpiness (sum of absolute height differences between adjacent columns)
    let bumpiness = 0;
    for (let c = 0; c < COLS - 1; c++) {
      bumpiness += Math.abs(heights[c] - heights[c + 1]);
    }

    // Well depth bonus — reward a clean well column for Tetris setups
    // (only if aggregate height is low enough to be useful)
    let wellBonus = 0;
    if (aggregateHeight < ROWS * COLS * 0.4) {
      const maxH = Math.max(...heights);
      const secondMax = heights.slice().sort((a, b) => b - a)[1] || 0;
      const wellDepth = secondMax - Math.min(...heights);
      if (wellDepth >= 4) wellBonus = wellDepth * 2;
    }

    // Weights — tuned per difficulty context (caller sets garbagePressure)
    // Under garbage pressure, prioritize clearing lines above all else
    const lineWeight    = garbagePressure ? 120.0 : 76.6;
    const heightWeight  = 51.0;
    const holeWeight    = garbagePressure ? 55.0  : 35.8;
    const bumpWeight    = 18.4;
    const wellWeight    = 1.0;

    return (
      completedLines  *  lineWeight -
      aggregateHeight * heightWeight -
      holes           *  holeWeight -
      bumpiness       *  bumpWeight +
      wellBonus       *  wellWeight
    );
  }

  // Simulate placing a piece at (x, rotation) and return the resulting board.
  // Returns null if placement is invalid.
  function simulatePlacement(board, matrix, startX) {
    // Find the lowest valid Y position (hard drop destination)
    let y = 0;
    const piece = { matrix, x: startX, y: 0 };

    // Validate spawn
    if (!isValidPosition(board, piece, 0, 0)) return null;

    // Hard drop
    while (isValidPosition(board, piece, 0, 1)) piece.y++;
    y = piece.y;

    // Copy board and place piece
    const newBoard = board.map(r => r.slice());
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const ny = y + r, nx = startX + c;
        if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
          newBoard[ny][nx] = '#ffffff'; // placeholder color, doesn't affect scoring
        }
      }
    }

    // Clear completed lines (for scoring)
    for (let r = ROWS - 1; r >= 0; ) {
      if (newBoard[r].every(c => c !== null)) {
        newBoard.splice(r, 1);
        newBoard.unshift(new Array(COLS).fill(null));
      } else {
        r--;
      }
    }

    return newBoard;
  }

  // Find the best placement for the current piece.
  // Returns { matrix, x } — the piece matrix (rotation) and column to place at.
  function getBestPlacement(ps, errorRate) {
    if (!ps.piece) return null;

    const garbagePressure = ps.garbageQueue.length > 0;
    const rotations = getAllRotations(ps.piece.matrix);
    const candidates = [];

    for (const matrix of rotations) {
      const pieceW = matrix[0].length;
      for (let x = 0; x <= COLS - pieceW; x++) {
        const newBoard = simulatePlacement(ps.board, matrix, x);
        if (newBoard === null) continue;
        const score = evaluateBoard(newBoard, garbagePressure);
        candidates.push({ matrix, x, score });
      }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);

    // Apply error rate: with errorRate probability, pick from bottom half
    if (errorRate > 0 && Math.random() < errorRate) {
      const worstHalf = candidates.slice(Math.floor(candidates.length / 2));
      return worstHalf[Math.floor(Math.random() * worstHalf.length)];
    }

    return candidates[0];
  }

  // ── AI state ──────────────────────────────────────────────────────────────────
  let _aiTimer     = 0;       // countdown to next AI placement (ms)
  let _difficulty  = 'medium';

  function resetAI(difficulty) {
    _difficulty = difficulty;
    _aiTimer    = DIFFICULTIES[difficulty].placementMs;
  }

  function updateAI(ps, otherPs, dt) {
    if (!ps.piece || ps.dead) return;

    _aiTimer -= dt;
    if (_aiTimer > 0) return;

    const diff = DIFFICULTIES[_difficulty];
    _aiTimer = diff.placementMs;

    const placement = getBestPlacement(ps, diff.errorRate);
    if (!placement) return;

    // Apply: set piece to chosen rotation and column, then hard-drop
    ps.piece.matrix = placement.matrix;
    ps.piece.x = placement.x;
    // Snap Y to valid spawn row (top of board)
    ps.piece.y = 0;
    while (isValidPosition(ps.board, ps.piece, 0, 1)) ps.piece.y++;

    hardDrop(ps, otherPs);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDERING
  // ─────────────────────────────────────────────────────────────────────────────
  let _canvas = null, _ctx = null, _layout = null, _animId = null;

  function ensureCanvas() {
    _canvas = document.getElementById('vs-ai-canvas');
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
    _ctx.fillStyle = color;
    _ctx.fillRect(x + 1, y + 1, c - 2, c - 2);
    _ctx.fillStyle = 'rgba(255,255,255,0.25)';
    _ctx.fillRect(x + 1, y + 1, c - 2, 3);
    _ctx.fillRect(x + 1, y + 1, 3, c - 2);
    _ctx.fillStyle = 'rgba(0,0,0,0.35)';
    _ctx.fillRect(x + 1, y + c - 4, c - 2, 3);
    _ctx.fillRect(x + c - 4, y + 1, 3, c - 2);
    _ctx.globalAlpha = 1;
  }

  function drawBoard(ps, boardX, boardY) {
    const cs = _layout.cellSize;
    _ctx.fillStyle = '#0a0f0a';
    _ctx.fillRect(boardX, boardY, COLS * cs, ROWS * cs);
    _ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    _ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      _ctx.beginPath();
      _ctx.moveTo(boardX + c * cs, boardY);
      _ctx.lineTo(boardX + c * cs, boardY + ROWS * cs);
      _ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      _ctx.beginPath();
      _ctx.moveTo(boardX, boardY + r * cs);
      _ctx.lineTo(boardX + COLS * cs, boardY + r * cs);
      _ctx.stroke();
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const color = ps.board[r][c];
        if (color) drawCell(boardX + c * cs, boardY + r * cs, color);
      }
    }
    if (ps.piece) {
      const gy = ghostY(ps);
      if (gy !== ps.piece.y) {
        const { matrix, color, x } = ps.piece;
        for (let r = 0; r < matrix.length; r++)
          for (let c = 0; c < matrix[r].length; c++)
            if (matrix[r][c])
              drawCell(boardX + (x + c) * cs, boardY + (gy + r) * cs, color, 0.22);
      }
      const { matrix, color, x, y } = ps.piece;
      for (let r = 0; r < matrix.length; r++)
        for (let c = 0; c < matrix[r].length; c++)
          if (matrix[r][c] && y + r >= 0)
            drawCell(boardX + (x + c) * cs, boardY + (y + r) * cs, color);
    }
    _ctx.strokeStyle = '#22c55e';
    _ctx.lineWidth = 2;
    _ctx.strokeRect(boardX - 1, boardY - 1, COLS * cs + 2, ROWS * cs + 2);
  }

  function drawNextQueue(ps, panelX, panelY) {
    const cs = _layout.cellSize;
    const cellSmall = Math.floor(cs * 0.7);
    _ctx.fillStyle = '#4ade80';
    _ctx.font = `${Math.max(7, Math.floor(cs * 0.38))}px 'Press Start 2P', monospace`;
    _ctx.textAlign = 'left';
    _ctx.fillText('NEXT', panelX, panelY - 6);
    ps.nextQueue.slice(0, 3).forEach(function (piece, i) {
      const previewY = panelY + i * (cellSmall * 3 + 6);
      _ctx.fillStyle = '#111';
      _ctx.fillRect(panelX, previewY, cellSmall * 4, cellSmall * 3);
      _ctx.strokeStyle = '#2d4a2d';
      _ctx.lineWidth = 1;
      _ctx.strokeRect(panelX, previewY, cellSmall * 4, cellSmall * 3);
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

  function drawHUD(ps, hX, hY, label, labelColor) {
    const cs = _layout.cellSize;
    const fontSize = Math.max(7, Math.floor(cs * 0.38));
    _ctx.font = `${fontSize}px 'Press Start 2P', monospace`;
    _ctx.textAlign = 'left';
    _ctx.fillStyle = labelColor || '#4ade80';
    _ctx.fillText(label, hX, hY);
    _ctx.fillStyle = '#fff';
    _ctx.fillText('SCR', hX, hY + fontSize * 1.8);
    _ctx.fillStyle = '#ffd700';
    _ctx.fillText(ps.score.toLocaleString(), hX, hY + fontSize * 3.2);
    _ctx.fillStyle = '#fff';
    _ctx.fillText('LVL ' + ps.level, hX, hY + fontSize * 5.0);
    _ctx.fillText('LNS ' + ps.lines, hX, hY + fontSize * 6.4);
  }

  function drawWins(p1Wins, aiWins, vw, vh) {
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
      if (i < p1Wins) { _ctx.fillStyle = '#22d3ee'; _ctx.fill(); }
      else { _ctx.strokeStyle = '#22d3ee'; _ctx.lineWidth = 1.5; _ctx.stroke(); }
    }
    for (let i = 0; i < 3; i++) {
      const dx = cx - totalW / 2 + i * dotGap + dotSize / 2;
      const ry = dotY + dotSize + 4;
      _ctx.beginPath();
      _ctx.arc(dx, ry, dotSize / 2, 0, Math.PI * 2);
      if (i < aiWins) { _ctx.fillStyle = '#f87171'; _ctx.fill(); }
      else { _ctx.strokeStyle = '#f87171'; _ctx.lineWidth = 1.5; _ctx.stroke(); }
    }
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

  function drawDifficultyBadge(vw, vh) {
    const diff = DIFFICULTIES[_difficulty];
    const cs = _layout.cellSize;
    const cx = Math.floor(vw / 2);
    const fontSize = Math.max(6, Math.floor(cs * 0.32));
    _ctx.font = `${fontSize}px 'Press Start 2P', monospace`;
    _ctx.textAlign = 'center';
    _ctx.fillStyle = diff.color;
    _ctx.fillText(diff.label, cx, Math.max(18, fontSize + 8));
  }

  // ── Difficulty selection screen (rendered on canvas) ──────────────────────────
  let _selectedDiff = 'medium'; // cursor position on selection screen

  function drawDifficultySelect(vw, vh) {
    _ctx.clearRect(0, 0, vw, vh);
    _ctx.fillStyle = '#0d1117';
    _ctx.fillRect(0, 0, vw, vh);

    const cx = vw / 2;
    const titleFont = Math.max(12, Math.floor(vw * 0.03));
    const btnFont   = Math.max(9,  Math.floor(vw * 0.018));
    const subFont   = Math.max(7,  Math.floor(vw * 0.012));

    // Title
    _ctx.textAlign = 'center';
    _ctx.font = `${titleFont}px 'Press Start 2P', monospace`;
    _ctx.fillStyle = '#22c55e';
    _ctx.fillText('VS AI', cx, vh * 0.18);

    // Subtitle
    _ctx.font = `${subFont}px 'Press Start 2P', monospace`;
    _ctx.fillStyle = '#6b7280';
    _ctx.fillText('CHOOSE DIFFICULTY', cx, vh * 0.18 + titleFont * 1.8);

    // Difficulty buttons
    const diffs = ['easy', 'medium', 'hard'];
    const labels = {
      easy:   { name: 'EASY',   desc: '40% error rate · 1 piece / 2s', color: '#4ade80' },
      medium: { name: 'MEDIUM', desc: '20% error rate · 1 piece / 1s', color: '#ffd700' },
      hard:   { name: 'HARD',   desc: 'Optimal · 1 piece / 0.5s',      color: '#f87171' },
    };
    const btnH   = Math.max(44, vh * 0.1);
    const btnW   = Math.min(320, vw * 0.45);
    const gapY   = btnH + Math.max(12, vh * 0.02);
    const startY = vh * 0.35;

    diffs.forEach(function (d, i) {
      const bx = cx - btnW / 2;
      const by = startY + i * gapY;
      const lbl = labels[d];
      const selected = _selectedDiff === d;

      // Button background
      _ctx.fillStyle = selected ? lbl.color : 'rgba(255,255,255,0.04)';
      _ctx.beginPath();
      _ctx.roundRect ? _ctx.roundRect(bx, by, btnW, btnH, 6) : _ctx.rect(bx, by, btnW, btnH);
      _ctx.fill();

      // Border
      _ctx.strokeStyle = selected ? lbl.color : 'rgba(255,255,255,0.12)';
      _ctx.lineWidth = selected ? 2 : 1;
      _ctx.beginPath();
      _ctx.roundRect ? _ctx.roundRect(bx, by, btnW, btnH, 6) : _ctx.rect(bx, by, btnW, btnH);
      _ctx.stroke();

      // Label
      _ctx.font = `${btnFont}px 'Press Start 2P', monospace`;
      _ctx.fillStyle = selected ? '#0d1117' : lbl.color;
      _ctx.textAlign = 'center';
      _ctx.fillText(lbl.name, cx, by + btnH * 0.42);

      // Description
      _ctx.font = `${subFont}px 'Press Start 2P', monospace`;
      _ctx.fillStyle = selected ? 'rgba(0,0,0,0.7)' : '#6b7280';
      _ctx.fillText(lbl.desc, cx, by + btnH * 0.75);
    });

    // Controls hint
    _ctx.font = `${subFont}px 'Press Start 2P', monospace`;
    _ctx.fillStyle = 'rgba(74,222,128,0.4)';
    _ctx.textAlign = 'center';
    _ctx.fillText('↑↓ / W S   SELECT      ENTER / SPACE   START      ESC   BACK', cx, vh * 0.88);

    // Store button rects for mouse click detection
    _diffBtnRects = diffs.map(function (d, i) {
      return { diff: d, x: cx - btnW / 2, y: startY + i * gapY, w: btnW, h: btnH };
    });
  }

  let _diffBtnRects = [];

  // ── Full render pass ──────────────────────────────────────────────────────────
  function renderFrame() {
    if (!_canvas || !_ctx || !_layout) return;
    const vw = _canvas.width, vh = _canvas.height;
    const { cellSize: cs, boardW, boardH, topY, margin, sidePanel, halfW, p1Left, p2Left } = _layout;

    if (state.phase === 'diff_select') {
      drawDifficultySelect(vw, vh);
      return;
    }

    _ctx.clearRect(0, 0, vw, vh);
    _ctx.fillStyle = '#0d1117';
    _ctx.fillRect(0, 0, vw, vh);

    drawDivider(vw, vh);
    drawDifficultyBadge(vw, vh);

    // ── Player 1 (left) ──
    const p1BoardX = p1Left + sidePanel + margin;
    const p1BoardY = topY;
    drawBoard(state.p1, p1BoardX, p1BoardY);
    drawNextQueue(state.p1, p1BoardX + COLS * cs + margin, p1BoardY);
    drawGarbageWarning(state.p1, p1BoardX, p1BoardY, false);
    drawHUD(state.p1, p1Left, topY, 'P1', '#22d3ee');
    // Player label
    _ctx.textAlign = 'center';
    _ctx.font = `bold ${Math.max(8, Math.floor(cs * 0.5))}px 'Press Start 2P', monospace`;
    _ctx.fillStyle = '#22d3ee';
    _ctx.fillText('YOU', p1BoardX + boardW / 2, topY - margin - 4);

    // ── AI board (right) ──
    const aiDiff = DIFFICULTIES[_difficulty];
    const p2BoardX = p2Left;
    const p2BoardY = topY;
    drawBoard(state.p2, p2BoardX, p2BoardY);
    // AI next queue shown to left of board
    drawNextQueue(state.p2, p2BoardX - sidePanel - margin + margin, p2BoardY);
    drawGarbageWarning(state.p2, p2BoardX, p2BoardY, true);
    drawHUD(state.p2, p2BoardX + boardW + margin, topY, 'AI', aiDiff.color);
    _ctx.textAlign = 'center';
    _ctx.font = `bold ${Math.max(8, Math.floor(cs * 0.5))}px 'Press Start 2P', monospace`;
    _ctx.fillStyle = aiDiff.color;
    _ctx.fillText('AI (' + aiDiff.label + ')', p2BoardX + boardW / 2, topY - margin - 4);

    // ── Round tracker ──
    drawWins(state.p1.wins, state.p2.wins, vw, vh);

    // ── Overlays ──
    if (state.phase === 'round_over' || state.phase === 'match_over') {
      _ctx.fillStyle = 'rgba(0,0,0,0.65)';
      _ctx.fillRect(0, 0, vw, vh);
      const msgFontSize = Math.max(10, Math.floor(cs * 0.7));
      _ctx.font = `${msgFontSize}px 'Press Start 2P', monospace`;
      _ctx.textAlign = 'center';
      if (state.phase === 'match_over') {
        const playerWon = state.p1.wins > state.p2.wins;
        _ctx.fillStyle = '#ffd700';
        _ctx.fillText('MATCH OVER', vw / 2, vh / 2 - msgFontSize * 2);
        _ctx.fillStyle = playerWon ? '#22d3ee' : aiDiff.color;
        _ctx.fillText(playerWon ? 'YOU WIN!' : 'AI WINS!', vw / 2, vh / 2);
        _ctx.fillStyle = '#4ade80';
        _ctx.font = `${Math.floor(msgFontSize * 0.6)}px 'Press Start 2P', monospace`;
        _ctx.fillText('ENTER  play again', vw / 2, vh / 2 + msgFontSize * 2.5);
        _ctx.fillText('ESC  return to menu', vw / 2, vh / 2 + msgFontSize * 4);
      } else {
        const roundWinner = state.roundWinner; // 1 = player, 2 = AI
        _ctx.fillStyle = '#ffd700';
        _ctx.fillText('ROUND ' + state.round, vw / 2, vh / 2 - msgFontSize * 2);
        _ctx.fillStyle = roundWinner === 1 ? '#22d3ee' : aiDiff.color;
        _ctx.fillText(roundWinner === 1 ? 'YOU WIN ROUND' : 'AI WINS ROUND', vw / 2, vh / 2);
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

    // Controls legend
    const legFont = Math.max(5, Math.floor(cs * 0.28));
    _ctx.font = `${legFont}px 'Press Start 2P', monospace`;
    _ctx.fillStyle = 'rgba(74,222,128,0.5)';
    const kb1 = _p1KB;
    _ctx.textAlign = 'left';
    _ctx.fillText(
      _codeLabel(kb1.moveLeft) + '/' + _codeLabel(kb1.moveRight) + ' move  ' +
      _codeLabel(kb1.moveBackward) + ' drop  ' + _codeLabel(kb1.nudgeRight) + ' rot  ' +
      _codeLabel(kb1.jump) + ' hard',
      8, vh - 8
    );
  }

  function _codeLabel(code) {
    if (!code) return '?';
    return code
      .replace('ArrowUp','↑').replace('ArrowDown','↓').replace('ArrowLeft','←').replace('ArrowRight','→')
      .replace('Key','').replace('Digit','').replace('Space','SPC')
      .replace('Enter','RET').replace('ShiftLeft','LSH').replace('ShiftRight','RSH')
      .replace('ControlLeft','LCT').replace('ControlRight','RCT')
      .slice(0, 4);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GAME STATE MACHINE
  // ─────────────────────────────────────────────────────────────────────────────
  let state = null;
  let _lastTick = 0;
  let _p1KB = null, _p1Rev = null;

  function initRound() {
    state.p1.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    state.p1.piece = null; state.p1.nextQueue = []; state.p1.bag = [];
    state.p1.score = 0; state.p1.lines = 0; state.p1.level = 1;
    state.p1.dead = false; state.p1.lockTimer = 0; state.p1.gravityAcc = 0;
    state.p1.garbageQueue = [];
    state.p1.heldLeft = false; state.p1.heldRight = false; state.p1.heldDown = false;
    state.p1.dasLeft = 0; state.p1.dasRight = 0; state.p1.arrLeft = 0; state.p1.arrRight = 0;

    state.p2.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    state.p2.piece = null; state.p2.nextQueue = []; state.p2.bag = [];
    state.p2.score = 0; state.p2.lines = 0; state.p2.level = 1;
    state.p2.dead = false; state.p2.lockTimer = 0; state.p2.gravityAcc = 0;
    state.p2.garbageQueue = [];

    const bag = shuffleBag(createBag());
    state.p1.bag = bag.slice();
    state.p2.bag = bag.slice();
    refillQueue(state.p1);
    refillQueue(state.p2);
    spawnPiece(state.p1);
    spawnPiece(state.p2);

    resetAI(_difficulty);
    state.phase = 'playing';
    state.phaseTimer = 0;
  }

  function initMatch(difficulty) {
    _difficulty = difficulty || _difficulty;
    state = {
      p1: createPlayerState(),
      p2: createPlayerState(),
      round: 1,
      roundWinner: 0,
      phase: 'countdown',
      phaseTimer: 0,
    };
    const bag = shuffleBag(createBag());
    state.p1.bag = bag.slice();
    state.p2.bag = bag.slice();
    refillQueue(state.p1);
    refillQueue(state.p2);
    spawnPiece(state.p1);
    spawnPiece(state.p2);
    resetAI(_difficulty);
  }

  function endRound(winner) {
    state.roundWinner = winner;
    if (winner === 1) state.p1.wins++; else state.p2.wins++;
    state.phase = 'round_over';
    state.phaseTimer = 0;
    if (state.p1.wins >= 2 || state.p2.wins >= 2) {
      state.phase = 'match_over';
      _recordStats(state.p1.wins > state.p2.wins);
    }
  }

  function _recordStats(playerWon) {
    try {
      if (typeof loadLifetimeStats !== 'function' || typeof saveLifetimeStats !== 'function') return;
      const stats = loadLifetimeStats();
      if (!stats.perMode) stats.perMode = {};
      const pm = stats.perMode['vs_ai'] || { games: 0, wins: 0, losses: 0 };
      pm.games++;
      if (playerWon) pm.wins++; else pm.losses++;
      stats.perMode['vs_ai'] = pm;
      saveLifetimeStats(stats);
    } catch (_) {}
  }

  // ── Main update tick ──────────────────────────────────────────────────────────
  function tick(now) {
    if (!state) return;
    const dt = Math.min(now - _lastTick, 100);
    _lastTick = now;

    if (state.phase === 'diff_select') return; // waiting for user input

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
    updateDAS(state.p1, state.p2, dt);
    updateAI(state.p2, state.p1, dt);

    if (state.p1.dead && state.p2.dead) {
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

    // Difficulty selection screen
    if (state.phase === 'diff_select') {
      const diffs = ['easy', 'medium', 'hard'];
      const idx = diffs.indexOf(_selectedDiff);
      if (e.code === 'Escape') { stopVsAI(); return; }
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        _selectedDiff = diffs[Math.max(0, idx - 1)];
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        _selectedDiff = diffs[Math.min(diffs.length - 1, idx + 1)];
      } else if (e.code === 'Enter' || e.code === 'Space') {
        _startMatch(_selectedDiff);
      }
      return;
    }

    if (e.code === 'Escape') { stopVsAI(); return; }

    if (state.phase === 'match_over' && (e.code === 'Enter' || e.code === 'Space')) {
      state.phase = 'diff_select';
      _selectedDiff = _difficulty;
      return;
    }
    if (state.phase !== 'playing') return;

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
  }

  function onKeyUp(e) {
    if (!_active || !state) return;
    e.preventDefault();
    if (state.phase !== 'playing') return;
    const a1 = _p1Rev[e.code];
    if (a1) {
      if (a1 === 'moveLeft')     { state.p1.heldLeft = false;  state.p1.dasLeft = 0;  state.p1.arrLeft = 0; }
      if (a1 === 'moveRight')    { state.p1.heldRight = false; state.p1.dasRight = 0; state.p1.arrRight = 0; }
      if (a1 === 'moveBackward') state.p1.heldDown = false;
    }
  }

  function onMouseClick(e) {
    if (!_active || !state) return;
    if (state.phase !== 'diff_select') return;
    const rect = _canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Scale from CSS pixels to canvas pixels
    const scaleX = _canvas.width / rect.width;
    const scaleY = _canvas.height / rect.height;
    const cx = mx * scaleX;
    const cy = my * scaleY;
    for (const btn of _diffBtnRects) {
      if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
        _selectedDiff = btn.diff;
        _startMatch(_selectedDiff);
        return;
      }
    }
  }

  function _startMatch(difficulty) {
    initMatch(difficulty);
    _lastTick = performance.now();
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  function startVsAI() {
    _p1KB  = loadKB('mineCtris_keyBindings', KB_DEFAULTS_P1);
    _p1Rev = buildRev(_p1KB);

    const overlay = document.getElementById('vs-ai-overlay');
    if (overlay) overlay.style.display = 'flex';

    if (!ensureCanvas()) {
      console.error('vs-ai: canvas not found');
      return;
    }

    resizeCanvas();
    _active = true;

    if (typeof window !== 'undefined') window.isLocalMultiActive = true;

    // Show difficulty selection before starting
    state = { phase: 'diff_select' };
    _selectedDiff = 'medium';

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    _canvas.addEventListener('click', onMouseClick);
    window.addEventListener('resize', resizeCanvas);

    _lastTick = performance.now();
    _animId = requestAnimationFrame(loop);
  }

  function stopVsAI() {
    _active = false;
    if (typeof window !== 'undefined') window.isLocalMultiActive = false;
    if (_animId !== null) { cancelAnimationFrame(_animId); _animId = null; }
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
    if (_canvas) _canvas.removeEventListener('click', onMouseClick);
    window.removeEventListener('resize', resizeCanvas);
    const overlay = document.getElementById('vs-ai-overlay');
    if (overlay) overlay.style.display = 'none';
    if (typeof showModeSelect === 'function') showModeSelect('vs_ai');
  }

  window.vsAI = { start: startVsAI, stop: stopVsAI };

})();

import { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, BoardType, PieceType } from '../types';
import {
  PIECES,
  BOARD_COLS,
  BOARD_ROWS,
  createEmptyBoard,
  generateMines,
  clearLines,
  calcScore,
  countAdjacentMines,
} from '../utils/gameUtils';

const INITIAL_DROP_INTERVAL = 800; // ms between auto-drops

const checkCollision = (piece: PieceType, board: BoardType): boolean =>
  piece.shape.some(([dx, dy]) => {
    const x = piece.x + dx;
    const y = piece.y + dy;
    return (
      x < 0 ||
      x >= BOARD_COLS ||
      y >= BOARD_ROWS ||
      (y >= 0 && board[y][x] !== 0)
    );
  });

const rotateCW = (shape: number[][]): number[][] =>
  shape.map(([x, y]) => [-y, x]);

export const useGameState = () => {
  const [gameState, setGameState] = useState<GameState>('idle');
  const [board, setBoard] = useState<BoardType>(createEmptyBoard());
  const [currentPiece, setCurrentPiece] = useState<PieceType | null>(null);
  const [nextPieceShape, setNextPieceShape] = useState<number[][] | null>(null);
  const [mines, setMines] = useState<Set<number>>(new Set());
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(0);
  const [linesTotal, setLinesTotal] = useState(0);

  const isGameOver = gameState === 'over';
  const isPlaying = gameState === 'playing';

  // Use refs for values needed inside the interval callback to avoid stale closures
  const boardRef = useRef(board);
  const currentPieceRef = useRef(currentPiece);
  const nextPieceShapeRef = useRef(nextPieceShape);
  const minesRef = useRef(mines);
  const levelRef = useRef(level);
  const gameStateRef = useRef(gameState);
  boardRef.current = board;
  currentPieceRef.current = currentPiece;
  nextPieceShapeRef.current = nextPieceShape;
  minesRef.current = mines;
  levelRef.current = level;
  gameStateRef.current = gameState;

  const spawnPiece = useCallback((currentBoard: BoardType, queuedShape?: number[][]) => {
    const shape = queuedShape ?? PIECES[Math.floor(Math.random() * PIECES.length)];
    const next = PIECES[Math.floor(Math.random() * PIECES.length)];
    const piece: PieceType = { shape, x: Math.floor(BOARD_COLS / 2), y: 0 };
    if (checkCollision(piece, currentBoard)) {
      // Can't spawn — board is full, game over
      setGameState('over');
    } else {
      setCurrentPiece(piece);
      setNextPieceShape(next);
    }
  }, []);

  /**
   * Lock the current piece into the board, check mine collision, clear lines,
   * then spawn the next piece. Returns early if no piece is active.
   */
  const lockPiece = useCallback(
    (piece: PieceType, currentBoard: BoardType, currentMines: Set<number>, currentLevel: number) => {
      // Check mine collision before locking
      const hitMine = piece.shape.some(([dx, dy]) => {
        const pos = (piece.y + dy) * BOARD_COLS + (piece.x + dx);
        return currentMines.has(pos);
      });

      if (hitMine) {
        setGameState('over');
        return;
      }

      // Place piece on board (deep copy rows that change)
      const newBoard = currentBoard.map((row) => [...row]);
      piece.shape.forEach(([dx, dy]) => {
        const x = piece.x + dx;
        const y = piece.y + dy;
        if (y >= 0 && y < BOARD_ROWS && x >= 0 && x < BOARD_COLS) {
          // Store adjacency count (1-8) or 9 to mark "filled, no adjacent mines"
          const adj = countAdjacentMines(y, x, currentMines);
          newBoard[y][x] = adj > 0 ? adj : 9; // 9 = filled with no adjacent mines
        }
      });

      const { newBoard: clearedBoard, linesCleared } = clearLines(newBoard);
      const points = calcScore(linesCleared, currentLevel);
      const newLinesTotal = linesTotal + linesCleared;
      const newLevel = Math.floor(newLinesTotal / 10);

      setBoard(clearedBoard);
      setScore((s) => s + points);
      setLinesTotal(newLinesTotal);
      setLevel(newLevel);
      setCurrentPiece(null);
      spawnPiece(clearedBoard, nextPieceShapeRef.current ?? undefined);
    },
    [linesTotal, spawnPiece]
  );

  // Auto-drop timer
  useEffect(() => {
    if (!isPlaying) return;
    const interval = Math.max(100, INITIAL_DROP_INTERVAL - levelRef.current * 70);
    const id = setInterval(() => {
      const piece = currentPieceRef.current;
      if (!piece || gameStateRef.current !== 'playing') return;
      const movedDown: PieceType = { ...piece, y: piece.y + 1 };
      if (!checkCollision(movedDown, boardRef.current)) {
        setCurrentPiece(movedDown);
      } else {
        lockPiece(piece, boardRef.current, minesRef.current, levelRef.current);
      }
    }, interval);
    return () => clearInterval(id);
  }, [isPlaying, level, lockPiece]);

  const movePiece = useCallback(
    (direction: 'left' | 'right' | 'down') => {
      if (!currentPiece || isGameOver) return;
      const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
      const dy = direction === 'down' ? 1 : 0;
      const moved: PieceType = { ...currentPiece, x: currentPiece.x + dx, y: currentPiece.y + dy };
      if (!checkCollision(moved, board)) {
        setCurrentPiece(moved);
      } else if (direction === 'down') {
        lockPiece(currentPiece, board, mines, level);
      }
    },
    [currentPiece, board, mines, level, isGameOver, lockPiece]
  );

  const rotatePiece = useCallback(() => {
    if (!currentPiece || isGameOver) return;
    const rotated: PieceType = { ...currentPiece, shape: rotateCW(currentPiece.shape) };
    // Wall-kick: try original position, then shift ±1, ±2
    for (const kick of [0, 1, -1, 2, -2]) {
      const kicked: PieceType = { ...rotated, x: rotated.x + kick };
      if (!checkCollision(kicked, board)) {
        setCurrentPiece(kicked);
        return;
      }
    }
  }, [currentPiece, board, isGameOver]);

  const dropPiece = useCallback(() => {
    if (!currentPiece || isGameOver) return;
    let dropped = { ...currentPiece };
    while (!checkCollision({ ...dropped, y: dropped.y + 1 }, board)) {
      dropped = { ...dropped, y: dropped.y + 1 };
    }
    lockPiece(dropped, board, mines, level);
  }, [currentPiece, board, mines, level, isGameOver, lockPiece]);

  const startGame = useCallback(() => {
    const newBoard = createEmptyBoard();
    const newMines = generateMines();
    setBoard(newBoard);
    setMines(newMines);
    setScore(0);
    setLevel(0);
    setLinesTotal(0);
    setGameState('playing');
    spawnPiece(newBoard, PIECES[Math.floor(Math.random() * PIECES.length)]);
  }, [spawnPiece]);

  const resetGame = useCallback(() => {
    setGameState('idle');
    setBoard(createEmptyBoard());
    setCurrentPiece(null);
    setNextPieceShape(null);
    setMines(new Set());
    setScore(0);
    setLevel(0);
    setLinesTotal(0);
  }, []);

  return {
    gameState,
    score,
    level,
    linesTotal,
    isGameOver,
    currentPiece,
    nextPieceShape,
    board,
    mines,
    movePiece,
    rotatePiece,
    dropPiece,
    startGame,
    resetGame,
  };
};

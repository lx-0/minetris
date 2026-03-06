// Tetris pieces defined as [col, row] offsets from a center pivot.
// Using standard spawn orientations so rotation works correctly.
export const PIECES: number[][][] = [
  // I
  [[-1, 0], [0, 0], [1, 0], [2, 0]],
  // O
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  // T
  [[-1, 0], [0, 0], [1, 0], [0, 1]],
  // L
  [[-1, 0], [0, 0], [1, 0], [1, 1]],
  // J
  [[-1, 0], [0, 0], [1, 0], [-1, 1]],
  // S
  [[0, 0], [1, 0], [-1, 1], [0, 1]],
  // Z
  [[-1, 0], [0, 0], [0, 1], [1, 1]],
];

export const BOARD_COLS = 10;
export const BOARD_ROWS = 20;
export const MINE_COUNT = 20;

export const createEmptyBoard = (): number[][] =>
  Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(0));

/**
 * Generates mine positions as a Set of linear indices (row * BOARD_COLS + col).
 * Mines are placed only in the lower 3/4 of the board to give room at the top.
 */
export const generateMines = (): Set<number> => {
  const mines = new Set<number>();
  const startRow = Math.floor(BOARD_ROWS / 4);
  while (mines.size < MINE_COUNT) {
    const row = startRow + Math.floor(Math.random() * (BOARD_ROWS - startRow));
    const col = Math.floor(Math.random() * BOARD_COLS);
    mines.add(row * BOARD_COLS + col);
  }
  return mines;
};

/** Count mines in the 8 cells surrounding (row, col). */
export const countAdjacentMines = (
  row: number,
  col: number,
  mines: Set<number>
): number => {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < BOARD_ROWS && c >= 0 && c < BOARD_COLS) {
        if (mines.has(r * BOARD_COLS + c)) count++;
      }
    }
  }
  return count;
};

/**
 * Remove fully-filled rows and shift the board down.
 * Returns the new board and the number of lines cleared.
 */
export const clearLines = (
  board: number[][]
): { newBoard: number[][]; linesCleared: number } => {
  const remaining = board.filter((row) => row.some((cell) => cell === 0));
  const linesCleared = BOARD_ROWS - remaining.length;
  const emptyRows = Array.from({ length: linesCleared }, () =>
    Array(BOARD_COLS).fill(0)
  );
  return { newBoard: [...emptyRows, ...remaining], linesCleared };
};

/** Standard Tetris scoring: 100/300/500/800 * (level+1). */
export const calcScore = (lines: number, level: number): number => {
  const base = [0, 100, 300, 500, 800];
  return (base[Math.min(lines, 4)] ?? 0) * (level + 1);
};

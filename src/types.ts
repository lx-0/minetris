export type GameState = 'idle' | 'playing' | 'paused' | 'over';
export type BoardType = number[][];
export type PieceType = {
  shape: number[][];
  x: number;
  y: number;
};

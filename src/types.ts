export type GameState = 'idle' | 'playing' | 'over';
export type BoardType = number[][];
export type PieceType = {
  shape: number[][];
  x: number;
  y: number;
};

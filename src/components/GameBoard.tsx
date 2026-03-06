import React from 'react';
import { Cell } from './Cell';
import { GameState, BoardType, PieceType } from '../types';
import { BOARD_COLS } from '../utils/gameUtils';

interface GameBoardProps {
  board: BoardType;
  currentPiece: PieceType | null;
  mines: Set<number>;
  gameState: GameState;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  board,
  currentPiece,
  mines,
  gameState,
}) => {
  const isOver = gameState === 'over';

  return (
    <div className="grid gap-px bg-gray-700 p-px" style={{ gridTemplateColumns: `repeat(${BOARD_COLS}, 2rem)` }}>
      {board.map((row, y) =>
        row.map((cell, x) => {
          const isActive = !!currentPiece?.shape.some(
            ([dx, dy]) => x === currentPiece.x + dx && y === currentPiece.y + dy
          );
          return (
            <Cell
              key={`${x}-${y}`}
              value={cell}
              isActive={isActive}
              isMine={mines.has(y * BOARD_COLS + x)}
              isRevealed={isOver}
            />
          );
        })
      )}
    </div>
  );
};

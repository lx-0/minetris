import type { FC } from 'react';
import { Play, RotateCcw, Pause } from 'lucide-react';
import { GameState } from '../types';

interface GameControlsProps {
  onStart: () => void;
  onReset: () => void;
  onTogglePause: () => void;
  isGameOver: boolean;
  isPaused: boolean;
  gameState: GameState;
}

export const GameControls: FC<GameControlsProps> = ({
  onStart,
  onReset,
  onTogglePause,
  isPaused,
  gameState,
}) => {
  return (
    <div className="flex gap-4 flex-wrap">
      {gameState === 'idle' ? (
        <button
          onClick={onStart}
          className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700
            rounded-lg font-bold transition-colors"
        >
          <Play className="w-5 h-5" />
          Start Game
        </button>
      ) : (
        <>
          {(gameState === 'playing' || gameState === 'paused') && (
            <button
              onClick={onTogglePause}
              className="flex items-center gap-2 px-4 py-3 bg-yellow-600 hover:bg-yellow-700
                rounded-lg font-bold transition-colors"
            >
              {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
          )}
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-4 py-3 bg-gray-600 hover:bg-gray-700
              rounded-lg font-bold transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
            New Game
          </button>
        </>
      )}
    </div>
  );
};
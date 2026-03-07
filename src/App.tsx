import { useEffect, useCallback } from 'react';
import { GameBoard } from './components/GameBoard';
import { GameControls } from './components/GameControls';
import { NextPiecePanel } from './components/NextPiecePanel';
import { useGameState } from './hooks/useGameState';
import { Bomb, Skull, Trophy, Layers, TrendingUp } from 'lucide-react';
import { MINE_COUNT } from './utils/gameUtils';

function App() {
  const {
    gameState,
    score,
    level,
    linesTotal,
    isGameOver,
    isPaused,
    currentPiece,
    nextPieceShape,
    board,
    mines,
    movePiece,
    rotatePiece,
    dropPiece,
    startGame,
    resetGame,
    togglePause,
  } = useGameState();

  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (isGameOver) return;
      switch (event.key) {
        case 'p':
        case 'P':
          event.preventDefault();
          togglePause();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          movePiece('left');
          break;
        case 'ArrowRight':
          event.preventDefault();
          movePiece('right');
          break;
        case 'ArrowDown':
          event.preventDefault();
          movePiece('down');
          break;
        case 'ArrowUp':
          event.preventDefault();
          rotatePiece();
          break;
        case ' ':
          event.preventDefault();
          dropPiece();
          break;
      }
    },
    [isGameOver, togglePause, movePiece, rotatePiece, dropPiece]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 text-purple-400">MineTris</h1>
          <p className="text-gray-400">Where Minesweeper meets Tetris</p>
        </div>

        <div className="flex flex-col md:flex-row gap-8 justify-center items-start">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl relative">
            <GameBoard
              board={board}
              currentPiece={currentPiece}
              mines={mines}
              gameState={gameState}
            />
            {isPaused && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg backdrop-blur-sm bg-gray-900/70">
                <span className="text-3xl font-bold text-purple-400 tracking-widest">PAUSED</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-6 min-w-48">
            <NextPiecePanel shape={nextPieceShape} />

            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-2xl font-bold mb-4 text-purple-400">Stats</h2>
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Trophy className="text-yellow-400 w-4 h-4 shrink-0" />
                  <span>Score: <span className="font-bold">{score}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="text-green-400 w-4 h-4 shrink-0" />
                  <span>Level: <span className="font-bold">{level + 1}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <Layers className="text-blue-400 w-4 h-4 shrink-0" />
                  <span>Lines: <span className="font-bold">{linesTotal}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <Bomb className="text-red-400 w-4 h-4 shrink-0" />
                  <span>Mines: <span className="font-bold">{MINE_COUNT}</span></span>
                </div>
                {isGameOver && (
                  <div className="flex items-center gap-2 text-red-400 mt-1">
                    <Skull className="w-4 h-4 shrink-0" />
                    <span className="font-bold">Game Over!</span>
                  </div>
                )}
              </div>
            </div>

            <GameControls
              onStart={startGame}
              onReset={resetGame}
              onTogglePause={togglePause}
              isGameOver={isGameOver}
              isPaused={isPaused}
              gameState={gameState}
            />

            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-xl font-bold mb-3 text-purple-400">Controls</h2>
              <ul className="text-sm space-y-1 text-gray-300">
                <li><kbd className="bg-gray-700 px-1 rounded">← →</kbd> Move</li>
                <li><kbd className="bg-gray-700 px-1 rounded">↑</kbd> Rotate</li>
                <li><kbd className="bg-gray-700 px-1 rounded">↓</kbd> Soft drop</li>
                <li><kbd className="bg-gray-700 px-1 rounded">Space</kbd> Hard drop</li>
                <li><kbd className="bg-gray-700 px-1 rounded">P</kbd> Pause / Resume</li>
              </ul>
              <h2 className="text-xl font-bold mt-4 mb-2 text-purple-400">Tips</h2>
              <ul className="text-sm space-y-1 text-gray-300">
                <li>Numbers show adjacent mines</li>
                <li>Avoid landing on mines!</li>
                <li>Clear lines for points</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

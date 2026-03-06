import React from 'react';
import { Bomb } from 'lucide-react';

// Board cell values:
//   0  = empty
//   1-8 = locked piece cell with N adjacent mines
//   9  = locked piece cell with 0 adjacent mines
// Active piece cells are overlaid by the parent component.

// Classic Minesweeper number colors
const MINE_COUNT_COLORS: Record<number, string> = {
  1: 'text-blue-400',
  2: 'text-green-400',
  3: 'text-red-400',
  4: 'text-indigo-400',
  5: 'text-red-700',
  6: 'text-cyan-400',
  7: 'text-black',
  8: 'text-gray-400',
};

interface CellProps {
  value: number;
  isActive: boolean;
  isMine: boolean;
  isRevealed: boolean;
}

export const Cell: React.FC<CellProps> = ({ value, isActive, isMine, isRevealed }) => {
  const getBgColor = () => {
    if (isActive) return 'bg-purple-500';
    if (isRevealed && isMine) return 'bg-red-600';
    if (value === 0) return 'bg-gray-800';
    return 'bg-purple-800';
  };

  const getContent = () => {
    if (isRevealed && isMine) return <Bomb className="w-4 h-4 text-white" />;
    if (isActive) return null;
    // value 1-8: show adjacency number
    if (value >= 1 && value <= 8) {
      const colorClass = MINE_COUNT_COLORS[value] ?? 'text-white';
      return <span className={`text-xs font-bold ${colorClass}`}>{value}</span>;
    }
    // value 9: filled, no adjacent mines — no label
    return null;
  };

  return (
    <div
      className={`w-8 h-8 flex items-center justify-center ${getBgColor()} transition-colors duration-75`}
    >
      {getContent()}
    </div>
  );
};

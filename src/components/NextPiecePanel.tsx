const GRID_SIZE = 4;

interface NextPiecePanelProps {
  shape: number[][] | null;
}

export const NextPiecePanel = ({ shape }: NextPiecePanelProps) => {
  const cells = new Set<string>();

  if (shape) {
    const xs = shape.map(([x]) => x);
    const ys = shape.map(([, y]) => y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX + 1;
    const h = Math.max(...ys) - minY + 1;
    const offsetX = Math.floor((GRID_SIZE - w) / 2) - minX;
    const offsetY = Math.floor((GRID_SIZE - h) / 2) - minY;
    shape.forEach(([dx, dy]) => {
      cells.add(`${dx + offsetX},${dy + offsetY}`);
    });
  }

  return (
    <div className="bg-gray-800 p-6 rounded-lg">
      <h2 className="text-xl font-bold mb-3 text-purple-400">Next</h2>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1.5rem)` }}
      >
        {Array.from({ length: GRID_SIZE }, (_, row) =>
          Array.from({ length: GRID_SIZE }, (_, col) => (
            <div
              key={`${col},${row}`}
              className={`w-6 h-6 rounded-sm ${
                cells.has(`${col},${row}`) ? 'bg-purple-500' : 'bg-gray-700'
              }`}
            />
          ))
        )}
      </div>
    </div>
  );
};

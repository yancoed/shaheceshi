import { useStore } from '@/stores/sandbox';
import { GRID_ROWS, GRID_COLS, ENTRY, EXIT } from '@/lib/simulator';

const CELL = 28; // px
const PAD = 16;

export default function PickPath() {
  const result = useStore((s) => s.result);
  if (!result || result.picks.length === 0) {
    return (
      <div className="text-center text-ink-muted text-xs font-mono py-8">
        勾选「拣选路径」环节后，此处展示 SVG 路径动效
      </div>
    );
  }

  const pick = result.picks[0];
  const path = pick.path;
  if (path.length === 0) return <div className="text-ink-muted text-xs font-mono">无可视化路径</div>;

  const W = GRID_COLS * CELL + PAD * 2;
  const H = GRID_ROWS * CELL + PAD * 2;
  const toXY = (p: { row: number; col: number }) => ({
    x: PAD + p.col * CELL + CELL / 2,
    y: PAD + p.row * CELL + CELL / 2,
  });

  const d = path
    .map((p, i) => {
      const { x, y } = toXY(p);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-ink-secondary">单据 <span className="text-accent-amber">{pick.orderId}</span></span>
        <span className="text-ink-muted">{pick.distance} m · {pick.duration} min</span>
      </div>
      <div className="border border-bg-border bg-bg-base overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
          {/* 网格背景 */}
          <defs>
            <pattern id="grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
              <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" stroke="#1A2330" strokeWidth="0.5" />
            </pattern>
            <linearGradient id="pathGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#F4A300" />
              <stop offset="100%" stopColor="#FF5C7A" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={W} height={H} fill="url(#grid)" />

          {/* 库位节点 */}
          {path.map((p, i) => {
            const { x, y } = toXY(p);
            const isFirst = i === 0;
            const isLast = i === path.length - 1;
            const color = isFirst ? '#4DA3FF' : isLast ? '#22D3A4' : '#F4A300';
            return (
              <g key={i}>
                <rect x={x - 10} y={y - 10} width={20} height={20} fill="#10161D" stroke={color} strokeWidth="1.5" />
                <text x={x} y={y + 3} textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono" fill={color}>
                  {isFirst ? '▶' : isLast ? '◀' : i}
                </text>
              </g>
            );
          })}

          {/* 路径 */}
          <path
            d={d}
            fill="none"
            stroke="url(#pathGrad)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="path-draw"
          />

          {/* 起点/终点标签 */}
          <text x={PAD} y={H - 4} fontSize="8" fontFamily="JetBrains Mono" fill="#4DA3FF">ENTRY · {ENTRY.row},{ENTRY.col}</text>
          <text x={W - 80} y={H - 4} fontSize="8" fontFamily="JetBrains Mono" fill="#22D3A4">EXIT · {EXIT.row},{EXIT.col}</text>
        </svg>
      </div>
    </div>
  );
}

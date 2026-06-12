import { useStore } from '@/stores/sandbox';
import { GRID_ROWS, GRID_COLS } from '@/lib/mock';
import type { Zone } from '@/lib/types';
import type { Location } from '@/lib/types';
import { useMemo, useState } from 'react';
import { classNames } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';

const ZONE_COLORS: Record<Zone, { bg: string; border: string; label: string }> = {
  INBOUND:  { bg: 'bg-accent-blue/10',  border: 'border-accent-blue/40',  label: 'INBOUND' },
  STORAGE:  { bg: 'bg-bg-raised',       border: 'border-bg-border',       label: 'STORAGE' },
  PICK:     { bg: 'bg-accent-amber/5',  border: 'border-accent-amber/30', label: 'PICK' },
  OUTBOUND: { bg: 'bg-accent-green/10', border: 'border-accent-green/40', label: 'OUTBOUND' },
};

export default function LocationGrid() {
  const result = useStore((s) => s.result);
  const [hover, setHover] = useState<Location | null>(null);

  // 所有用过的库位
  const used = useMemo(() => {
    const m = new Map<string, { sku: string; distance?: number; orderId?: string }>();
    result?.assignments.forEach((a) => {
      const prev = m.get(a.locationId);
      m.set(a.locationId, { sku: a.skuId.replace('SKU-', ''), distance: a.distance, orderId: a.orderId });
      if (prev) m.set(a.locationId, { sku: `${prev.sku}/${a.skuId.replace('SKU-', '')}`, distance: a.distance, orderId: a.orderId });
    });
    return m;
  }, [result]);

  const picked = useMemo(() => {
    const s = new Set<string>();
    result?.picks.forEach((p) => p.path.forEach((l) => s.add(l.id)));
    return s;
  }, [result]);

  // 入口出口
  const entry = { row: 0, col: 0 };
  const exit = { row: GRID_ROWS - 1, col: GRID_COLS - 1 };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="label">库位网格 / GRID 12×8</div>
        <div className="flex items-center gap-2 text-[9px] font-mono">
          {Object.entries(ZONE_COLORS).map(([z, c]) => (
            <span key={z} className="flex items-center gap-1">
              <span className={`w-2 h-2 ${c.bg} ${c.border} border`} />
              <span className="text-ink-muted">{c.label}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="relative">
        <div
          className="grid gap-px bg-bg-border border border-bg-border"
          style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: GRID_ROWS * GRID_COLS }).map((_, i) => {
            const r = Math.floor(i / GRID_COLS);
            const c = i % GRID_COLS;
            const locId = `L${String(r).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
            const isEntry = r === entry.row && c === entry.col;
            const isExit = r === exit.row && c === exit.col;
            // 简单分区判定
            const zone: Zone = c < 2 ? 'INBOUND' : c < 8 ? 'STORAGE' : c < 10 ? 'PICK' : 'OUTBOUND';
            const zc = ZONE_COLORS[zone];
            const usedLoc = used.get(locId);
            const isPicked = picked.has(locId);
            return (
              <div
                key={locId}
                onMouseEnter={() => setHover({ id: locId, warehouseId: '', zone, row: r, col: c, capacity: zone === 'STORAGE' ? 100 : 50, occupied: 0 } as Location)}
                onMouseLeave={() => setHover(null)}
                className={classNames(
                  'aspect-square flex flex-col items-center justify-center text-[8px] font-mono leading-none p-0.5 transition-colors',
                  zc.bg,
                  isPicked ? 'ring-1 ring-accent-amber/80 cell-flash' : '',
                )}
              >
                {isEntry ? (
                  <span className="text-accent-blue font-bold">▶ ENTRY</span>
                ) : isExit ? (
                  <span className="text-accent-green font-bold">EXIT ◀</span>
                ) : usedLoc ? (
                  <>
                    <span className="text-accent-amber font-bold">{usedLoc.sku}</span>
                    {usedLoc.distance !== undefined && (
                      <span className="text-ink-muted text-[7px]">{usedLoc.distance}m</span>
                    )}
                  </>
                ) : (
                  <span className="text-ink-muted/30">{locId}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {hover && (
        <div className="text-[10px] font-mono text-ink-secondary border-t border-bg-border pt-2 flex items-center gap-3">
          <span>位置 <span className="text-accent-amber">{hover.id}</span></span>
          <span>区 <span className="text-ink-primary">{ZONE_COLORS[hover.zone].label}</span></span>
          <span>行 {hover.row} · 列 {hover.col}</span>
        </div>
      )}
      <div className="text-[10px] font-mono text-ink-muted leading-relaxed border-t border-bg-border pt-2">
        <div>▸ 黄色 SKU 编号 = 沙盒新分配</div>
        <div>▸ 黄色高亮 = 拣选路径经过的库位</div>
      </div>
    </div>
  );
}

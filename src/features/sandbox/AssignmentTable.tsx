import { useStore, useCurrentScenario } from '@/stores/sandbox';
import { ArrowRight, MapPin, Package } from 'lucide-react';

export default function AssignmentTable() {
  const result = useStore((s) => s.result);
  const scenario = useCurrentScenario();
  if (!result) {
    return (
      <div className="text-center text-ink-muted text-xs font-mono py-8">
        等待模拟结果...
      </div>
    );
  }
  const list = result.assignments;
  if (list.length === 0) {
    return <div className="text-center text-ink-muted text-xs font-mono py-8">未执行分配环节</div>;
  }
  // 解析 allocate 节点输出里的目标设备（用于列头提示）
  const allocPayload = result.trace.find(
    (e) => e.status === 'done' && e.payload && (e.payload as { bound?: boolean }).bound !== undefined
      && (e.payload as { strategy?: string }).strategy,
  )?.payload as { bound?: boolean; targetMatched?: { id: string; name: string; kind: string }[] } | undefined;
  const bound = allocPayload?.bound && (allocPayload.targetMatched?.length ?? 0) > 0;

  // 库位 → 设备 反查表（货架用 row/cell 映射）
  const stage = scenario?.stage;
  const locToDevice = new Map<string, { id: string; name: string; kind: string }>();
  if (stage) {
    for (const d of stage.devices) {
      if (d.kind === 'shelf' && d.shelfRow != null && d.shelfCell != null) {
        const locId = `L${String(d.shelfRow - 1).padStart(2, '0')}-${String(d.shelfCell - 1).padStart(2, '0')}`;
        locToDevice.set(locId, { id: d.id, name: d.name, kind: d.kind });
      }
    }
  }

  return (
    <div className="overflow-y-auto h-full">
      {bound && (
        <div className="mb-2 px-2 py-1.5 border border-accent-green/40 bg-accent-green/5 text-[10px] font-mono text-accent-green flex items-center gap-1.5">
          <Package size={10} />
          分配节点已绑定 {allocPayload!.targetMatched!.length} 个库位
          <span className="text-ink-muted ml-1 truncate">
            ({allocPayload!.targetMatched!.map((d) => d.name).slice(0, 4).join(', ')}{allocPayload!.targetMatched!.length > 4 ? '...' : ''})
          </span>
        </div>
      )}
      <table className="w-full text-[11px] font-mono">
        <thead className="sticky top-0 bg-bg-raised text-ink-secondary">
          <tr className="border-b border-bg-border">
            <th className="text-left px-2 py-1.5">订单</th>
            <th className="text-left px-2 py-1.5">SKU</th>
            <th className="text-left px-2 py-1.5">容器</th>
            <th className="text-left px-2 py-1.5"></th>
            <th className="text-left px-2 py-1.5">库位</th>
            <th className="text-left px-2 py-1.5">设备</th>
            <th className="text-right px-2 py-1.5">距离</th>
          </tr>
        </thead>
        <tbody>
          {list.slice(0, 60).map((a, i) => {
            const dev = locToDevice.get(a.locationId);
            return (
              <tr key={i} className="border-b border-bg-border/40 hover:bg-bg-raised/40">
                <td className="px-2 py-1 text-ink-secondary">{a.orderId}</td>
                <td className="px-2 py-1 text-ink-primary">{a.skuId.replace('SKU-', '')}</td>
                <td className="px-2 py-1 text-accent-amber">{a.container}</td>
                <td className="px-2 py-1 text-ink-muted">
                  <ArrowRight size={10} className="inline" />
                </td>
                <td className="px-2 py-1">
                  <span className="inline-flex items-center gap-1 text-accent-green">
                    <MapPin size={10} />
                    {a.locationId}
                  </span>
                </td>
                <td className="px-2 py-1 text-ink-secondary truncate max-w-[140px]" title={dev?.id}>
                  {dev ? (
                    <span className="text-accent-amber">{dev.name}</span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td className="px-2 py-1 text-right text-ink-secondary num">{a.distance}m</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {list.length > 60 && (
        <div className="text-center text-[10px] text-ink-muted font-mono py-2">
          显示前 60 / 共 {list.length} 条
        </div>
      )}
    </div>
  );
}

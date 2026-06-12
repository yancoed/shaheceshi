import { useStore, useCurrentScenario } from '@/stores/sandbox';
import { ArrowRight, MapPin, Package, Truck, Warehouse, CheckCircle2, Circle } from 'lucide-react';

export default function OutboundPathTable() {
  const result = useStore((s) => s.result);
  const scenario = useCurrentScenario();
  if (!result) {
    return (
      <div className="text-center text-ink-muted text-xs font-mono py-8">
        等待模拟结果...
      </div>
    );
  }

  const allocs = result.outboundAllocations ?? [];
  const cartByContainer = new Map<string, NonNullable<typeof result.cartonizations>[number]>();
  for (const c of result.cartonizations ?? []) cartByContainer.set(c.containerNo, c);
  const agvByCarton = new Map<string, NonNullable<typeof result.agvDeliveries>[number]>();
  for (const d of result.agvDeliveries ?? []) agvByCarton.set(d.cartonId, d);
  // 库位 → 设备 名（用于显示货架行号）
  const stage = scenario?.stage;
  const locName = new Map<string, string>();
  if (stage) {
    for (const d of stage.devices) {
      if (d.kind === 'shelf' && d.shelfRow != null && d.shelfCell != null) {
        const locId = `L${String(d.shelfRow - 1).padStart(2, '0')}-${String(d.shelfCell - 1).padStart(2, '0')}`;
        locName.set(locId, d.name);
      }
    }
  }

  if (allocs.length === 0) {
    return (
      <div className="text-center text-ink-muted text-xs font-mono py-8 space-y-2">
        <div>未执行出库分配</div>
        <div className="text-[10px] text-ink-muted">请运行「出库·分配」节点后查看</div>
      </div>
    );
  }

  // 统计：按容器分组，统计每个容器内多少分配
  const byContainer = new Map<string, typeof allocs[number][]>();
  for (const a of allocs) {
    if (!a.containerNo) continue;
    if (!byContainer.has(a.containerNo)) byContainer.set(a.containerNo, []);
    byContainer.get(a.containerNo)!.push(a);
  }

  return (
    <div className="overflow-y-auto h-full space-y-3">
      {/* 汇总卡片 */}
      <div className="grid grid-cols-4 gap-1.5">
        <Stat label="分配行"  value={allocs.length}                       color="amber" />
        <Stat label="已下架"  value={allocs.filter(a => a.downAt).length} color="green" />
        <Stat label="托盘数"  value={byContainer.size}                   color="blue" />
        <Stat label="月台数"  value={new Set(allocs.filter(a => a.dockId).map(a => a.dockId)).size} color="green" />
      </div>

      {/* 出库分配明细 */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-ink-muted mb-1.5 flex items-center gap-1">
          <Package size={10} className="text-accent-amber" />
          出库分配 · {allocs.length} 行
        </div>
        <table className="w-full text-[10px] font-mono">
          <thead className="sticky top-0 bg-bg-raised text-ink-secondary z-10">
            <tr className="border-b border-bg-border">
              <th className="text-left  px-1.5 py-1">订单</th>
              <th className="text-left  px-1.5 py-1">SKU</th>
              <th className="text-left  px-1.5 py-1">库位</th>
              <th className="text-left  px-1.5 py-1">→ 工位</th>
              <th className="text-left  px-1.5 py-1">→ 容器</th>
              <th className="text-left  px-1.5 py-1">→ 月台</th>
              <th className="text-left  px-1.5 py-1">状态</th>
            </tr>
          </thead>
          <tbody>
            {allocs.slice(0, 80).map((a, i) => {
              const cart = a.containerNo ? cartByContainer.get(a.containerNo) : undefined;
              const agv  = cart ? agvByCarton.get(cart.id) : undefined;
              const down = !!a.downAt;
              return (
                <tr key={i} className="border-b border-bg-border/40 hover:bg-bg-raised/40">
                  <td className="px-1.5 py-1 text-ink-secondary">{a.orderId}</td>
                  <td className="px-1.5 py-1 text-ink-primary">{a.skuId.replace('SKU-', '')}</td>
                  <td className="px-1.5 py-1">
                    <span className="inline-flex items-center gap-1 text-accent-green">
                      <MapPin size={9} />
                      {a.locationId}
                    </span>
                  </td>
                  <td className="px-1.5 py-1 text-accent-amber">
                    {a.stationName ?? <span className="text-ink-muted">—</span>}
                  </td>
                  <td className="px-1.5 py-1 text-accent-amber">
                    {a.containerNo ?? <span className="text-ink-muted">—</span>}
                  </td>
                  <td className="px-1.5 py-1">
                    {a.dockName
                      ? <span className="inline-flex items-center gap-1 text-accent-green">
                          <Truck size={9} />{a.dockName}
                        </span>
                      : <span className="text-ink-muted">—</span>}
                  </td>
                  <td className="px-1.5 py-1">
                    {down
                      ? <span className="inline-flex items-center gap-1 text-accent-green"><CheckCircle2 size={10} />已下架</span>
                      : <span className="inline-flex items-center gap-1 text-ink-muted"><Circle size={10} />已分配</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {allocs.length > 80 && (
          <div className="text-[10px] text-ink-muted text-center py-2">
            · 仅显示前 80 行 / 总 {allocs.length} 行 ·
          </div>
        )}
      </div>

      {/* 容器汇总 */}
      {byContainer.size > 0 && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-ink-muted mb-1.5 flex items-center gap-1">
            <Warehouse size={10} className="text-accent-amber" />
            托盘汇总 · {byContainer.size} 个容器
          </div>
          <div className="space-y-1">
            {Array.from(byContainer.entries()).map(([ctr, items], i) => {
              const cart = cartByContainer.get(ctr);
              const agv  = cart ? agvByCarton.get(cart.id) : undefined;
              return (
                <div key={i} className="border border-bg-border/60 bg-bg-base/30 p-1.5 text-[10px] font-mono">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-accent-amber font-bold">{ctr}</span>
                    <ArrowRight size={9} className="text-ink-muted" />
                    {cart?.stationName && (
                      <span className="text-accent-amber">{cart.stationName}</span>
                    )}
                    <ArrowRight size={9} className="text-ink-muted" />
                    {cart?.dockName
                      ? <span className="text-accent-green inline-flex items-center gap-1"><Truck size={9} />{cart.dockName}</span>
                      : <span className="text-ink-muted">未派车</span>}
                    {agv && <span className="text-ink-muted">· {agv.agvId}</span>}
                    <span className="ml-auto text-ink-muted">{items.length} 行 · 容量 {Math.round((cart?.capacityUsed ?? 0) * 100)}%</span>
                  </div>
                  {cart && (
                    <div className="text-ink-muted text-[9px] mt-0.5 truncate">
                      {cart.sourceOrderIds.join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 出库单（context） */}
      {result.pickOrders && result.pickOrders.length > 0 && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-ink-muted mb-1.5">
            出库单 · {result.pickOrders.length} 个
          </div>
          <div className="space-y-1">
            {result.pickOrders.map((o) => (
              <div key={o.id} className="text-[10px] font-mono border border-bg-border/40 px-1.5 py-1 flex items-center gap-2">
                <span className="text-ink-primary font-bold">{o.id}</span>
                <span className="text-ink-muted">{o.lines.length} 行</span>
                <span className="ml-auto text-ink-muted">{o.lines.reduce((s, l) => s + l.qty, 0)} 件</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: 'amber' | 'green' | 'blue' }) {
  const c = color === 'amber' ? 'text-accent-amber' : color === 'green' ? 'text-accent-green' : 'text-accent-blue';
  return (
    <div className="border border-bg-border/60 bg-bg-base/30 px-2 py-1.5">
      <div className="text-[9px] font-mono uppercase tracking-widest text-ink-muted">{label}</div>
      <div className={`text-base font-mono font-bold num ${c}`}>{value}</div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import type { Widget, WidgetKind, DataBinding, DataSourceId, AggFn, ChartType } from '@/lib/types';
import { X, Wand2 } from 'lucide-react';

const SOURCES: { id: DataSourceId; name: string; fields: string[] }[] = [
  { id: 'orders',         name: '入库单 / Orders',         fields: ['lines', 'id', 'type'] },
  { id: 'pickOrders',     name: '出库单 / PickOrders',     fields: ['lines', 'id', 'type'] },
  { id: 'inventory',      name: '库存 / Inventory',        fields: ['qty', 'skuId', 'locationId', 'batch'] },
  { id: 'assignments',    name: '分配行 / Assignments',    fields: ['orderId', 'skuId', 'locationId', 'container', 'distance'] },
  { id: 'picks',          name: '拣选 / Picks',            fields: ['orderId', 'distance', 'duration'] },
  { id: 'replenish',      name: '补货 / Replenish',        fields: ['skuId', 'locationId', 'current', 'threshold', 'suggested'] },
  { id: 'trace',          name: '节点 Trace',              fields: ['nodeId', 'nodeName', 'status', 'durationMs'] },
  { id: 'metrics',        name: '汇总指标 / Metrics',      fields: ['utilization', 'pickDistance', 'pickTime', 'anomalies', 'ordersCount', 'pickOrdersCount', 'assignmentsCount', 'apiCallsCount', 'apiSuccessCount'] },
  { id: 'stage',          name: '★ 舞台设备（全部）',      fields: ['kind', 'status', 'name', 'taskNumber', 'commandNumber', 'hasAnomaly'] },
  { id: 'stageDevices',   name: '★ 舞台设备（按类型过滤）', fields: ['kind', 'status', 'name', 'taskNumber', 'hasAnomaly'] },
  { id: 'deviceResults',  name: '★ 设备结果（本轮仿真）',  fields: ['deviceName', 'deviceKind', 'status', 'taskNumber', 'currentCommand', 'barcode', 'anomaly'] },
];

const KINDS: { id: WidgetKind; name: string; desc: string }[] = [
  { id: 'kpi',           name: 'KPI 数字卡', desc: '一个数字 + 描述' },
  { id: 'table',         name: '数据表格',  desc: '列出前 30 行' },
  { id: 'chart',         name: '柱状/饼图', desc: '按某字段分组统计' },
  { id: 'map',           name: '库位地图',  desc: '2D 仓库平面图' },
  { id: 'equipment',     name: 'WCS 设备',  desc: '输送线 / AGV 状态' },
  { id: 'deviceResult',  name: '设备结果',  desc: '按舞台设备组织的任务/指令/异常' },
];

const SIZE_PRESETS: { w: 1 | 2 | 3; h: 1 | 2 | 3; label: string }[] = [
  { w: 1, h: 1, label: '1×1 小卡' },
  { w: 2, h: 1, label: '2×1 横条' },
  { w: 1, h: 2, label: '1×2 竖条' },
  { w: 2, h: 2, label: '2×2 中块' },
  { w: 3, h: 1, label: '3×1 通栏' },
  { w: 3, h: 2, label: '3×2 大块' },
  { w: 3, h: 3, label: '3×3 巨块' },
];

export default function WidgetConfigDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: Widget | null;
  onSave: (w: Widget) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<WidgetKind>(initial?.kind ?? 'kpi');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [size, setSize] = useState<{ w: 1 | 2 | 3; h: 1 | 2 | 3 }>(initial?.size ?? { w: 1, h: 1 });
  const [binding, setBinding] = useState<DataBinding>(initial?.binding ?? { source: 'orders', agg: 'count' });
  const [chartType, setChartType] = useState<ChartType>(initial?.chartType ?? 'bar');

  // 切换数据源时清掉无效的字段绑定
  useEffect(() => {
    const src = SOURCES.find((s) => s.id === binding.source);
    if (!src) return;
    if (binding.field && !src.fields.includes(binding.field)) {
      setBinding((b) => ({ ...b, field: undefined, groupBy: undefined }));
    }
  }, [binding.source]);

  const srcFields = SOURCES.find((s) => s.id === binding.source)?.fields ?? [];

  const handleSave = () => {
    if (!title.trim()) {
      // 自动用类型名 + 源生成默认标题
      setTitle(`${KINDS.find((k) => k.id === kind)?.name ?? kind} · ${SOURCES.find((s) => s.id === binding.source)?.name.split(' / ')[0]}`);
      return;
    }
    const w: Widget = {
      id: initial?.id ?? `w-${Math.random().toString(36).slice(2, 8)}`,
      kind, title: title.trim(), size, binding,
      chartType: kind === 'chart' ? chartType : undefined,
    };
    onSave(w);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-bg-panel border border-bg-border w-[520px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-bg-border bg-bg-raised/40">
          <div className="flex items-center gap-2">
            <Wand2 size={13} className="text-accent-amber" />
            <span className="font-mono text-[11px] text-ink-primary uppercase tracking-widest">
              {initial ? '编辑块' : '添加块'} / {initial ? 'EDIT WIDGET' : 'ADD WIDGET'}
            </span>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-accent-red"><X size={14} /></button>
        </div>

        <div className="p-4 space-y-4 text-[11px]">
          {/* 类型 */}
          <div>
            <div className="label mb-1.5">块类型 / KIND</div>
            <div className="grid grid-cols-3 gap-1">
              {KINDS.map((k) => (
                <button key={k.id} onClick={() => setKind(k.id)}
                  className={`px-2 py-1.5 text-left border ${kind === k.id ? 'border-accent-amber bg-accent-amber/5' : 'border-bg-border bg-bg-base'}`}>
                  <div className="text-[11px] font-mono">{k.name}</div>
                  <div className="text-[9px] text-ink-muted">{k.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 标题 */}
          <div>
            <div className="label mb-1.5">标题 / TITLE</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：今日入库单数"
              className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] focus:outline-none focus:border-accent-amber/60" />
          </div>

          {/* 尺寸 */}
          <div>
            <div className="label mb-1.5">尺寸 / SIZE（3 列网格中的跨格数）</div>
            <div className="grid grid-cols-4 gap-1">
              {SIZE_PRESETS.map((p) => (
                <button key={p.label} onClick={() => setSize({ w: p.w, h: p.h })}
                  className={`px-2 py-1 border ${size.w === p.w && size.h === p.h ? 'border-accent-amber bg-accent-amber/5' : 'border-bg-border bg-bg-base'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 数据源 */}
          <div className="border-t border-bg-border pt-3 space-y-3">
            <div className="label flex items-center gap-1">数据源绑定 / DATA BINDING</div>

            <div>
              <div className="text-ink-muted text-[10px] mb-1">源 / SOURCE</div>
              <select value={binding.source} onChange={(e) => setBinding((b) => ({ ...b, source: e.target.value as DataSourceId }))}
                className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] focus:outline-none">
                {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {binding.source === 'stageDevices' && (
              <div>
                <div className="text-ink-muted text-[10px] mb-1">设备类型 / DEVICE KIND</div>
                <div className="grid grid-cols-4 gap-1">
                  {(['dock', 'station', 'shelf', 'zone'] as const).map((k) => (
                    <button key={k} onClick={() => setBinding((b) => ({ ...b, deviceKindFilter: k }))}
                      className={`px-2 py-1 border ${binding.deviceKindFilter === k ? 'border-accent-amber bg-accent-amber/5' : 'border-bg-border bg-bg-base'}`}>
                      {({ dock: '月台', station: '工位', shelf: '库位', zone: '区域' } as Record<string, string>)[k]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {binding.source === 'deviceResults' && (
              <>
                <div>
                  <div className="text-ink-muted text-[10px] mb-1">设备类型 / DEVICE KIND（可只显示某种设备的运行结果）</div>
                  <div className="grid grid-cols-4 gap-1">
                    {(['dock', 'station', 'shelf', 'zone', 'agv', 'conveyor', 'stack', 'lift'] as const).map((k) => (
                      <button key={k} onClick={() => setBinding((b) => ({ ...b, resultDeviceKind: b.resultDeviceKind === k ? undefined : k }))}
                        className={`px-2 py-1 border ${binding.resultDeviceKind === k ? 'border-accent-amber bg-accent-amber/5' : 'border-bg-border bg-bg-base'}`}>
                        {({ dock: '月台', station: '工位', shelf: '货架', zone: '区域', agv: 'AGV', conveyor: '输送线', stack: '堆垛机', lift: '提升机' } as Record<string, string>)[k]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-ink-muted text-[10px] mb-1">状态过滤 / STATUS FILTER</div>
                  <div className="grid grid-cols-5 gap-1">
                    {(['all', 'running', 'idle', 'with-task', 'with-anomaly'] as const).map((k) => (
                      <button key={k} onClick={() => setBinding((b) => ({ ...b, resultStatusFilter: k }))}
                        className={`px-2 py-1 border ${(binding.resultStatusFilter ?? 'all') === k ? 'border-accent-amber bg-accent-amber/5' : 'border-bg-border bg-bg-base'}`}>
                        {({ all: '全部', running: '运行中', idle: '空闲', 'with-task': '有任务', 'with-anomaly': '有异常' } as Record<string, string>)[k]}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {kind === 'kpi' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-ink-muted text-[10px] mb-1">聚合 / AGG</div>
                    <select value={binding.agg ?? 'count'} onChange={(e) => setBinding((b) => ({ ...b, agg: e.target.value as AggFn }))}
                      className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] focus:outline-none">
                      <option value="count">count（总数）</option>
                      <option value="unique">unique（去重数）</option>
                      <option value="sum">sum（求和）</option>
                      <option value="avg">avg（平均）</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-ink-muted text-[10px] mb-1">字段 / FIELD {binding.agg === 'count' || !binding.agg ? '（可选）' : ''}</div>
                    <select value={binding.field ?? ''} onChange={(e) => setBinding((b) => ({ ...b, field: e.target.value || undefined }))}
                      className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] focus:outline-none" disabled={!binding.agg || binding.agg === 'count'}>
                      <option value="">— 任意 —</option>
                      {srcFields.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div className="text-ink-muted text-[10px] mb-1">分组预览 / GROUP BY（可选，KPI 下方会展示前 4 个分组的明细）</div>
                  <select value={binding.groupBy ?? ''} onChange={(e) => setBinding((b) => ({ ...b, groupBy: e.target.value || undefined }))}
                    className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] focus:outline-none">
                    <option value="">— 不分组 —</option>
                    {srcFields.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </>
            )}

            {kind === 'chart' && (
              <>
                <div>
                  <div className="text-ink-muted text-[10px] mb-1">分组字段 / GROUP BY（必填）</div>
                  <select value={binding.groupBy ?? ''} onChange={(e) => setBinding((b) => ({ ...b, groupBy: e.target.value || undefined }))}
                    className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] focus:outline-none">
                    <option value="">— 选择字段 —</option>
                    {srcFields.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-ink-muted text-[10px] mb-1">图表类型</div>
                  <div className="grid grid-cols-2 gap-1">
                    <button onClick={() => setChartType('bar')} className={`px-2 py-1 border ${chartType === 'bar' ? 'border-accent-amber bg-accent-amber/5' : 'border-bg-border bg-bg-base'}`}>柱状图</button>
                    <button onClick={() => setChartType('pie')} className={`px-2 py-1 border ${chartType === 'pie' ? 'border-accent-amber bg-accent-amber/5' : 'border-bg-border bg-bg-base'}`}>饼图</button>
                  </div>
                </div>
              </>
            )}

            {kind === 'map' && (
              <div>
                <div className="text-ink-muted text-[10px] mb-1">上色模式 / MAP MODE</div>
                <div className="grid grid-cols-4 gap-1">
                  {([['zone', '按库区'], ['abc', '按 ABC'], ['qty', '按数量'], ['status', '按状态']] as const).map(([k, n]) => (
                    <button key={k} onClick={() => setBinding((b) => ({ ...b, mapMode: k }))}
                      className={`px-2 py-1 border ${binding.mapMode === k ? 'border-accent-amber bg-accent-amber/5' : 'border-bg-border bg-bg-base'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {kind === 'equipment' && (
              <div>
                <div className="text-ink-muted text-[10px] mb-1">设备类型 / EQUIPMENT KIND</div>
                <div className="grid grid-cols-3 gap-1">
                  {(['all', 'conveyor', 'agv'] as const).map((k) => (
                    <button key={k} onClick={() => setBinding((b) => ({ ...b, equipmentKind: k }))}
                      className={`px-2 py-1 border ${binding.equipmentKind === k ? 'border-accent-amber bg-accent-amber/5' : 'border-bg-border bg-bg-base'}`}>
                      {({ all: '全部', conveyor: '输送线', agv: 'AGV' } as Record<string, string>)[k]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-bg-border bg-bg-raised/40">
          <button onClick={onClose} className="px-3 py-1.5 text-[11px] text-ink-muted hover:text-ink-primary">取消</button>
          <button onClick={handleSave} className="px-3 py-1.5 text-[11px] bg-accent-amber text-bg-base hover:opacity-90 font-mono">
            {initial ? '保存' : '添加'}
          </button>
        </div>
      </div>
    </div>
  );
}

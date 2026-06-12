import { useState } from 'react';
import { useStore } from '@/stores/sandbox';
import type { Widget, WidgetKind } from '@/lib/types';
import { Plus, Settings, Trash2, Copy, Edit3, ChevronLeft, ChevronRight, LayoutDashboard, ArrowLeft, Cpu, Layers } from 'lucide-react';
import WidgetConfigDialog from '@/features/dashboard/WidgetConfigDialog';
import { KpiWidget, TableWidget, ChartWidget, MapWidget, EquipmentWidget, DeviceResultBlockWidget, DeviceMapWidget, DeviceResultWidget } from '@/features/dashboard/Widgets';

// 块级宽高（rem）：w=1 → 1 个最小列；基础按 12 列，w=2 占 2/3，w=3 占满
function sizeCols(w: 1 | 2 | 3): string {
  return { 1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3' }[w];
}
function sizeRows(h: 1 | 2 | 3): string {
  return { 1: 'row-span-1', 2: 'row-span-2', 3: 'row-span-3' }[h];
}

const KIND_BADGE: Record<WidgetKind, string> = {
  kpi: 'chip-amber', table: 'chip', chart: 'chip-green', map: 'chip-blue', equipment: 'chip-green', deviceResult: 'chip-amber',
};
const KIND_LABEL: Record<WidgetKind, string> = {
  kpi: 'KPI', table: 'TABLE', chart: 'CHART', map: 'MAP', equipment: 'WCS', deviceResult: '设备',
};

type DashView = 'classic' | 'devices';

/** 设备视图：把舞台画布的 1:1 缩略图 + 选中设备的结果详情放在一起 */
function DeviceView({ stage, result, onEdit }: { stage: NonNullable<NonNullable<ReturnType<typeof useStore.getState>['scenarios'][number]>['stage']>; result: ReturnType<typeof useStore.getState>['result']; onEdit: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(stage.devices[0]?.id ?? null);
  const dev = stage.devices.find((d) => d.id === selectedId) ?? null;
  const devResult = result?.stageDeviceResults?.[selectedId ?? ''];
  return (
    <div className="flex-1 grid grid-cols-[minmax(0,1fr)_280px] gap-2 p-2 min-h-0">
      <div className="border border-bg-border bg-bg-panel/40 flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-bg-border bg-bg-raised/40">
          <Layers size={11} className="text-accent-amber" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">舞台 / STAGE</span>
          <span className="text-[9px] text-ink-muted font-mono">· {stage.devices.length} 设备</span>
          <span className="text-[9px] text-ink-muted font-mono">· {stage.shelves.length} 排</span>
          <span className="ml-auto text-[9px] text-ink-muted font-mono">· 跟舞台画布 1:1 同步 · 点设备看结果</span>
        </div>
        <DeviceMapWidget stage={stage} result={result} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="border border-bg-border bg-bg-panel/40 flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-bg-border bg-bg-raised/40">
          <Cpu size={11} className="text-accent-amber" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">设备结果 / DEVICE RESULT</span>
          <span className="text-[9px] text-ink-muted font-mono">· {dev ? dev.name : '未选'}</span>
        </div>
        <DeviceResultWidget device={dev} result={devResult} onEdit={onEdit} />
      </div>
    </div>
  );
}

export default function DashboardPage({ onBack, defaultView = 'classic' }: { onBack?: () => void; defaultView?: DashView }) {
  const dashboards = useStore((s) => s.dashboards);
  const currentId = useStore((s) => s.currentDashboardId);
  const setCurrent = useStore((s) => s.setCurrentDashboard);
  const addDashboard = useStore((s) => s.addDashboard);
  const updateDashboard = useStore((s) => s.updateDashboard);
  const deleteDashboard = useStore((s) => s.deleteDashboard);
  const duplicateDashboard = useStore((s) => s.duplicateDashboard);
  const addWidget = useStore((s) => s.addWidget);
  const updateWidget = useStore((s) => s.updateWidget);
  const deleteWidget = useStore((s) => s.deleteWidget);
  const moveWidget = useStore((s) => s.moveWidget);
  const result = useStore((s) => s.result);
  const scenarios = useStore((s) => s.scenarios);
  const currentScenarioId = useStore((s) => s.currentScenarioId);
  const currentScenario = scenarios.find((s) => s.id === currentScenarioId) ?? scenarios[0];
  const stageDevices = currentScenario?.stage?.devices ?? [];

  const current = dashboards.find((d) => d.id === currentId) ?? dashboards[0];
  const [editing, setEditing] = useState<Widget | null>(null);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<DashView>(defaultView);

  if (!current) {
    return (
      <div className="h-full grid place-items-center text-ink-muted">
        <div className="text-center">
          <LayoutDashboard size={32} className="mx-auto mb-2 opacity-50" />
          <div>暂无看板</div>
          <button onClick={() => {
            const t = Date.now();
            addDashboard({ id: `dsb-${Math.random().toString(36).slice(2, 8)}`, name: '新看板 · 1', widgets: [], createdAt: t, updatedAt: t });
          }} className="mt-3 px-3 py-1.5 text-[11px] bg-accent-amber text-bg-base">新建看板</button>
        </div>
      </div>
    );
  }

  const isEmpty = current.widgets.length === 0;

  return (
    <div className="h-full flex flex-col bg-bg-base">
      {/* 顶部：看板选择 / 操作 */}
      <div className="border-b border-bg-border bg-bg-panel/60 px-4 py-2.5 flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="w-7 h-7 grid place-items-center text-ink-muted hover:text-accent-amber" title="返回"><ArrowLeft size={13} /></button>
        )}
        <LayoutDashboard size={14} className="text-accent-amber" />
        <select value={current.id} onChange={(e) => setCurrent(e.target.value)} className="bg-bg-base border border-bg-border px-2 py-1 text-[12px] focus:outline-none">
          {dashboards.map((d) => <option key={d.id} value={d.id}>{d.name} {d.builtin ? '· 内置' : ''}</option>)}
        </select>
        <input
          value={current.name}
          onChange={(e) => updateDashboard(current.id, { name: e.target.value })}
          className="bg-transparent border-b border-transparent hover:border-bg-border focus:border-accent-amber px-1 text-[11px] text-ink-muted font-mono focus:outline-none min-w-[12ch]"
        />
        <span className="text-[10px] text-ink-muted font-mono">{current.widgets.length} BLOCKS</span>
        {/* 视图切换：经典块 / 设备视图 */}
        <div className="ml-3 flex items-center border border-bg-border bg-bg-base">
          <button
            onClick={() => setView('classic')}
            className={`px-2 py-1 text-[10px] font-mono flex items-center gap-1 ${view === 'classic' ? 'bg-accent-amber/10 text-accent-amber' : 'text-ink-muted hover:text-ink-primary'}`}
            title="经典块状看板"
          >
            <LayoutDashboard size={10} /> 块状
          </button>
          <button
            onClick={() => setView('devices')}
            className={`px-2 py-1 text-[10px] font-mono flex items-center gap-1 border-l border-bg-border ${view === 'devices' ? 'bg-accent-amber/10 text-accent-amber' : 'text-ink-muted hover:text-ink-primary'}`}
            title="按舞台设备组织的结果视图（跟舞台 1:1 同步）"
          >
            <Layers size={10} /> 设备视图
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => duplicateDashboard(current.id)}
            className="px-2 py-1 text-[10px] text-ink-muted hover:text-accent-amber flex items-center gap-1"
            title="复制当前看板为副本"
          >
            <Copy size={11} /> 复制
          </button>
          <button
            onClick={() => {
              if (confirm(`删除看板「${current.name}」？`)) deleteDashboard(current.id);
            }}
            disabled={dashboards.length <= 1}
            className="px-2 py-1 text-[10px] text-ink-muted hover:text-accent-red flex items-center gap-1 disabled:opacity-30"
            title="删除当前看板"
          >
            <Trash2 size={11} /> 删除
          </button>
        </div>
      </div>

      {/* 设备视图：独立分支（覆盖块状看板） */}
      {view === 'devices' ? (
        currentScenario?.stage ? (
          <DeviceView
            stage={currentScenario.stage}
            result={result}
            onEdit={() => {/* 设备视图里不做块编辑，保留占位 */}}
          />
        ) : (
          <div className="flex-1 grid place-items-center text-ink-muted text-[11px]">
            当前场景「{currentScenario?.name ?? '-'}」暂无舞台，先到「舞台」页生成
          </div>
        )
      ) : isEmpty ? (
        <div className="flex-1 grid place-items-center">
          <div className="text-center">
            <LayoutDashboard size={48} className="mx-auto mb-3 text-ink-muted opacity-40" />
            <div className="text-ink-secondary text-sm mb-1">这个看板是空的</div>
            <div className="text-ink-muted text-[11px] mb-3">添加块（KPI / 表格 / 图表 / 库位 / 设备）开始搭建</div>
            <button onClick={() => setAdding(true)} className="px-3 py-1.5 text-[11px] bg-accent-amber text-bg-base hover:opacity-90 flex items-center gap-1 mx-auto">
              <Plus size={11} /> 添加第一个块
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          {/* 3 列网格自动堆放 */}
          <div className="grid grid-cols-3 auto-rows-[7rem] gap-3">
            {current.widgets.map((w, idx) => (
              <div key={w.id} className={`${sizeCols(w.size.w)} ${sizeRows(w.size.h)} border border-bg-border bg-bg-panel/60 flex flex-col group`}>
                {/* 块头 */}
                <div className="flex items-center gap-1.5 px-2 py-1 border-b border-bg-border bg-bg-raised/40">
                  <span className={`chip ${KIND_BADGE[w.kind]}`}>{KIND_LABEL[w.kind]}</span>
                  <span className="text-[11px] text-ink-primary font-mono truncate flex-1">{w.title}</span>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                    <button onClick={() => moveWidget(current.id, w.id, 'left')} disabled={idx === 0} className="w-5 h-5 grid place-items-center text-ink-muted hover:text-accent-amber disabled:opacity-30"><ChevronLeft size={10} /></button>
                    <button onClick={() => moveWidget(current.id, w.id, 'right')} disabled={idx === current.widgets.length - 1} className="w-5 h-5 grid place-items-center text-ink-muted hover:text-accent-amber disabled:opacity-30"><ChevronRight size={10} /></button>
                    <button onClick={() => setEditing(w)} className="w-5 h-5 grid place-items-center text-ink-muted hover:text-accent-amber"><Edit3 size={10} /></button>
                    <button onClick={() => deleteWidget(current.id, w.id)} className="w-5 h-5 grid place-items-center text-ink-muted hover:text-accent-red"><Trash2 size={10} /></button>
                  </div>
                </div>
                {/* 块体 */}
                <div className="flex-1 p-2 overflow-hidden">
                  {renderWidget(w, { result, stageDevices })}
                </div>
              </div>
            ))}
          </div>

          {/* 添加按钮（底部） */}
          <div className="mt-3 flex justify-center">
            <button onClick={() => setAdding(true)} className="px-3 py-1.5 text-[11px] border border-dashed border-bg-border text-ink-muted hover:border-accent-amber hover:text-accent-amber flex items-center gap-1">
              <Plus size={11} /> 添加块
            </button>
          </div>
        </div>
      )}

      {(adding || editing) && (
        <WidgetConfigDialog
          initial={editing}
          onSave={(w) => {
            if (editing) updateWidget(current.id, editing.id, w);
            else addWidget(current.id, w);
            setAdding(false); setEditing(null);
          }}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function renderWidget(w: Widget, ctx: { result: ReturnType<typeof useStore.getState>['result']; stageDevices: NonNullable<NonNullable<ReturnType<typeof useStore.getState>['scenarios'][number]>['stage']>['devices'] }) {
  switch (w.kind) {
    case 'kpi':           return <KpiWidget widget={w} ctx={ctx} />;
    case 'table':         return <TableWidget widget={w} ctx={ctx} />;
    case 'chart':         return <ChartWidget widget={w} ctx={ctx} />;
    case 'map':           return <MapWidget widget={w} ctx={ctx} />;
    case 'equipment':     return <EquipmentWidget widget={w} ctx={ctx} />;
    case 'deviceResult':  return <DeviceResultBlockWidget widget={w} ctx={ctx} />;
  }
}

import { useMemo } from 'react';
import type { Widget, DataBinding, SimulationResult, Equipment, Location, Zone, StageDevice, DeviceStatus, Stage, StageDeviceResult, StageDeviceKind } from '@/lib/types';
import { WAREHOUSE } from '@/lib/mock';
import { Box, Activity, Cpu, Truck, Building2, Boxes, Layers, ArrowRight, ChevronUp, ArrowUpDown, Container, Package, MapPin, ClipboardList, AlertTriangle, Barcode, Route } from 'lucide-react';

// ============== 数据提取（统一入口） ==============
type Row = Record<string, unknown>;

interface DataContext {
  result: SimulationResult | null;
  stageDevices: StageDevice[];
}

export function extractRows(binding: DataBinding, ctx: DataContext): Row[] {
  const { result, stageDevices } = ctx;
  switch (binding.source) {
    case 'orders':      return result?.orders as unknown as Row[] ?? [];
    case 'pickOrders':  return result?.pickOrders as unknown as Row[] ?? [];
    case 'inventory':   return result?.inventory as unknown as Row[] ?? [];
    case 'assignments': return result?.assignments as unknown as Row[] ?? [];
    case 'picks':       return result?.picks as unknown as Row[] ?? [];
    case 'replenish':   return result?.replenish as unknown as Row[] ?? [];
    case 'trace':       return result?.trace as unknown as Row[] ?? [];
    case 'metrics':     return result ? [result.metrics as unknown as Row] : [];
    case 'stage':       return stageDevices as unknown as Row[];
    case 'stageDevices': {
      const filter = binding.deviceKindFilter;
      if (!filter) return stageDevices as unknown as Row[];
      return stageDevices.filter((d) => d.kind === filter) as unknown as Row[];
    }
    case 'deviceResults': {
      const map = result?.stageDeviceResults ?? {};
      let arr: StageDeviceResult[] = Object.values(map);
      // 按设备 kind 过滤
      if (binding.resultDeviceKind) {
        arr = arr.filter((r) => r.deviceKind === binding.resultDeviceKind);
      }
      // 按状态过滤
      if (binding.resultStatusFilter && binding.resultStatusFilter !== 'all') {
        arr = arr.filter((r) => {
          if (binding.resultStatusFilter === 'with-task') return !!r.taskNumber;
          if (binding.resultStatusFilter === 'with-anomaly') return !!r.anomaly;
          if (binding.resultStatusFilter === 'running') return r.status === 'running';
          if (binding.resultStatusFilter === 'idle') return r.status === 'idle' || r.status === 'normal';
          return true;
        });
      }
      return arr as unknown as Row[];
    }
    default:            return [];
  }
}

/** 取值时把 StageDevice 的 id/name 提到顶层，并把有值的详情字段扁平化 */
function flatten(row: Row, source: DataBinding['source']): Row {
  if (source !== 'stage' && source !== 'stageDevices') return row;
  const d = row as unknown as StageDevice;
  return {
    id: d.id,
    name: d.name,
    kind: d.kind,
    status: d.status,
    taskNumber: d.taskNumber,
    commandNumber: d.commandNumber,
    currentCommand: d.currentCommand,
    barcode: d.barcode,
    anomaly: d.anomaly,
    hasAnomaly: d.anomaly ? 1 : 0,
    x: d.position.x,
    y: d.position.y,
  };
}

function getPath(row: Row, path: string): unknown {
  if (!row) return undefined;
  const parts = path.split('.');
  let cur: unknown = row;
  for (const p of parts) {
    if (cur && typeof cur === 'object') cur = (cur as Row)[p];
    else return undefined;
  }
  return cur;
}

function aggregate(rows: Row[], binding: DataBinding): { value: number; breakdown?: { key: string; count: number }[]; delta?: number } {
  if (binding.source === 'metrics') {
    // 单行指标对象：从 binding.field 读
    if (rows[0] && binding.field) return { value: Number(getPath(rows[0], binding.field)) || 0 };
    if (rows[0]) return { value: Object.keys(rows[0]).length };
    return { value: 0 };
  }
  if (!binding.agg || binding.agg === 'count') return { value: rows.length };
  if (!binding.field) return { value: rows.length };
  if (binding.agg === 'unique') {
    const set = new Set(rows.map((r) => String(getPath(r, binding.field!))));
    return { value: set.size };
  }
  const nums = rows.map((r) => Number(getPath(r, binding.field!))).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return { value: 0 };
  if (binding.agg === 'sum') return { value: nums.reduce((a, b) => a + b, 0) };
  if (binding.agg === 'avg') return { value: Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 };
  return { value: nums.length };
}

function groupBy(rows: Row[], field: string): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = String(getPath(r, field) ?? '—');
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 12);
}

// ============== KPI 数字卡 ==============
export function KpiWidget({ widget, ctx }: { widget: Widget; ctx: DataContext }) {
  const { value, breakdown } = useMemo(() => {
    const rawRows = extractRows(widget.binding, ctx);
    const rows = widget.binding.source === 'stage' || widget.binding.source === 'stageDevices'
      ? rawRows.map((r) => flatten(r, widget.binding.source))
      : rawRows;
    const agg = aggregate(rows, widget.binding);
    if (widget.binding.groupBy) {
      return { value: rows.length, breakdown: groupBy(rows, widget.binding.groupBy) };
    }
    return { value: agg.value, breakdown: undefined };
  }, [widget.binding, ctx]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex flex-col justify-center">
        <div className="text-2xl font-mono font-bold text-accent-amber leading-none">
          {value.toLocaleString()}
        </div>
        <div className="text-[10px] text-ink-muted mt-1 font-mono">
          {describeBinding(widget.binding)}
        </div>
      </div>
      {breakdown && breakdown.length > 0 && (
        <div className="mt-2 pt-2 border-t border-bg-border space-y-0.5 max-h-16 overflow-y-auto">
          {breakdown.slice(0, 4).map((b) => (
            <div key={b.key} className="flex items-center justify-between text-[9px] font-mono">
              <span className="text-ink-muted truncate">{b.key}</span>
              <span className="text-ink-secondary">{b.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function describeBinding(b: DataBinding): string {
  const src = { orders: '入库单', pickOrders: '出库单', inventory: '库存', assignments: '分配行', picks: '拣选', replenish: '补货', trace: '节点', metrics: '指标', stage: '舞台', stageDevices: '舞台设备', deviceResults: '设备结果' }[b.source];
  if (b.agg === 'count' || !b.agg) return `${src} · 总数`;
  return `${src} · ${({ sum: '求和', avg: '平均', unique: '去重数' } as Record<string, string>)[b.agg] ?? b.agg}${b.field ? ` · ${b.field}` : ''}`;
}

// ============== 表格 ==============
export function TableWidget({ widget, ctx }: { widget: Widget; ctx: DataContext }) {
  const rows = useMemo(() => {
    const raw = extractRows(widget.binding, ctx);
    if (widget.binding.source === 'stage' || widget.binding.source === 'stageDevices') {
      return raw.map((r) => flatten(r, widget.binding.source));
    }
    return raw;
  }, [widget.binding, ctx]);
  const columns = useMemo(() => {
    if (rows.length === 0) return [] as string[];
    if (widget.binding.source === 'stage' || widget.binding.source === 'stageDevices') {
      return ['name', 'kind', 'status', 'taskNumber', 'commandNumber', 'anomaly'];
    }
    return Object.keys(rows[0]).filter((k) => !['createdAt'].includes(k)).slice(0, 7);
  }, [rows, widget.binding.source]);

  if (rows.length === 0) return <EmptyHint />;

  return (
    <div className="h-full overflow-y-auto -mx-3 -my-2">
      <table className="w-full text-[10px] font-mono">
        <thead className="sticky top-0 bg-bg-panel">
          <tr className="text-ink-muted">
            {columns.map((c) => <th key={c} className="text-left px-3 py-1 border-b border-bg-border font-normal">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 30).map((r, i) => (
            <tr key={i} className="hover:bg-bg-raised/30 border-b border-bg-border/30">
              {columns.map((c) => {
                const v = r[c];
                return <td key={c} className="px-3 py-0.5 text-ink-secondary truncate max-w-[12ch]">
                  {c === 'anomaly' && v ? <span className="text-accent-red mr-1">⚠</span> : null}
                  {c === 'status' ? <span className={statusTextColor(String(v))}>{v as string}</span> : renderCell(v)}
                </td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 30 && <div className="text-[9px] text-ink-muted px-3 py-1">仅显示前 30 行 / 共 {rows.length} 行</div>}
    </div>
  );
}

function statusTextColor(s: string): string {
  if (s === 'running') return 'text-accent-green';
  if (s === 'blocked' || s === 'fault') return 'text-accent-amber';
  if (s === 'offline') return 'text-ink-muted';
  return 'text-ink-secondary';
}

function renderCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return Array.isArray(v) ? `[${v.length}]` : '{…}';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === 'string') return v.length > 14 ? v.slice(0, 12) + '…' : v;
  return String(v);
}

// ============== 柱状 / 饼图 ==============
export function ChartWidget({ widget, ctx }: { widget: Widget; ctx: DataContext }) {
  const rows = useMemo(() => {
    const raw = extractRows(widget.binding, ctx);
    if (widget.binding.source === 'stage' || widget.binding.source === 'stageDevices') {
      return raw.map((r) => flatten(r, widget.binding.source));
    }
    return raw;
  }, [widget.binding, ctx]);
  const data = useMemo(() => widget.binding.groupBy ? groupBy(rows, widget.binding.groupBy) : [], [rows, widget.binding.groupBy]);
  const type = widget.chartType ?? 'bar';
  const palette = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
  const max = Math.max(1, ...data.map((d) => d.count));

  if (data.length === 0) return <EmptyHint />;

  if (type === 'pie') {
    const total = data.reduce((a, d) => a + d.count, 0);
    let cur = 0;
    const R = 36, C = 2 * Math.PI * R;
    return (
      <div className="h-full flex items-center gap-3">
        <svg viewBox="0 0 100 100" className="w-20 h-20 flex-shrink-0">
          {data.slice(0, 6).map((d, i) => {
            const portion = d.count / total;
            const offset = C * cur;
            cur += portion;
            return (
              <circle key={i} r={R} cx={50} cy={50}
                fill="transparent" stroke={palette[i % palette.length]} strokeWidth={20}
                strokeDasharray={`${C * portion} ${C}`} strokeDashoffset={-offset}
                transform="rotate(-90 50 50)" />
            );
          })}
        </svg>
        <div className="flex-1 space-y-0.5 overflow-y-auto max-h-20">
          {data.slice(0, 6).map((d, i) => (
            <div key={d.key} className="flex items-center gap-1.5 text-[9px] font-mono">
              <span className="w-2 h-2 rounded-sm" style={{ background: palette[i % palette.length] }} />
              <span className="text-ink-secondary flex-1 truncate">{d.key}</span>
              <span className="text-ink-muted">{d.count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col justify-end gap-1 overflow-y-auto">
      {data.map((d, i) => (
        <div key={d.key} className="flex items-center gap-2 text-[10px] font-mono">
          <span className="w-12 text-right text-ink-muted truncate">{d.key}</span>
          <div className="flex-1 bg-bg-base h-3 relative">
            <div className="absolute inset-y-0 left-0" style={{ width: `${(d.count / max) * 100}%`, background: palette[i % palette.length] }} />
          </div>
          <span className="w-8 text-ink-secondary text-right">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

// ============== 库位地图 ==============
export function MapWidget({ widget, ctx }: { widget: Widget; ctx: DataContext }) {
  const mapMode = widget.binding.mapMode ?? 'zone';
  const result = ctx.result;

  // 提取位置信息：从 inventory 关联到 locations
  const cells = useMemo(() => {
    const locs: Location[] = result?.locations ?? [];
    if (locs.length === 0) return { cells: [] as { loc: Location; status: string; value?: number; color: string }[], cols: 0, rows: 0 };
    const inv = result?.inventory ?? [];
    const assigned = new Set<string>();
    const invByLoc = new Map<string, number>();
    for (const a of (result?.assignments ?? [])) assigned.add(a.locationId);
    for (const i of inv) invByLoc.set(i.locationId, (invByLoc.get(i.locationId) ?? 0) + i.qty);

    const colors: Record<Zone, string> = { INBOUND: '#3b82f6', STORAGE: '#10b981', PICK: '#f59e0b', OUTBOUND: '#ef4444' };
    const abcColors: Record<string, string> = { A: '#ef4444', B: '#f59e0b', C: '#6b7280' };

    let color = '#6b7280';
    const cells = locs.map((l) => {
      let status = '空';
      let value: number | undefined;
      if (assigned.has(l.id)) { status = '已分配'; color = colors[l.zone]; }
      else if ((invByLoc.get(l.id) ?? 0) > 0) { status = `有货 ${invByLoc.get(l.id)}`; value = invByLoc.get(l.id); color = colors[l.zone]; }
      else { status = l.zone; color = colors[l.zone]; }
      if (mapMode === 'abc' && value !== undefined) {
        // 简化：根据 value 划分
        color = value > 100 ? abcColors.A : value > 30 ? abcColors.B : abcColors.C;
      }
      if (mapMode === 'qty' && value !== undefined) {
        const intensity = Math.min(1, value / 200);
        color = `rgba(16, 185, 129, ${0.2 + intensity * 0.8})`;
      }
      if (mapMode === 'status') {
        if (assigned.has(l.id)) color = '#f59e0b';
        else if (value !== undefined) color = '#10b981';
        else color = '#374151';
      }
      return { loc: l, status, value, color };
    });
    const cols = Math.max(...cells.map((c) => c.loc.col), 1);
    const rows = Math.max(...cells.map((c) => c.loc.row), 1);
    return { cells, cols, rows };
  }, [result, mapMode]);

  // 没结果数据时给个空态
  if (cells.cells.length === 0) return <EmptyHint />;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 text-[9px] text-ink-muted font-mono mb-1">
        <span>共 {cells.cells.length} 库位</span>
        <span>·</span>
        <span>已分配 {cells.cells.filter((c) => c.status === '已分配').length}</span>
        <span>·</span>
        <span>有货 {cells.cells.filter((c) => c.status.startsWith('有货')).length}</span>
        <span className="ml-auto">模式：{({ zone: '按库区', abc: '按 ABC', qty: '按数量', status: '按状态' } as Record<string, string>)[mapMode]}</span>
      </div>
      <div className="flex-1 grid bg-bg-base p-1 gap-px overflow-hidden" style={{ gridTemplateColumns: `repeat(${cells.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${cells.rows}, minmax(0, 1fr))` }}>
        {Array.from({ length: cells.rows * cells.cols }, (_, idx) => {
          const r = Math.floor(idx / cells.cols) + 1;
          const c = (idx % cells.cols) + 1;
          const cell = cells.cells.find((x) => x.loc.row === r && x.loc.col === c);
          if (!cell) return <div key={idx} />;
          return (
            <div key={idx}
              className="relative group cursor-help"
              style={{ background: cell.color, opacity: cell.status === '空' ? 0.25 : 1 }}
              title={`${cell.loc.id}\n库区: ${cell.loc.zone}\n容量: ${cell.loc.capacity}\n占用: ${cell.loc.occupied}\n${cell.status}`}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============== WCS 设备清单 ==============
export function EquipmentWidget({ widget, ctx }: { widget: Widget; ctx: DataContext }) {
  const result = ctx.result;
  // 优先用舞台里的设备（用户手动编辑的），没有就回退到 result.equipment（仿真输出）
  const stageEqs: Equipment[] = ctx.stageDevices.map((d) => ({
    id: d.id, kind: d.kind === 'agv' ? 'agv' : d.kind === 'conveyor' ? 'conveyor' : 'station',
    name: d.name, status: d.status === 'running' ? 'running' : d.status === 'blocked' ? 'blocked' : d.status === 'offline' ? 'offline' : 'idle',
  }));
  const eqs: Equipment[] = stageEqs.length > 0 ? stageEqs : ((result as unknown as { equipment?: Equipment[] })?.equipment ?? buildMockEquipment(result));

  const kindFilter = widget.binding.equipmentKind ?? 'all';
  const filtered = eqs.filter((e) => kindFilter === 'all' || e.kind === kindFilter);

  if (filtered.length === 0) return <EmptyHint />;

  const counts = {
    running: filtered.filter((e) => e.status === 'running').length,
    idle: filtered.filter((e) => e.status === 'idle').length,
    blocked: filtered.filter((e) => e.status === 'blocked').length,
    offline: filtered.filter((e) => e.status === 'offline').length,
  };

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-4 gap-1 mb-2">
        <Stat label="运行" value={counts.running} color="text-accent-green" />
        <Stat label="空闲" value={counts.idle} color="text-ink-muted" />
        <Stat label="堵塞" value={counts.blocked} color="text-accent-amber" />
        <Stat label="离线" value={counts.offline} color="text-accent-red" />
      </div>
      <div className="flex-1 overflow-y-auto space-y-1">
        {filtered.slice(0, 24).map((e) => (
          <div key={e.id} className="flex items-center gap-2 text-[10px] font-mono px-1.5 py-1 border border-bg-border bg-bg-base">
            {e.kind === 'conveyor' && <Activity size={11} className={statusColor(e.status)} />}
            {e.kind === 'agv' && <Cpu size={11} className={statusColor(e.status)} />}
            {e.kind === 'station' && <Box size={11} className={statusColor(e.status)} />}
            <span className="text-ink-primary font-medium flex-1 truncate">{e.name}</span>
            <span className={`text-[9px] uppercase ${statusColor(e.status)}`}>{e.status}</span>
            {e.position && <span className="text-ink-muted text-[9px]">{e.position.row},{e.position.col}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border border-bg-border bg-bg-base px-1.5 py-1 text-center">
      <div className={`text-sm font-mono font-bold leading-none ${color}`}>{value}</div>
      <div className="text-[8px] text-ink-muted font-mono mt-0.5">{label}</div>
    </div>
  );
}

function statusColor(s: string): string {
  if (s === 'running') return 'text-accent-green';
  if (s === 'blocked') return 'text-accent-amber';
  if (s === 'offline') return 'text-accent-red';
  return 'text-ink-muted';
}

// 当仿真器还没写 equipment 时，给出占位数据
function buildMockEquipment(result: SimulationResult | null): Equipment[] {
  const base = WAREHOUSE.id === 'wh-1' ? 12 : 6;
  const list: Equipment[] = [];
  for (let i = 1; i <= 3; i++) list.push({ id: `agv-${i}`, kind: 'agv', name: `AGV-${String(i).padStart(2, '0')}`, status: 'running', position: { row: Math.floor(Math.random() * 4) + 1, col: Math.floor(Math.random() * 8) + 1 }, currentTask: result?.orders?.[0]?.id });
  for (let i = 1; i <= 6; i++) list.push({ id: `cv-${i}`, kind: 'conveyor', name: `输送线-${String(i).padStart(2, '0')}`, status: i === 3 ? 'blocked' : i % 4 === 0 ? 'idle' : 'running' });
  for (let i = 1; i <= base - 9; i++) list.push({ id: `st-${i}`, kind: 'station', name: `工位-${String(i).padStart(2, '0')}`, status: 'idle' });
  return list;
}

function EmptyHint() {
  return (
    <div className="h-full flex items-center justify-center text-center text-[10px] text-ink-muted font-mono">
      <div>
        <div>📊 暂无数据</div>
        <div className="mt-1">先到 Sandbox 跑一次仿真</div>
      </div>
    </div>
  );
}

// ============== 设备图标（小尺寸，按 kind） ==============
function DeviceIcon({ kind, size = 11, className = '' }: { kind: StageDeviceKind; size?: number; className?: string }) {
  const ic: Record<StageDeviceKind, typeof Truck> = {
    dock: Truck, station: Building2, agv: Cpu, shelfRow: Boxes, shelf: Boxes, zone: Layers,
    conveyor: ArrowRight, chute: ChevronUp, aisle: ArrowUpDown, stack: ArrowUpDown,
    lift: ArrowUpDown, pallet: Container, tote: Package,
    route: Route,
  };
  const Icon = ic[kind] ?? Box;
  return <Icon size={size} className={className} />;
}

const KIND_LABEL: Record<StageDeviceKind, string> = {
  dock: '月台', station: '工位', agv: 'AGV', shelfRow: '货架排', shelf: '货架', zone: '区域',
  conveyor: '输送线', chute: '滑槽', aisle: '巷道', stack: '堆垛机',
  lift: '提升机', pallet: '托盘', tote: '料箱',
  route: '路线',
};

const STATUS_COLOR_DOT: Record<DeviceStatus, string> = {
  normal: 'bg-ink-muted', idle: 'bg-ink-muted',
  running: 'bg-accent-green', blocked: 'bg-accent-amber',
  offline: 'bg-ink-muted/40', fault: 'bg-accent-red',
};

// ============== 路线连线叠加层（WCS 缩略图用，无交互） ==============
function RouteLinesOverlay({ stage }: { stage: Stage }) {
  const deviceById = useMemo(() => {
    const m = new Map<string, StageDevice>();
    for (const d of stage.devices) m.set(d.id, d);
    return m;
  }, [stage.devices]);
  const routes = stage.devices.filter((d) => d.kind === 'route');
  if (routes.length === 0) return null;
  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
      <defs>
        <marker id="wcs-route-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#f472b6" />
        </marker>
      </defs>
      {routes.map((r) => {
        const from = r.routeFrom ? deviceById.get(r.routeFrom) : null;
        const to = r.routeTo ? deviceById.get(r.routeTo) : null;
        if (!from || !to) return null;
        const x1 = from.position.x + from.size.w / 2;
        const y1 = from.position.y + from.size.h / 2;
        const x2 = to.position.x + to.size.w / 2;
        const y2 = to.position.y + to.size.h / 2;
        return (
          <line
            key={r.id}
            x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}
            stroke="#f472b6" strokeWidth={1.5} strokeOpacity={0.7}
            markerEnd="url(#wcs-route-arrow)"
          />
        );
      })}
    </svg>
  );
}

// ============== 设备视图：舞台 1:1 缩略图 ==============
export function DeviceMapWidget({ stage, result, selectedId, onSelect, showStatus = true }: { stage: Stage; result: SimulationResult | null; selectedId: string | null; onSelect?: (id: string) => void; showStatus?: boolean }) {
  const results = result?.stageDeviceResults ?? {};
  // 把 result.assignments + result.orders/pickOrders 拼成 locationId → 行摘要
  const cellInfo = useMemo(() => {
    const m = new Map<string, {
      orderId: string; sku: string; qty: number; container?: string; batch?: string;
      type: 'IN' | 'OUT';
      phase: 'pending' | 'occupied' | 'picked';
      createdAt?: number;
      putawayAt?: number;
      pickAt?: number;
      stationName?: string;
      dockName?: string;
    }>();
    if (!result) return m;
    const lineKey = (o: { id: string; lines: { id: string; skuId: string; qty: number; container?: string; batch?: string }[] }) => {
      const out: Record<string, { skuId: string; qty: number; container?: string; batch?: string }> = {};
      for (const l of o.lines) out[l.id] = { skuId: l.skuId, qty: l.qty, container: l.container, batch: l.batch };
      return out;
    };
    const orderMap = new Map<string, Record<string, { skuId: string; qty: number; container?: string; batch?: string }>>();
    for (const o of result.orders ?? []) orderMap.set(o.id, lineKey(o));
    for (const o of result.pickOrders ?? []) orderMap.set(o.id, lineKey(o));
    // 索引：locationId → 出库分配（用于补 station / container / dock 信息）
    const outByLoc = new Map<string, NonNullable<typeof result.outboundAllocations>[number]>();
    for (const a of result.outboundAllocations ?? []) {
      if (!outByLoc.has(a.locationId)) outByLoc.set(a.locationId, a);
    }
    // 1) 入库分配（按 locationId 登记）
    for (const a of result.assignments ?? []) {
      const ln = orderMap.get(a.orderId)?.[a.orderLineId];
      m.set(a.locationId, {
        orderId: a.orderId,
        sku: a.skuId,
        qty: ln?.qty ?? 0,
        container: a.container,
        batch: a.batch,
        type: 'IN',
        phase: a.phase ?? 'pending',
        createdAt: a.createdAt,
        putawayAt: a.putawayAt,
        pickAt: undefined,
      });
    }
    // 2) 出库拣选步骤（按 step.locationId 登记，可能覆盖同库位：以下降时间最新为准）
    for (const p of result.picks ?? []) {
      for (const step of (p.steps ?? [])) {
        const cur = m.get(step.locationId);
        const alloc = outByLoc.get(step.locationId);
        m.set(step.locationId, {
          orderId: p.orderId,
          sku: step.skuId,
          qty: step.qty,
          container: cur?.container ?? alloc?.containerNo,
          batch: step.batch,
          type: 'OUT',
          phase: 'picked',
          createdAt: p.startedAt,
          putawayAt: undefined,
          pickAt: step.pickAt,
          stationName: alloc?.stationName,
          dockName: alloc?.dockName,
        });
      }
    }
    return m;
  }, [result]);
  return (
    <div className="flex-1 relative bg-bg-base overflow-auto min-h-0">
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(75,85,99,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(75,85,99,0.15) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />
      {/* 图例：库位三态 + 悬停看详情 */}
      <div className="absolute top-1 right-1 z-20 flex gap-2 text-[9px] font-mono pointer-events-none">
        <span className="px-1.5 py-0.5 border border-yellow-400/80 border-dashed text-yellow-200 bg-yellow-500/10">🟡 pending 待上架</span>
        <span className="px-1.5 py-0.5 border border-orange-400/70 text-orange-200 bg-orange-500/20">🟠 occupied 已上架</span>
        <span className="px-1.5 py-0.5 border border-cyan-400/70 text-cyan-200 bg-cyan-500/15">🔵 picked 已下降</span>
      </div>
      {/* 路线（route 设备）：在所有设备之下画 SVG 连线 */}
      <RouteLinesOverlay stage={stage} />
      {/* 货架排（shelfRow 设备，库位填充）—— 与 stage 页一致：使用 position.x / size.w */}
      {stage.devices.filter((d) => d.kind === 'shelfRow').map((row) => {
        const cellCount = row.cellCount ?? 14;
        const label = (row.fields?.rowLabel as string) ?? row.name;
        const isLine = true;  // 横长条
        return (
          <div key={row.id} className="absolute" style={{
            left: `${row.position.x}%`,
            top: `${row.position.y}%`,
            width: `${row.size.w}%`,
            height: `${Math.max(28, row.size.h * 4)}px`,
            minHeight: 28,
          }}>
            <div className="text-[9px] text-amber-400 font-mono px-1 mb-0.5 flex items-center gap-2">
              <span>{label} · {cellCount} cells</span>
              {(() => {
                // 统计本排三类状态数量
                const rowIdx = (row.shelfRow ?? 1) - 1;
                let pending = 0, occupied = 0, picked = 0;
                for (const a of result?.assignments ?? []) {
                  const m = a.locationId.match(/^L(\d+)-/);
                  if (m && Number(m[1]) === rowIdx) {
                    if (a.phase === 'pending') pending++;
                    else if (a.phase === 'occupied') occupied++;
                  }
                }
                for (const p of result?.picks ?? []) {
                  for (const s of p.steps ?? []) {
                    const m = s.locationId.match(/^L(\d+)-/);
                    if (m && Number(m[1]) === rowIdx) picked++;
                  }
                }
                return (
                  <>
                    {pending > 0 && <span className="text-yellow-400" title="已申请·待上架">🟡{pending}</span>}
                    {occupied > 0 && <span className="text-orange-400" title="已上架">🟠{occupied}</span>}
                    {picked > 0 && <span className="text-cyan-400" title="已下降">🔵{picked}</span>}
                  </>
                );
              })()}
            </div>
            <div className={`flex ${isLine ? 'h-4' : 'h-6'} gap-px`}>
              {Array.from({ length: cellCount }, (_, i) => {
                const locId = `L${String(((row.shelfRow ?? 1) - 1)).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                const hit = cellInfo.get(locId);
                // 三态视觉：pending（已申请未上架）= 黄边；occupied（已上架）= 橙实；picked（已下降）= 蓝
                const phase = hit?.phase;
                const cellClass = hit
                  ? phase === 'pending'
                    ? 'border-yellow-400/80 bg-yellow-500/15 text-yellow-200 border-dashed'
                    : phase === 'picked'
                    ? 'border-cyan-400/70 bg-cyan-500/25 text-cyan-200'
                    : 'border-orange-400/70 bg-orange-500/30 text-orange-200'  // occupied
                  : 'border-amber-700/50 bg-amber-50/5 text-transparent';
                const fmtTime = (ts?: number) => ts ? new Date(ts).toLocaleTimeString('zh-CN', { hour12: false }) : '—';
                const phaseLabel = phase === 'pending' ? '🟡 已申请·待上架' : phase === 'occupied' ? '🟠 已上架' : phase === 'picked' ? '🔵 已下降' : '空';
                return (
                  <div key={i}
                    className={`flex-1 border px-0.5 flex items-center justify-center overflow-hidden text-[7px] font-mono leading-none ${cellClass}`}
                    title={hit
                      ? [
                          `${locId} · ${phaseLabel}`,
                          `订单: ${hit.orderId}`,
                          `SKU: ${hit.sku}`,
                          `数量: ${hit.qty}`,
                          hit.batch ? `批次: ${hit.batch}` : null,
                          hit.container ? `容器/托盘: ${hit.container}` : null,
                          `申请: ${fmtTime(hit.createdAt)}`,
                          hit.putawayAt ? `上架: ${fmtTime(hit.putawayAt)}` : null,
                          hit.pickAt ? `下降: ${fmtTime(hit.pickAt)}` : null,
                          // 出库 trace：从库位出 → 拣选工位 → AGV → 月台
                          hit.type === 'OUT' ? `──────── 出库路径 ────────` : null,
                          hit.type === 'OUT' && hit.stationName ? `→ 拣选工位: ${hit.stationName}` : null,
                          hit.type === 'OUT' && hit.container ? `→ 容器/托盘: ${hit.container}` : null,
                          hit.type === 'OUT' && hit.dockName ? `→ AGV 配送至: ${hit.dockName}` : null,
                        ].filter(Boolean).join('\n')
                      : `${locId} · 空`}
                  >
                    {hit && (
                      <span className="truncate w-full text-center">
                        {hit.orderId.replace(/^IN-|^OUT-/, '')}·{hit.sku.split('-').pop()?.slice(0, 3) ?? hit.sku.slice(0, 3)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {/* 设备（区域/工位/巷道/月台/路线以外的）—— 与 stage 页一致：使用 position.x/y/size.w/h */}
      {stage.devices.filter((d) => d.kind !== 'shelfRow' && d.kind !== 'route').map((d) => {
        const r = results[d.id];
        const finalStatus: DeviceStatus = (r?.status as DeviceStatus) ?? d.status;
        const isSel = selectedId === d.id;
        const isLine = d.kind === 'conveyor' || d.kind === 'aisle';
        const apiCall = r?.apiCall;
        const apiErr = apiCall && !apiCall.ok;
        const apiOk = apiCall && apiCall.ok;
        // 与 stage 页 DeviceNode 同样的高度计算：横长条用 14~20px，方块用 minH * 4 px
        const heightPx = isLine ? Math.max(14, d.size.h * 4) : Math.max(32, d.size.h * 4);
        return (
          <div
            key={d.id}
            onClick={() => onSelect?.(d.id)}
            style={{
              left: `${d.position.x}%`,
              top: `${d.position.y}%`,
              width: `${d.size.w}%`,
              height: `${heightPx}px`,
              transform: d.rotation ? `rotate(${d.rotation}deg)` : undefined,
              transformOrigin: 'center center',
            }}
            className={`absolute ${onSelect ? 'cursor-pointer' : ''} transition-all ${isSel ? 'ring-2 ring-accent-amber ring-offset-1 ring-offset-bg-base z-10' : onSelect ? 'hover:ring-1 hover:ring-accent-amber/60' : ''}`}
            title={
              apiErr
                ? `${d.name} · ${KIND_LABEL[d.kind]} · ⚠ API ${apiCall?.method} ${apiCall?.url} 失败 · ${apiCall?.errorMessage ?? ''}`
                : apiOk
                ? `${d.name} · ${KIND_LABEL[d.kind]} · ✓ API ${apiCall?.method} ${apiCall?.url} · ${apiCall?.httpStatus || 'mock'} · ${apiCall?.durationMs}ms`
                : `${d.name} · ${KIND_LABEL[d.kind]}${showStatus ? ` · ${r?.currentCommand ?? finalStatus}` : ''}`
            }
          >
            <div className={`relative flex ${isLine ? 'items-center px-1 h-full' : 'flex-col items-center justify-center h-full'} gap-0.5 border-2 ${
              apiErr
                ? 'border-accent-red bg-accent-red/15 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                : !showStatus
                ? 'border-bg-border bg-bg-raised'
                : STATUS_BORDER[finalStatus]
            } overflow-hidden`}>
              <DeviceIcon kind={d.kind} size={isLine ? 8 : 10} className={apiErr ? 'text-accent-red shrink-0' : 'text-ink-muted shrink-0'} />
              {!isLine && <span className="text-[8px] text-ink-primary font-mono leading-none truncate w-full text-center px-0.5">{d.name}</span>}
              {showStatus && <span className={`absolute top-0 right-0 w-1.5 h-1.5 rounded-full ${STATUS_COLOR_DOT[finalStatus]}`} />}
              {/* API 调用结果角标（即使 showStatus=false 也显示） */}
              {apiErr && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent-red border border-bg-base flex items-center justify-center" title={`API 调用失败: ${apiCall?.errorMessage}`}>
                  <AlertTriangle size={7} className="text-white" />
                </span>
              )}
              {apiOk && showStatus === false && (
                <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-accent-green" title={`API 成功: ${apiCall?.method} ${apiCall?.url}`} />
              )}
            </div>
          </div>
        );
      })}
      {stage.devices.length === 0 && stage.shelves.length === 0 && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none text-ink-muted text-[11px]">舞台为空</div>
      )}
    </div>
  );
}

// ============== WCS 舞台 1:1 视图（无设备状态，只展示布局 + 分配结果） ==============
export function WcsStageView({ stage, result, scenarioName, onOpenStage }: { stage: Stage; result: SimulationResult | null; scenarioName?: string; onOpenStage?: () => void }) {
  const assignmentsCount = result?.assignments?.length ?? 0;
  const inboundCount = result?.orders?.filter((o) => o.type === 'INBOUND').length ?? 0;
  const outboundCount = result?.pickOrders?.length ?? 0;
  const apiErrCount = Object.values(result?.stageDeviceResults ?? {}).filter((r) => r.apiCall && !r.apiCall.ok).length;
  const apiOkCount = Object.values(result?.stageDeviceResults ?? {}).filter((r) => r.apiCall && r.apiCall.ok).length;
  return (
    <div className="flex-1 flex flex-col min-h-0 border border-bg-border bg-bg-panel/40">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-bg-border bg-bg-raised/40">
        <Layers size={11} className="text-accent-amber" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">WCS 舞台 / STAGE MAP</span>
        {scenarioName && <span className="text-[9px] text-ink-muted font-mono">· {scenarioName}</span>}
        <span className="text-[9px] text-ink-muted font-mono">· {stage.devices.length} 设备 / {stage.shelves.length} 排</span>
        <span className="text-[9px] text-ink-muted font-mono">· 分配 {assignmentsCount} / 入 {inboundCount} / 出 {outboundCount}</span>
        {apiOkCount > 0 && <span className="text-[9px] font-mono text-accent-green">· API ✓ {apiOkCount}</span>}
        {apiErrCount > 0 && <span className="text-[9px] font-mono text-accent-red">· API ✗ {apiErrCount}</span>}
        <span className="ml-auto text-[9px] text-ink-muted font-mono">· 1:1 缩略图 · 仅布局，不含设备状态</span>
        {onOpenStage && (
          <button onClick={onOpenStage} className="ml-2 px-1.5 py-0.5 text-[9px] font-mono border border-bg-border hover:border-accent-amber text-ink-secondary hover:text-accent-amber">
            打开舞台 →
          </button>
        )}
      </div>
      <DeviceMapWidget stage={stage} result={result} selectedId={null} onSelect={() => {}} showStatus={false} />
    </div>
  );
}

const STATUS_BORDER: Record<DeviceStatus, string> = {
  normal: 'border-ink-muted/40',
  idle: 'border-ink-muted/60',
  running: 'border-accent-green/70',
  blocked: 'border-accent-amber/70',
  offline: 'border-ink-muted/30 opacity-60',
  fault: 'border-accent-red/70',
};

// ============== 设备视图：单个设备结果详情 ==============
export function DeviceResultWidget({ device, result, onEdit }: { device: StageDevice | null; result: StageDeviceResult | null | undefined; onEdit?: () => void }) {
  if (!device) {
    return (
      <div className="flex-1 p-3 text-[10px] text-ink-muted font-mono">
        点击舞台上的设备 → 在此查看本轮仿真的任务/指令/异常
      </div>
    );
  }
  const devResult = result;
  const f = device.fields ?? {};
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {/* 设备头 */}
      <div className="flex items-center gap-2">
        <DeviceIcon kind={device.kind} size={16} className="text-accent-amber" />
        <div className="min-w-0">
          <div className="text-[12px] text-ink-primary font-mono font-bold truncate">{device.name}</div>
          <div className="text-[9px] text-ink-muted font-mono">id: {device.id} · {KIND_LABEL[device.kind]}</div>
        </div>
        <div className="ml-auto text-right">
          <div className={`text-[10px] font-mono font-bold ${devResult?.status === 'running' ? 'text-accent-green' : devResult?.status === 'fault' ? 'text-accent-red' : 'text-ink-muted'}`}>
            {devResult?.status ?? device.status}
          </div>
        </div>
      </div>

      {/* 业务摘要 */}
      {devResult && (
        <div className="border border-bg-border bg-bg-raised/30 p-2 space-y-1">
          <div className="text-[9px] font-mono uppercase tracking-widest text-ink-muted">本轮结果 / THIS RUN</div>
          <Row icon={<ClipboardList size={10} className="text-accent-amber" />} label="任务" value={devResult.taskNumber} />
          <Row icon={<Barcode size={10} className="text-accent-amber" />} label="条码/容器" value={devResult.barcode} />
          <Row icon={<Cpu size={10} className="text-accent-amber" />} label="当前指令" value={devResult.currentCommand} />
          {typeof devResult.ordersHandled === 'number' && (
            <Row icon={<Truck size={10} className="text-accent-amber" />} label="处理单数" value={`${devResult.ordersHandled} 单 · ${devResult.linesHandled ?? 0} 行`} />
          )}
          {typeof devResult.picksHandled === 'number' && (
            <Row icon={<Package size={10} className="text-accent-amber" />} label="拣货/打包" value={`${devResult.picksHandled} 次`} />
          )}
          {devResult.assignedLocationIds && devResult.assignedLocationIds.length > 0 && (
            <div className="text-[10px] font-mono">
              <div className="flex items-center gap-1 text-ink-muted">
                <MapPin size={10} className="text-accent-amber" /> 已分配库位：
              </div>
              <div className="text-ink-primary text-[9px] ml-4 break-all">{devResult.assignedLocationIds.join(', ')}</div>
            </div>
          )}
          {devResult.anomaly && (
            <div className="text-[10px] font-mono flex items-start gap-1 text-accent-red">
              <AlertTriangle size={11} className="shrink-0 mt-0.5" />
              <span>{devResult.anomaly}</span>
            </div>
          )}
        </div>
      )}

      {/* 设备字段（用于核对映射） */}
      <div className="border border-bg-border bg-bg-raised/30 p-2 space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-[9px] font-mono uppercase tracking-widest text-ink-muted">设备字段 / FIELDS → API</div>
          {onEdit && <button onClick={onEdit} className="text-[9px] text-accent-amber hover:underline">编辑</button>}
        </div>
        {Object.keys(f).length === 0 ? (
          <div className="text-[9px] text-ink-muted font-mono">该设备未配置 fields</div>
        ) : (
          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
            {Object.entries(f).map(([k, v]) => (
              <div key={k} className="flex flex-col min-w-0">
                <span className="text-ink-muted text-[8px] uppercase tracking-widest">{k}</span>
                <span className="text-ink-primary truncate">{String(v ?? '—')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="text-[10px] font-mono flex items-center gap-1.5">
      {icon}
      <span className="text-ink-muted w-16 shrink-0">{label}</span>
      <span className="text-ink-primary truncate flex-1 min-w-0">{value}</span>
    </div>
  );
}

// ============== 经典看板里的「设备」块 ==============
/** 一个可以在「块状」看板里挂的设备块，渲染 deviceResults 数据源 */
export function DeviceResultBlockWidget({ widget, ctx }: { widget: Widget; ctx: DataContext }) {
  const rows = useMemo(() => extractRows(widget.binding, ctx), [widget.binding, ctx]);
  if (rows.length === 0) return <EmptyHint />;
  // KPI 类型
  if (widget.kind === 'kpi') {
    const value = widget.binding.groupBy
      ? groupBy(rows, widget.binding.groupBy).reduce((a, b) => a + b.count, 0)
      : aggregate(rows, widget.binding).value;
    return (
      <div className="h-full flex flex-col justify-center">
        <div className="text-2xl font-mono font-bold text-accent-amber leading-none">{value.toLocaleString()}</div>
        <div className="text-[10px] text-ink-muted mt-1 font-mono">{describeBinding(widget.binding)}</div>
      </div>
    );
  }
  // TABLE 类型：设备名 / 类型 / 状态 / 任务 / 指令
  if (widget.kind === 'table') {
    return (
      <div className="h-full overflow-y-auto -mx-3 -my-2">
        <table className="w-full text-[10px] font-mono">
          <thead className="sticky top-0 bg-bg-panel">
            <tr className="text-ink-muted">
              <th className="text-left px-3 py-1 border-b border-bg-border font-normal">设备</th>
              <th className="text-left px-3 py-1 border-b border-bg-border font-normal">类型</th>
              <th className="text-left px-3 py-1 border-b border-bg-border font-normal">状态</th>
              <th className="text-left px-3 py-1 border-b border-bg-border font-normal">任务</th>
              <th className="text-left px-3 py-1 border-b border-bg-border font-normal">指令</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 30).map((r, i) => {
              const row = r as unknown as StageDeviceResult;
              return (
                <tr key={i} className="hover:bg-bg-raised/30 border-b border-bg-border/30">
                  <td className="px-3 py-0.5 text-ink-primary truncate max-w-[12ch]">{row.deviceName}</td>
                  <td className="px-3 py-0.5 text-ink-secondary">{KIND_LABEL[row.deviceKind] ?? row.deviceKind}</td>
                  <td className="px-3 py-0.5"><span className={statusTextColor(row.status)}>{row.status}</span></td>
                  <td className="px-3 py-0.5 text-ink-secondary truncate max-w-[12ch]">{row.taskNumber ?? '—'}</td>
                  <td className="px-3 py-0.5 text-ink-secondary truncate max-w-[12ch]">{row.currentCommand ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  return <EmptyHint />;
}


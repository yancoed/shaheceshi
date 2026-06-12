import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useStore } from '@/stores/sandbox';
import type { StageDevice, StageDeviceKind, DeviceStatus, DeviceBusiness, InboundEventConfig, OutboundEventConfig, StationRole, PutawayStrategy, PickStrategy, AbcClass, Stage } from '@/lib/types';
import { DEVICE_FIELDS_SCHEMA, buildDefaultFields } from '@/lib/types';
import {
  LayoutGrid, Trash2, Cpu, ArrowRight, Building2, Truck, ChevronUp, ArrowLeft, Save, X, Edit3, Package, MapPin, Layers,
  ArrowUpDown, Container, MoreHorizontal, Rows3, Square, GripVertical, Route, Crosshair, Zap,
} from 'lucide-react';

// 设备类别默认配置（立库专用 WMS 业务对象）
// group: 设备 / 库位 / 通道 / 辅助 - 用于面板分组
const DEVICE_DEFAULT: Record<StageDeviceKind, { icon: typeof Cpu; label: string; defaultSize: { w: number; h: number }; color: string; group: '设备' | '库位' | '通道' | '辅助'; minW: number; minH: number; shape: 'box' | 'line' | 'wide' | 'route' }> = {
  // === 设备（业务节点） ===
  dock:     { icon: Truck,        label: '月台',    defaultSize: { w: 10, h: 9 }, color: 'text-amber-400',  group: '设备', minW: 64, minH: 48, shape: 'box' },
  station:  { icon: Building2,    label: '工位',    defaultSize: { w: 8,  h: 9 }, color: 'text-cyan-400',   group: '设备', minW: 56, minH: 48, shape: 'box' },
  agv:      { icon: Cpu,          label: 'AGV',   defaultSize: { w: 5,  h: 7 }, color: 'text-gray-400',   group: '设备', minW: 40, minH: 36, shape: 'box' },
  // === 库位（存放货物） - 货架排放在第一位 ===
  shelfRow: { icon: Rows3,        label: '货架排',   defaultSize: { w: 90, h: 6 }, color: 'text-amber-400',  group: '库位', minW: 200, minH: 36, shape: 'wide' },
  shelf:    { icon: Square,       label: '立体库货位', defaultSize: { w: 4,  h: 6 }, color: 'text-orange-400', group: '库位', minW: 32, minH: 32, shape: 'box' },
  zone:     { icon: Layers,       label: '区域',     defaultSize: { w: 20, h: 12 }, color: 'text-purple-400', group: '库位', minW: 80, minH: 48, shape: 'wide' },
  // === 通道（连接/分隔） ===
  conveyor: { icon: ArrowRight,   label: '输送线',   defaultSize: { w: 20, h: 4 },  color: 'text-gray-400',  group: '通道', minW: 80, minH: 24, shape: 'line' },
  chute:    { icon: ChevronUp,    label: '滑槽',     defaultSize: { w: 4,  h: 8 },  color: 'text-gray-400',  group: '通道', minW: 32, minH: 36, shape: 'box' },
  aisle:    { icon: ArrowUpDown,  label: '巷道',     defaultSize: { w: 18, h: 3 },  color: 'text-slate-400', group: '通道', minW: 60, minH: 18, shape: 'line' },
  stack:    { icon: ArrowUpDown,  label: '堆垛机',   defaultSize: { w: 2,  h: 8 },  color: 'text-yellow-400', group: '通道', minW: 18, minH: 48, shape: 'box' },
  lift:     { icon: ArrowUpDown,  label: '提升机',   defaultSize: { w: 4,  h: 6 },  color: 'text-yellow-300', group: '通道', minW: 28, minH: 32, shape: 'box' },
  route:    { icon: Route,        label: '路线',     defaultSize: { w: 4,  h: 4 },  color: 'text-pink-400',   group: '通道', minW: 24, minH: 24, shape: 'route' },
  // === 辅助（容器/单位） ===
  pallet:   { icon: Container,    label: '托盘',     defaultSize: { w: 4,  h: 4 },  color: 'text-amber-300',  group: '辅助', minW: 28, minH: 28, shape: 'box' },
  tote:     { icon: Package,      label: '料箱',     defaultSize: { w: 3,  h: 3 },  color: 'text-amber-200',  group: '辅助', minW: 24, minH: 24, shape: 'box' },
};

const STATUS_COLOR: Record<DeviceStatus, string> = {
  normal:  'border-ink-muted/40 bg-bg-raised',
  idle:    'border-ink-muted/60 bg-bg-raised',
  running: 'border-accent-green/70 bg-accent-green/15',
  blocked: 'border-accent-amber/70 bg-accent-amber/15',
  offline: 'border-ink-muted/30 bg-bg-base opacity-60',
  fault:   'border-accent-red/70 bg-accent-red/15',
};
const STATUS_DOT: Record<DeviceStatus, string> = {
  normal:  'bg-ink-muted',
  idle:    'bg-ink-muted',
  running: 'bg-accent-green dot-live',
  blocked: 'bg-accent-amber',
  offline: 'bg-ink-muted/40',
  fault:   'bg-accent-red',
};

export default function StagePage({ onBack }: { onBack?: () => void }) {
  const scenarios = useStore((s) => s.scenarios);
  const currentScenarioId = useStore((s) => s.currentScenarioId);
  const setCurrentScenario = useStore((s) => s.setCurrentScenario);
  const addScenario = useStore((s) => s.addScenario);
  const ensureStage = useStore((s) => s.ensureCurrentScenarioStage);
  const removeStage = useStore((s) => s.removeCurrentScenarioStage);
  const updateStage = useStore((s) => s.updateCurrentScenarioStage);
  const addDevice = useStore((s) => s.addDevice);
  const updateDevice = useStore((s) => s.updateDevice);
  const updateDeviceSize = useStore((s) => s.updateDeviceSize);
  const deleteDevice = useStore((s) => s.deleteDevice);
  const setDevicePosition = useStore((s) => s.setDevicePosition);
  const addShelfRow = useStore((s) => s.addShelfRow);
  const removeShelfRow = useStore((s) => s.removeShelfRow);
  const updateShelfRow = useStore((s) => s.updateShelfRow);

  const canvasRef = useRef<HTMLDivElement | null>(null);

  const scenario = scenarios.find((s) => s.id === currentScenarioId) ?? scenarios[0];
  const stage = scenario?.stage;

  // 进页面时确保当前场景有舞台
  useState(() => { ensureStage(); });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<StageDevice | null>(null);
  // 连线模式：右键选「从这里连接」后进入，sourceDeviceId 是已选的起点
  // - 有 pendingRouteId：编辑现有路线（拖到画布时的旧流程，保留兼容）
  // - 无 pendingRouteId：从右键新建路线
  const [connecting, setConnecting] = useState<{ sourceDeviceId: string; pendingRouteId?: string } | null>(null);
  // 高亮某工位关联的全部路径（点击工位 / 仿真后自动触发）
  const [highlightStationId, setHighlightStationId] = useState<string | null>(null);
  // 自动高亮开关（仿真后自动高亮工位路径）
  const [autoHighlightEnabled, setAutoHighlightEnabled] = useState(true);
  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{ deviceId: string; x: number; y: number } | null>(null);
  // 当前仿真结果（从 store 拿）
  const result = useStore((s) => s.result);

  const selected = stage?.devices.find((d) => d.id === selectedId) ?? null;

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!stage) return;
    e.preventDefault();
    const kind = e.dataTransfer.getData('text/x-stage-device-kind') as StageDeviceKind;
    if (!kind || !DEVICE_DEFAULT[kind]) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const def = DEVICE_DEFAULT[kind];
    const id = `d-${Math.random().toString(36).slice(2, 8)}`;
    const newDevice: StageDevice = {
      id,
      kind,
      name: kind === 'route'
        ? `路线 ${(stage.devices.filter((d) => d.kind === 'route').length + 1).toString().padStart(2, '0')}`
        : `${def.label} ${(stage.devices.filter((d) => d.kind === kind).length + 1).toString().padStart(2, '0')}`,
      position: { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) },
      size: def.defaultSize,
      status: 'normal',
      direction: 'up',
      fields: buildDefaultFields(kind),
    };
    addDevice(newDevice);
    setSelectedId(newDevice.id);
  }, [stage, addDevice]);

  // 处理「连线模式」下的设备点击
  const onDeviceClickedInConnectMode = useCallback((deviceId: string) => {
    if (!connecting || !stage) return false;
    const target = stage.devices.find((d) => d.id === deviceId);
    if (!target || target.kind === 'route') return false;       // 不能选路线本身
    if (deviceId === connecting.sourceDeviceId) return false;   // 不能自己连自己
    if (connecting.pendingRouteId) {
      // 旧流程：编辑现有路线
      updateDevice(connecting.pendingRouteId, { routeTo: deviceId, pendingConnection: false });
    } else {
      // 新流程：新建路线
      const routeCount = stage.devices.filter((d) => d.kind === 'route').length;
      const newRoute: StageDevice = {
        id: `d-${Math.random().toString(36).slice(2, 8)}`,
        kind: 'route',
        name: `路线 ${(routeCount + 1).toString().padStart(2, '0')}`,
        position: { x: 50, y: 50 },  // 实际位置由端点决定（用 SVG 画线）
        size: { w: 4, h: 4 },
        status: 'normal',
        direction: 'up',
        fields: buildDefaultFields('route'),
        routeFrom: connecting.sourceDeviceId,
        routeTo: deviceId,
        routeType: 'both',
      };
      addDevice(newRoute);
      setSelectedId(newRoute.id);
    }
    setConnecting(null);
    return true;
  }, [connecting, stage, updateDevice, addDevice]);

  // 启动「从这里连接」模式（右键菜单调用）
  const onConnectFromDevice = useCallback((deviceId: string) => {
    if (!stage) return;
    const d = stage.devices.find((x) => x.id === deviceId);
    if (!d || d.kind === 'route') return;
    setConnecting({ sourceDeviceId: deviceId });
    setHighlightStationId(null);
  }, [stage]);

  // 计算某设备延伸出的所有路径（用于高亮）
  const computeReachableFrom = useCallback((startId: string): { devices: Set<string>; routes: Set<string> } => {
    const devices = new Set<string>([startId]);
    const routes = new Set<string>();
    if (!stage) return { devices, routes };
    // BFS 沿 route 扩展（不限方向）
    const queue: string[] = [startId];
    while (queue.length) {
      const cur = queue.shift()!;
      const connected = stage.devices.filter((d) => d.kind === 'route' && (d.routeFrom === cur || d.routeTo === cur));
      for (const r of connected) {
        if (routes.has(r.id)) continue;
        routes.add(r.id);
        const other = r.routeFrom === cur ? r.routeTo : r.routeFrom;
        if (other && !devices.has(other)) {
          devices.add(other);
          queue.push(other);
        }
      }
    }
    return { devices, routes };
  }, [stage]);

  // 计算当前选中工位可达的所有设备 & 路线（用于高亮）
  const { reachableSet, highlightedRouteIds } = useMemo(() => {
    if (!highlightStationId || !stage) return { reachableSet: new Set<string>(), highlightedRouteIds: new Set<string>() };
    const r = computeReachableFrom(highlightStationId);
    return { reachableSet: r.devices, highlightedRouteIds: r.routes };
  }, [highlightStationId, stage, computeReachableFrom]);

  // 仿真结果自动高亮：如果有仿真结果，遍历所有工位设备，把有 ordersHandled>0 或 picksHandled>0 的工位路径自动高亮
  useEffect(() => {
    if (!autoHighlightEnabled || !result || !stage) {
      if (!result) setHighlightStationId(null);
      return;
    }
    const deviceResults = result.stageDeviceResults ?? {};
    // 找第一个有工作的 station（入库 ordersHandled>0，或出入库 picksHandled>0）
    const workingStation = stage.devices.find((d) => {
      if (d.kind !== 'station') return false;
      const r = deviceResults[d.id];
      if (!r) return false;
      return (r.ordersHandled ?? 0) > 0 || (r.picksHandled ?? 0) > 0 || (r.linesHandled ?? 0) > 0;
    });
    if (workingStation) {
      setHighlightStationId(workingStation.id);
    }
  }, [result, stage, autoHighlightEnabled]);

  if (!scenario) {
    return (
      <div className="h-full grid place-items-center text-ink-muted">
        <button onClick={() => {
          const t = Date.now();
          addScenario({ id: `sc-${Math.random().toString(36).slice(2, 8)}`, name: '新场景 · 1', description: '', nodes: [], createdAt: t, updatedAt: t });
        }} className="px-3 py-1.5 text-[11px] bg-accent-amber text-bg-base">新建场景</button>
      </div>
    );
  }

  if (!stage) {
    return (
      <div className="h-full grid place-items-center text-ink-muted">
        <div className="text-center space-y-3">
          <LayoutGrid size={48} className="mx-auto opacity-30" />
          <div className="text-[12px]">当前场景「{scenario.name}」暂无舞台</div>
          <div className="flex gap-2 justify-center">
            <button onClick={ensureStage} className="px-3 py-1.5 text-[11px] bg-accent-amber text-bg-base">生成默认舞台</button>
            <button onClick={ensureStage} className="px-3 py-1.5 text-[11px] border border-accent-amber text-accent-amber">新建空白舞台</button>
          </div>
          <div className="text-[10px] text-ink-muted">建议：从左侧拖设备到画布上</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-base">
      {/* 顶栏 */}
      <div className="border-b border-bg-border bg-bg-panel/60 px-4 py-2 flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="w-7 h-7 grid place-items-center text-ink-muted hover:text-accent-amber"><ArrowLeft size={13} /></button>
        )}
        <LayoutGrid size={14} className="text-accent-amber" />
        <span className="text-[10px] text-ink-muted font-mono uppercase">场景 / SCENARIO</span>
        <select value={scenario.id} onChange={(e) => setCurrentScenario(e.target.value)} className="bg-bg-base border border-bg-border px-2 py-1 text-[12px] focus:outline-none">
          {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="text-[10px] text-ink-muted font-mono">
          {stage.devices.length} 设备 · {stage.devices.filter((d) => d.kind === 'shelfRow').length} 货架排
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => {
              if (confirm('清空所有货架排和设备，舞台回到空白？')) updateStage({ shelves: [], devices: [] });
            }}
            className="px-2 py-1 text-[10px] text-ink-muted hover:text-accent-amber flex items-center gap-1"
            title="清空画布（保留舞台容器）"
          >
            <LayoutGrid size={11} /> 清空
          </button>
          <button
            onClick={() => {
              if (confirm(`确定要删除当前场景「${scenario.name}」的舞台吗？\n\n删除后场景仍然存在，可随时重新生成。`)) {
                removeStage();
                setSelectedId(null);
              }
            }}
            className="px-2 py-1 text-[10px] text-ink-muted hover:text-accent-red flex items-center gap-1"
            title="删除整个舞台（场景保留）"
          >
            <Trash2 size={11} /> 删除舞台
          </button>
        </div>
      </div>

      {/* 三栏布局：左侧设备面板 + 中央画布 + 右侧详情 */}
      <div className="flex-1 flex min-h-0">
        <DevicePalette />
        <div
          ref={canvasRef}
          data-canvas="stage"
          className={`flex-1 relative bg-bg-base overflow-auto ${connecting ? 'cursor-crosshair' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedId(null);
              setContextMenu(null);
              // 点击空白区退出连线模式
              if (connecting) setConnecting(null);
            }
          }}
          onContextMenu={(e) => {
            // 空白区域右键 = 显示通用菜单
            if (e.target === e.currentTarget) {
              e.preventDefault();
              setContextMenu({ deviceId: '', x: e.clientX, y: e.clientY });
            }
          }}
        >
          {/* 画布背景：浅网格 */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'linear-gradient(rgba(75,85,99,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(75,85,99,0.15) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }} />
          {/* 货架排（shelfRow 设备，单独渲染，容器里画格） */}
          {stage.devices.filter((d) => d.kind === 'shelfRow').map((d) => {
            const reachable = highlightStationId ? reachableSet.has(d.id) : false;
            return (
              <ShelfRowDevice
                key={d.id}
                device={d}
                selected={selectedId === d.id}
                onClick={() => {
                  if (connecting) { onDeviceClickedInConnectMode(d.id); return; }
                  setSelectedId(d.id);
                  // 点击工位时高亮其路径
                  if (d.kind === 'station') setHighlightStationId(d.id);
                }}
                onMove={(pos) => setDevicePosition(d.id, pos)}
                onResize={(size) => updateDeviceSize(d.id, size)}
                onUpdate={(patch) => updateDevice(d.id, patch)}
                onRemove={() => {
                  if (confirm(`删除货架排「${d.name}」？`)) deleteDevice(d.id);
                }}
                canvasRef={canvasRef}
                highlighted={reachable}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ deviceId: d.id, x: e.clientX, y: e.clientY }); setSelectedId(d.id); }}
              />
            );
          })}
          {/* 区域（渲染在最底层，被其中的货架覆盖显示） */}
          {stage.devices.filter((d) => d.kind === 'zone').map((d) => {
            const cnt = stage.devices.filter((c) => c.kind === 'shelf' && isInsideZone(c, d)).length;
            const reachable = highlightStationId ? reachableSet.has(d.id) : false;
            return (
              <ZoneFrame
                key={d.id}
                device={d}
                selected={selectedId === d.id}
                onClick={() => {
                  if (connecting) { onDeviceClickedInConnectMode(d.id); return; }
                  setSelectedId(d.id);
                }}
                onMove={(pos) => setDevicePosition(d.id, pos)}
                onResize={(size) => updateDeviceSize(d.id, size)}
                containedCount={cnt}
                canvasRef={canvasRef}
                highlighted={reachable}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ deviceId: d.id, x: e.clientX, y: e.clientY }); setSelectedId(d.id); }}
              />
            );
          })}
          {/* 其他设备（station / dock / agv / conveyor / aisle / stack / lift / shelf / pallet / tote） */}
          {stage.devices.filter((d) => d.kind !== 'zone' && d.kind !== 'shelfRow' && d.kind !== 'route').map((d) => {
            const reachable = highlightStationId ? reachableSet.has(d.id) : false;
            return (
              <DeviceNode
                key={d.id}
                device={d}
                selected={selectedId === d.id}
                onClick={() => {
                  if (connecting) { onDeviceClickedInConnectMode(d.id); return; }
                  setSelectedId(d.id);
                  if (d.kind === 'station') setHighlightStationId(d.id);
                }}
                onMove={(pos) => setDevicePosition(d.id, pos)}
                onResize={(size) => updateDeviceSize(d.id, size)}
                onRotate={(rotation) => updateDevice(d.id, { rotation })}
                canvasRef={canvasRef}
                highlighted={reachable}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ deviceId: d.id, x: e.clientX, y: e.clientY }); setSelectedId(d.id); }}
              />
            );
          })}
          {/* 路线（route 设备）：在所有设备之上画 SVG 连线 + 端点标记 */}
          <RouteOverlay
            routes={stage.devices.filter((d) => d.kind === 'route')}
            allDevices={stage.devices}
            selectedRouteId={selectedId}
            highlightedRouteIds={highlightedRouteIds}
            connecting={connecting}
            onSelectRoute={(id) => {
              if (connecting) return;
              setSelectedId(id);
              setHighlightStationId(null);
            }}
            onRemoveRoute={(id) => {
              if (confirm('删除该路线？')) {
                deleteDevice(id);
                if (connecting?.pendingRouteId === id) setConnecting(null);
              }
            }}
            onContextMenu={(e, id) => setContextMenu({ deviceId: id, x: e.clientX, y: e.clientY })}
          />
          {/* 空态提示 */}
          {stage.devices.length === 0 && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="text-center text-ink-muted">
                <LayoutGrid size={48} className="mx-auto mb-2 opacity-30" />
                <div className="text-[12px]">画布是空的 · 从左侧拖元素过来</div>
              </div>
            </div>
          )}
          {/* 连线模式提示横幅 */}
          {connecting && (() => {
            const src = stage.devices.find((d) => d.id === connecting.sourceDeviceId);
            return (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-pink-500/90 text-bg-base text-[11px] font-mono font-bold flex items-center gap-2 shadow-lg">
                <Route size={11} />
                从 <span className="text-bg-base bg-pink-700/50 px-1">{src?.name ?? '?'}</span> 连接 →
                请在画布上点选**终点**设备
                <button
                  onClick={() => setConnecting(null)}
                  className="ml-2 px-1.5 py-0.5 bg-bg-base/30 hover:bg-bg-base/50 text-[10px]"
                >取消 Esc</button>
              </div>
            );
          })()}
          {/* 高亮提示 + 工位选择器 + 清空按钮 */}
          {highlightStationId && !connecting && (() => {
            const stations = stage.devices.filter((d) => d.kind === 'station');
            const cur = stations.find((s) => s.id === highlightStationId);
            const dr = result?.stageDeviceResults?.[highlightStationId];
            return (
              <div className="absolute bottom-2 right-2 z-20 px-2 py-1.5 bg-accent-amber/95 text-bg-base text-[10px] font-mono flex items-center gap-2 shadow-lg max-w-[90vw]">
                <Zap size={11} />
                <span className="font-bold">高亮路径</span>
                <select
                  value={highlightStationId}
                  onChange={(e) => setHighlightStationId(e.target.value)}
                  className="bg-bg-base/90 border border-bg-base/50 px-1.5 py-0.5 text-[10px] text-accent-amber font-mono focus:outline-none"
                >
                  {stations.length === 0 && <option value="">— 无工位 —</option>}
                  {stations.map((s) => {
                    const sdr = result?.stageDeviceResults?.[s.id];
                    const handled = (sdr?.ordersHandled ?? 0) + (sdr?.picksHandled ?? 0);
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name} {handled > 0 ? `·${handled}单` : ''}
                      </option>
                    );
                  })}
                </select>
                {dr && (
                  <span className="text-[9px] text-bg-base/80">
                    · {dr.ordersHandled ?? 0}单(入) · {dr.picksHandled ?? 0}单(出)
                  </span>
                )}
                <button
                  onClick={() => setAutoHighlightEnabled((v) => !v)}
                  className={`px-1.5 py-0.5 text-[9px] font-bold ${autoHighlightEnabled ? 'bg-bg-base text-accent-amber' : 'bg-bg-base/40 text-bg-base/70'}`}
                  title={autoHighlightEnabled ? '仿真后自动高亮（开）' : '仿真后自动高亮（关）'}
                >
                  {autoHighlightEnabled ? '自动·开' : '自动·关'}
                </button>
                <button
                  onClick={() => setHighlightStationId(null)}
                  className="px-1.5 py-0.5 bg-bg-base/30 hover:bg-bg-base/50 text-[10px]"
                  title="清除高亮"
                >×</button>
              </div>
            );
          })()}
        </div>
        <DeviceDetailPanel
          device={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={(patch) => selected && updateDevice(selected.id, patch)}
          onDelete={() => {
            if (selected && confirm(`删除设备「${selected.name}」？`)) {
              deleteDevice(selected.id);
              setSelectedId(null);
            }
          }}
          onEdit={() => selected && setEditing(selected)}
          allDevices={stage.devices}
          onPickEndpoint={(endpointKind) => {
            if (!selected || selected.kind !== 'route') return;
            // 在 route 已经存在的场景下，使用 pendingRouteId 走「编辑现有」模式
            if (endpointKind === 'routeTo') {
              setConnecting({ sourceDeviceId: selected.routeFrom ?? selected.id, pendingRouteId: selected.id });
            } else {
              // routeFrom：先清空再让用户选
              updateDevice(selected.id, { routeFrom: undefined });
              setConnecting({ sourceDeviceId: selected.id });
            }
          }}
        />
      </div>

      {/* 全局右键菜单 */}
      {contextMenu && stage && (
        <DeviceContextMenu
          ctx={contextMenu}
          stage={stage}
          onClose={() => setContextMenu(null)}
          onConnectFrom={(id) => onConnectFromDevice(id)}
          onDelete={(id) => {
            const d = stage.devices.find((x) => x.id === id);
            if (d && confirm(`删除${d.name}？`)) {
              deleteDevice(id);
              if (selectedId === id) setSelectedId(null);
            }
          }}
          onRename={(id) => {
            const d = stage.devices.find((x) => x.id === id);
            if (d) setEditing(d);
          }}
        />
      )}

      {/* 全局 Esc 退出连线模式 */}
      {connecting && (
        <EscBinder onEsc={() => setConnecting(null)} />
      )}

      {editing && (
        <DeviceEditDialog
          device={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => { updateDevice(editing.id, patch); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ============== 全局 Esc 键监听 ==============
function EscBinder({ onEsc }: { onEsc: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onEsc(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onEsc]);
  return null;
}

// ============== 设备右键菜单 ==============
function DeviceContextMenu({ ctx, stage, onClose, onConnectFrom, onDelete, onRename }: {
  ctx: { deviceId: string; x: number; y: number } | null;
  stage: Stage;
  onClose: () => void;
  onConnectFrom: (deviceId: string) => void;
  onDelete: (deviceId: string) => void;
  onRename: (deviceId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ctx) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctx, onClose]);
  if (!ctx) return null;
  const dev = stage.devices.find((d) => d.id === ctx.deviceId);
  const isRoute = dev?.kind === 'route';
  // 边界检测：菜单不超出视口
  const winW = window.innerWidth, winH = window.innerHeight;
  const W = 200, H = dev ? (isRoute ? 80 : 110) : 60;
  const x = Math.min(ctx.x, winW - W - 8);
  const y = Math.min(ctx.y, winH - 8);
  return (
    <div
      ref={ref}
      className="fixed z-50 bg-bg-panel border border-bg-border shadow-2xl text-[11px] font-mono min-w-[180px]"
      style={{ left: x, top: y, width: W }}
      onClick={(e) => e.stopPropagation()}
    >
      {dev ? (
        <>
          <div className="px-2.5 py-1 border-b border-bg-border text-[9px] text-ink-muted uppercase tracking-widest bg-bg-raised/40 flex items-center gap-1">
            <span className="text-accent-amber">{dev.kind}</span>
            <span className="text-ink-primary truncate flex-1">{dev.name}</span>
          </div>
          {!isRoute && (
            <button
              onClick={() => { onConnectFrom(dev.id); onClose(); }}
              className="w-full px-2.5 py-1.5 text-left flex items-center gap-2 hover:bg-pink-500/15 text-pink-400"
            >
              <Route size={11} /> 从这里连接...
            </button>
          )}
          <button
            onClick={() => { onRename(dev.id); onClose(); }}
            className="w-full px-2.5 py-1.5 text-left flex items-center gap-2 hover:bg-bg-raised text-ink-primary"
          >
            <Edit3 size={11} /> 重命名
          </button>
          <button
            onClick={() => { onDelete(dev.id); onClose(); }}
            className="w-full px-2.5 py-1.5 text-left flex items-center gap-2 hover:bg-accent-red/15 text-accent-red border-t border-bg-border"
          >
            <Trash2 size={11} /> 删除
          </button>
        </>
      ) : (
        <div className="px-2.5 py-1.5 text-ink-muted">画布菜单（未实现）</div>
      )}
    </div>
  );
}

// ============== 路线 SVG 叠加层（在画布最上层，点 route 不会触发设备选择） ==============
function RouteOverlay({ routes, allDevices, selectedRouteId, highlightedRouteIds, connecting, onSelectRoute, onRemoveRoute, onContextMenu }: {
  routes: StageDevice[];
  allDevices: StageDevice[];
  selectedRouteId: string | null;
  highlightedRouteIds: Set<string>;
  connecting: { sourceDeviceId: string; pendingRouteId?: string } | null;
  onSelectRoute: (id: string) => void;
  onRemoveRoute: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, routeId: string) => void;
}) {
  const deviceById = useMemo(() => {
    const m = new Map<string, StageDevice>();
    for (const d of allDevices) m.set(d.id, d);
    return m;
  }, [allDevices]);

  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
      <defs>
        <marker id="route-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#f472b6" />
        </marker>
        <marker id="route-arrow-hl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />
        </marker>
      </defs>
      {routes.map((r) => {
        const from = r.routeFrom ? deviceById.get(r.routeFrom) : null;
        const to = r.routeTo ? deviceById.get(r.routeTo) : null;
        const isHi = highlightedRouteIds.has(r.id);
        const isPending = r.pendingConnection;
        const isSelected = selectedRouteId === r.id;
        const isConnecting = connecting?.pendingRouteId === r.id;
        // 计算端点中心（百分比）
        const x1 = from ? from.position.x + from.size.w / 2 : r.position.x + r.size.w / 2;
        const y1 = from ? from.position.y + from.size.h / 2 : r.position.y + r.size.h / 2;
        const x2 = to ? to.position.x + to.size.w / 2 : r.position.x + r.size.w / 2;
        const y2 = to ? to.position.y + to.size.h / 2 : r.position.y + r.size.h / 2;
        const color = isHi ? '#fbbf24' : (isPending ? '#94a3b8' : '#f472b6');
        const sw = isHi ? 3 : (isSelected ? 2.5 : 1.8);
        const dash = isPending ? '4 3' : undefined;
        const arrow = isPending ? undefined : 'url(#route-arrow)';
        return (
          <g key={r.id}>
            {/* 点击命中区（更宽的透明线） */}
            {from && to && (
              <line
                x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}
                stroke="transparent" strokeWidth={12} className="pointer-events-auto cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onSelectRoute(r.id); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, r.id); }}
              />
            )}
            {/* 实际可见线 */}
            {from && to && (
              <line
                x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}
                stroke={color} strokeWidth={sw} strokeDasharray={dash} markerEnd={isHi ? 'url(#route-arrow-hl)' : arrow}
                pointerEvents="none"
              />
            )}
            {/* 起点 / 终点圆点（设备中心位置） */}
            {from && (
              <circle cx={`${x1}%`} cy={`${y1}%`} r={isHi ? 5 : 3.5}
                fill={isHi ? '#fbbf24' : '#f472b6'} stroke="#0B0F14" strokeWidth={1}
                pointerEvents="none" />
            )}
            {to && (
              <circle cx={`${x2}%`} cy={`${y2}%`} r={isHi ? 5 : 3.5}
                fill={isHi ? '#fbbf24' : '#f472b6'} stroke="#0B0F14" strokeWidth={1}
                pointerEvents="none" />
            )}
            {/* 未连完的路线：在中心画一个脉冲圆 */}
            {isPending && (
              <g pointerEvents="none">
                <circle cx={`${r.position.x + r.size.w / 2}%`} cy={`${r.position.y + r.size.h / 2}%`} r={10}
                  fill="none" stroke="#f472b6" strokeWidth={1.5} opacity={0.6}>
                  <animate attributeName="r" from="6" to="14" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.8" to="0" dur="1.5s" repeatCount="indefinite" />
                </circle>
                <circle cx={`${r.position.x + r.size.w / 2}%`} cy={`${r.position.y + r.size.h / 2}%`} r={4}
                  fill="#f472b6" />
              </g>
            )}
            {/* 选中或连线中的路线：在线中间画一个小标签 */}
            {(isSelected || isConnecting) && from && to && (
              <g pointerEvents="none">
                <rect
                  x={`${(x1 + x2) / 2 - 4}%`} y={`${(y1 + y2) / 2 - 1.8}%`} width="8%" height="3.6%"
                  fill="#0B0F14" stroke={color} strokeWidth={0.5} rx={2}
                />
                <text
                  x={`${(x1 + x2) / 2}%`} y={`${(y1 + y2) / 2}%`}
                  textAnchor="middle" dominantBaseline="middle" fill={color}
                  fontSize="9" fontFamily="monospace" fontWeight="bold"
                >
                  {r.name}
                </text>
              </g>
            )}
            {/* 路线删除按钮：只在选中时显示 */}
            {isSelected && (
              <g className="pointer-events-auto">
                <circle
                  cx={`${x2}%`} cy={`${y2}%`} r={7} fill="#0B0F14" stroke="#ef4444" strokeWidth={1}
                  transform={`translate(12, -12)`}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); onRemoveRoute(r.id); }}
                />
                <text
                  x={`${x2}%`} y={`${y2}%`}
                  textAnchor="middle" dominantBaseline="middle" fill="#ef4444"
                  fontSize="10" fontWeight="bold"
                  transform={`translate(12, -12)`}
                  pointerEvents="none"
                >×</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ============== 左侧：设备面板（按组分类） ==============
const PALETTE_GROUPS: { id: '设备' | '库位' | '通道' | '辅助'; desc: string }[] = [
  { id: '设备', desc: '业务节点' },
  { id: '库位', desc: '存放货物' },
  { id: '通道', desc: '连接/搬运' },
  { id: '辅助', desc: '容器/单位' },
];

function DevicePalette() {
  const kinds = Object.keys(DEVICE_DEFAULT) as StageDeviceKind[];
  return (
    <aside className="w-48 border-r border-bg-border bg-bg-panel/40 overflow-y-auto flex flex-col">
      <div className="p-3 border-b border-bg-border">
        <div className="label">设备库 / PALETTE</div>
        <div className="text-[9px] text-ink-muted font-mono mt-1 leading-tight">拖拽到中间画布 · 释放即放置 · 点击编辑</div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {PALETTE_GROUPS.map((g) => {
          const groupKinds = kinds.filter((k) => DEVICE_DEFAULT[k].group === g.id);
          return (
            <div key={g.id}>
              <div className="flex items-center gap-1 px-1 mb-1">
                <span className="text-[9px] font-mono uppercase tracking-widest text-accent-amber">{g.id}</span>
                <span className="text-[9px] text-ink-muted">· {g.desc}</span>
              </div>
              <div className="space-y-1">
                {groupKinds.map((k) => {
                  const { icon: Icon, label } = DEVICE_DEFAULT[k];
                  return (
                    <div
                      key={k}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/x-stage-device-kind', k)}
                      className="flex items-center gap-2 px-2 py-1.5 border border-bg-border bg-bg-base cursor-grab active:cursor-grabbing hover:border-accent-amber/60"
                      title={`拖入画布创建${label}`}
                    >
                      <Icon size={13} className="text-accent-amber shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-ink-primary font-mono truncate">{label}</div>
                      </div>
                      <MoreHorizontal size={10} className="text-ink-muted shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// ============== 中间：货架排设备（用 device 的 position/size，可上下左右拖 / 点选进详情） ==============
function ShelfRowDevice({ device, selected, onClick, onMove, onResize, onUpdate, onRemove, canvasRef, highlighted, onContextMenu }: {
  device: StageDevice;
  selected: boolean;
  onClick: () => void;
  onMove: (pos: { x: number; y: number }) => void;
  onResize: (size: { w: number; h: number }) => void;
  onUpdate: (patch: Partial<StageDevice>) => void;
  onRemove: () => void;
  canvasRef?: React.RefObject<HTMLDivElement | null>;
  highlighted?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const cellCount = device.cellCount ?? 14;
  const label = (device.fields?.rowLabel as string) ?? device.name;
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);
  const [draftCells, setDraftCells] = useState(cellCount);

  // 进入编辑时同步最新值（device.cellCount 变化后再次编辑要看到新值）
  useEffect(() => { if (!editing) setDraftLabel(label); }, [label, editing]);
  useEffect(() => { if (!editing) setDraftCells(cellCount); }, [cellCount, editing]);

  // 提交编辑：把 label + cellCount 一次性写入
  const commitEdit = useCallback(() => {
    const v = draftLabel.trim() || device.name;
    onUpdate({
      name: v,
      cellCount: Math.max(1, Math.min(50, draftCells)),
      fields: { ...(device.fields ?? {}), rowLabel: v },
    });
    setEditing(false);
  }, [draftLabel, draftCells, device.name, device.fields, onUpdate]);

  // 与 DeviceNode 同样的拖动算法：把 %-位置存进 device.position，未旋转不偏移
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button,input,textarea,select,.resize-handle')) return;
    e.stopPropagation();
    e.preventDefault();
    onClick();
    const canvasRect = canvasRef?.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...device.position };
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startX) / canvasRect.width) * 100;
      const dy = ((ev.clientY - startY) / canvasRect.height) * 100;
      const nx = Math.max(0, Math.min(100 - device.size.w, Math.round((startPos.x + dx) * 10) / 10));
      const ny = Math.max(0, Math.min(100 - device.size.h, Math.round((startPos.y + dy) * 10) / 10));
      onMove({ x: nx, y: ny });
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  // 八向 resize，n/s 改 size.h，e/w 改 size.w（角点同时改两个）
  const startResize = (e: React.PointerEvent, dir: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') => {
    e.stopPropagation();
    e.preventDefault();
    const canvasRect = canvasRef?.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...device.position };
    const startSize = { ...device.size };
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startX) / canvasRect.width) * 100;
      const dy = ((ev.clientY - startY) / canvasRect.height) * 100;
      let { x, y, w, h } = { x: startPos.x, y: startPos.y, w: startSize.w, h: startSize.h };
      if (dir.includes('e')) w = Math.max(15, Math.min(100 - x, startSize.w + dx));
      if (dir.includes('s')) h = Math.max(3,  Math.min(100 - y, startSize.h + dy));
      if (dir.includes('w')) { w = Math.max(15, startSize.w - dx); x = startPos.x + (startSize.w - w); }
      if (dir.includes('n')) { h = Math.max(3,  startSize.h - dy); y = startPos.y + (startSize.h - h); }
      onMove({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
      onResize({ w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 });
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  return (
    <div
      className={`absolute group ${selected ? 'z-10' : ''} ${highlighted ? 'ring-2 ring-accent-amber shadow-[0_0_12px_rgba(251,191,36,0.6)]' : ''}`}
      style={{
        left: `${device.position.x}%`,
        top: `${device.position.y}%`,
        width: `${device.size.w}%`,
        height: `${device.size.h}%`,
        minHeight: 40,
      }}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e); }}
      onClick={(e) => {
        // 只在非编辑态、且点到非按钮/输入/拖把/resize 时，选中（交给详情面板编辑）
        if ((e.target as HTMLElement).closest('button,input,textarea,select,.resize-handle')) return;
        e.stopPropagation();
        onClick();
      }}
    >
      {/* 标题条：拖动手柄 + 标签 + 元信息 + 编辑/删除按钮 */}
      <div
        className={`flex items-center gap-1.5 px-1.5 py-0.5 mb-0.5 select-none ${selected ? 'bg-accent-amber/15 ring-1 ring-accent-amber/40' : 'hover:bg-accent-amber/5'}`}
        title={`${device.name} · ${cellCount} cells · 按住标题条拖动 · 双击标签或点 ✏️ 编辑`}
      >
        {/* 拖动手柄（六点 grip，明确表示可拖） */}
        <GripVertical size={11} className="text-accent-amber/70 shrink-0 cursor-move" />
        {editing ? (
          <>
            <input
              autoFocus
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter')  { commitEdit(); }
                if (e.key === 'Escape') { setDraftLabel(label); setDraftCells(cellCount); setEditing(false); }
              }}
              className="text-[10px] text-accent-amber font-mono font-bold bg-bg-base border border-accent-amber/40 px-1 py-0.5 w-20 focus:outline-none"
              placeholder="排名"
            />
            <input
              type="number" min={1} max={50}
              value={draftCells}
              onChange={(e) => setDraftCells(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter')  { commitEdit(); }
                if (e.key === 'Escape') { setDraftLabel(label); setDraftCells(cellCount); setEditing(false); }
              }}
              className="w-10 text-[9px] text-ink-primary font-mono bg-bg-base border border-bg-border px-1 py-0.5 focus:outline-none focus:border-accent-amber"
              title="格数（回车保存）"
            />
            <span className="text-[8px] text-ink-muted font-mono">cells</span>
            <button
              onClick={commitEdit}
              className="ml-1 px-1.5 py-0.5 text-[9px] bg-accent-amber text-bg-base hover:bg-accent-amber/80"
              title="保存（回车也行）"
            >保存</button>
            <button
              onClick={() => { setDraftLabel(label); setDraftCells(cellCount); setEditing(false); }}
              className="px-1.5 py-0.5 text-[9px] text-ink-muted hover:text-accent-red border border-bg-border"
              title="取消"
            >取消</button>
          </>
        ) : (
          <>
            <span
              className="text-[10px] text-accent-amber font-mono font-bold bg-accent-amber/10 px-1.5 py-0.5 hover:bg-accent-amber/20 cursor-text"
              onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
              title="双击重命名 / 改格数"
            >
              {label}
            </span>
            <span className="text-[8px] text-ink-muted font-mono">{cellCount}格 · X{Math.round(device.position.x)}% · Y{Math.round(device.position.y)}%</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing((v) => !v); }}
            className="w-5 h-5 grid place-items-center text-ink-muted hover:text-accent-amber border border-transparent hover:border-accent-amber/40"
            title="编辑排（改名字 / 改格数）"
          >
            <Edit3 size={10} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="w-5 h-5 grid place-items-center text-ink-muted hover:text-accent-red hover:bg-accent-red/10 border border-transparent hover:border-accent-red/40"
            title={`删除货架排「${label}」`}
          >
            <X size={11} />
          </button>
        </div>
      </div>
      {/* 格子条（也作为拖动手柄区域） */}
      <div className="flex h-3 gap-px">
        {Array.from({ length: cellCount }, (_, i) => (
          <div key={i} className="flex-1 border border-amber-700/50 bg-amber-50/5" title={`${label} - ${i + 1}`} />
        ))}
      </div>
      {/* 选中时显示八向 resize 手柄 */}
      {selected && (
        <>
          <div onPointerDown={(e) => startResize(e, 'nw')} className="resize-handle absolute -top-1 -left-1 w-2.5 h-2.5 bg-accent-amber border border-bg-base cursor-nwse-resize z-10" style={{ touchAction: 'none' }} />
          <div onPointerDown={(e) => startResize(e, 'n')}  className="resize-handle absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-1.5 bg-accent-amber border border-bg-base cursor-ns-resize z-10" style={{ touchAction: 'none' }} />
          <div onPointerDown={(e) => startResize(e, 'ne')} className="resize-handle absolute -top-1 -right-1 w-2.5 h-2.5 bg-accent-amber border border-bg-base cursor-nesw-resize z-10" style={{ touchAction: 'none' }} />
          <div onPointerDown={(e) => startResize(e, 'w')}  className="resize-handle absolute top-1/2 -left-1 -translate-y-1/2 w-1.5 h-2.5 bg-accent-amber border border-bg-base cursor-ew-resize z-10" style={{ touchAction: 'none' }} />
          <div onPointerDown={(e) => startResize(e, 'e')}  className="resize-handle absolute top-1/2 -right-1 -translate-y-1/2 w-1.5 h-2.5 bg-accent-amber border border-bg-base cursor-ew-resize z-10" style={{ touchAction: 'none' }} />
          <div onPointerDown={(e) => startResize(e, 'sw')} className="resize-handle absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-accent-amber border border-bg-base cursor-nesw-resize z-10" style={{ touchAction: 'none' }} />
          <div onPointerDown={(e) => startResize(e, 's')}  className="resize-handle absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-1.5 bg-accent-amber border border-bg-base cursor-ns-resize z-10" style={{ touchAction: 'none' }} />
          <div onPointerDown={(e) => startResize(e, 'se')} className="resize-handle absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-accent-amber border border-bg-base cursor-nwse-resize z-10" style={{ touchAction: 'none' }} />
        </>
      )}
    </div>
  );
}

/** 判断一个设备中心点是否在区域矩形内（按百分比坐标） */
function isInsideZone(child: StageDevice, zone: StageDevice): boolean {
  // 用每个设备的「左/上/右/下」百分比边界做包含判断（中心点判断也行）
  const cz = child.position.x + child.size.w / 2;
  const cy = child.position.y + (child.size.h * 4) / 2; // 粗略（百分比 vs 像素）
  const zL = zone.position.x;
  const zT = zone.position.y;
  const zR = zone.position.x + zone.size.w;
  const zB = zone.position.y + zone.size.h;
  return cz >= zL && cz <= zR && cy >= zT && cy <= zB;
}

// ============== 中间：区域（容器，可包含立体库货架） ==============
function ZoneFrame({ device, selected, onClick, onMove, onResize, containedCount, canvasRef, highlighted, onContextMenu }: { device: StageDevice; selected: boolean; onClick: () => void; onMove: (pos: { x: number; y: number }) => void; onResize: (size: { w: number; h: number }) => void; containedCount?: number; canvasRef: React.RefObject<HTMLDivElement | null>; highlighted?: boolean; onContextMenu?: (e: React.MouseEvent) => void }) {
  const def = DEVICE_DEFAULT[device.kind];
  const { icon: Icon, shape } = def;
  const isWide = shape === 'wide';

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onClick();
    const canvasRect = canvasRef?.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const canvasW = canvasRect.width;
    const canvasH = canvasRect.height;
    // 用未旋转位置直接换算（区域不旋转，但保持一致风格）
    const deviceLeftPx = canvasRect.left + (canvasW * device.position.x) / 100;
    const deviceTopPx = canvasRect.top + (canvasH * device.position.y) / 100;
    const offsetPctX = ((e.clientX - deviceLeftPx) / canvasW) * 100;
    const offsetPctY = ((e.clientY - deviceTopPx) / canvasH) * 100;
    const move = (ev: PointerEvent) => {
      const cursorPctX = ((ev.clientX - canvasRect.left) / canvasW) * 100;
      const cursorPctY = ((ev.clientY - canvasRect.top) / canvasH) * 100;
      onMove({
        x: Math.max(0, Math.min(100, cursorPctX - offsetPctX)),
        y: Math.max(0, Math.min(100, cursorPctY - offsetPctY)),
      });
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  const startResize = (e: React.PointerEvent, dir: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 's' | 'n') => {
    e.stopPropagation(); e.preventDefault();
    const canvasRect = canvasRef?.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const canvasW = canvasRect.width;
    const startW = device.size.w, startH = device.size.h, startX = e.clientX, startY = e.clientY;
    const move = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - startX) / canvasW) * 100;
      const dyPx = ev.clientY - startY;
      let newW = startW, newH = startH;
      if (dir.includes('e')) newW = Math.max(5, startW + dxPct);
      if (dir.includes('w')) newW = Math.max(5, startW - dxPct);
      const dh = (dir.includes('s') ? dyPx : (dir === 'n' || dir === 'nw' || dir === 'ne' ? -dyPx : 0));
      if (dh !== 0) newH = Math.max(3, startH + Math.round(dh / 4));
      onResize({ w: newW, h: newH });
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e); }}
      title={`区域 · ${device.name} · 包含 ${containedCount ?? 0} 个货架`}
      style={{
        left: `${device.position.x}%`,
        top: `${device.position.y}%`,
        width: `${device.size.w}%`,
        height: `${Math.max(def.minH, device.size.h * 4)}px`,
        minWidth: `${def.minW}px`,
        minHeight: `${def.minH}px`,
      }}
      className={`absolute border-2 border-dashed ${selected ? 'border-accent-amber bg-accent-amber/5' : highlighted ? 'border-accent-amber bg-accent-amber/10' : 'border-purple-500/40 bg-purple-500/5'} cursor-move select-none touch-none overflow-visible ${selected ? 'ring-2 ring-accent-amber ring-offset-1 ring-offset-bg-base' : ''} ${highlighted ? 'shadow-[0_0_12px_rgba(251,191,36,0.5)]' : ''}`}
    >
      <div className="absolute top-1 left-1.5 right-1.5 flex items-center gap-1.5 pointer-events-none">
        <Icon size={11} className="text-purple-400 shrink-0" />
        <span className="text-[10px] text-purple-300 font-mono leading-none truncate flex-1 min-w-0">{device.name}</span>
        {typeof containedCount === 'number' && (
          <span className="text-[9px] text-ink-muted font-mono bg-purple-500/15 border border-purple-500/30 px-1">
            包含 {containedCount} 货架
          </span>
        )}
      </div>
      {selected && (
        <>
          <div onPointerDown={(e) => startResize(e, 'nw')} className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-accent-amber border border-bg-base cursor-nwse-resize" style={{ touchAction: 'none' }} />
          <div onPointerDown={(e) => startResize(e, 'n')} className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-1.5 bg-accent-amber border border-bg-base cursor-ns-resize" style={{ touchAction: 'none' }} />
          <div onPointerDown={(e) => startResize(e, 'ne')} className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-accent-amber border border-bg-base cursor-nesw-resize" style={{ touchAction: 'none' }} />
          <div onPointerDown={(e) => startResize(e, 'w')} className="absolute top-1/2 -left-1 -translate-y-1/2 w-1.5 h-2.5 bg-accent-amber border border-bg-base cursor-ew-resize" style={{ touchAction: 'none' }} />
          <div onPointerDown={(e) => startResize(e, 'e')} className="absolute top-1/2 -right-1 -translate-y-1/2 w-1.5 h-2.5 bg-accent-amber border border-bg-base cursor-ew-resize" style={{ touchAction: 'none' }} />
          <div onPointerDown={(e) => startResize(e, 'sw')} className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-accent-amber border border-bg-base cursor-nesw-resize" style={{ touchAction: 'none' }} />
          <div onPointerDown={(e) => startResize(e, 's')} className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-1.5 bg-accent-amber border border-bg-base cursor-ns-resize" style={{ touchAction: 'none' }} />
          <div onPointerDown={(e) => startResize(e, 'se')} className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-accent-amber border border-bg-base cursor-nwse-resize" style={{ touchAction: 'none' }} />
        </>
      )}
    </div>
  );
}

// ============== 中间：单个设备节点 ==============
function DeviceNode({ device, selected, onClick, onMove, onResize, onRotate, canvasRef, highlighted, onContextMenu }: { device: StageDevice; selected: boolean; onClick: () => void; onMove: (pos: { x: number; y: number }) => void; onResize: (size: { w: number; h: number }) => void; onRotate: (rotation: number) => void; canvasRef: React.RefObject<HTMLDivElement | null>; highlighted?: boolean; onContextMenu?: (e: React.MouseEvent) => void }) {
  const def = DEVICE_DEFAULT[device.kind];
  const rotation = device.rotation ?? 0;

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onClick();
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const canvasW = canvasRect.width;
    const canvasH = canvasRect.height;
    // ⚠ 关键：必须用"未旋转"的设备左上角（= position 直接换算），不能用 target.getBoundingClientRect()，
    //    否则旋转后的轴对齐包围盒比设备大一圈，offset 算错 → 拖动距离和指针移动距离对不上
    const deviceLeftPx = canvasRect.left + (canvasW * device.position.x) / 100;
    const deviceTopPx = canvasRect.top + (canvasH * device.position.y) / 100;
    const offsetPctX = ((e.clientX - deviceLeftPx) / canvasW) * 100;
    const offsetPctY = ((e.clientY - deviceTopPx) / canvasH) * 100;
    const move = (ev: PointerEvent) => {
      const cursorPctX = ((ev.clientX - canvasRect.left) / canvasW) * 100;
      const cursorPctY = ((ev.clientY - canvasRect.top) / canvasH) * 100;
      onMove({
        x: Math.max(0, Math.min(100, cursorPctX - offsetPctX)),
        y: Math.max(0, Math.min(100, cursorPctY - offsetPctY)),
      });
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  // 调整大小：四个角 + 四条边
  const startResize = (e: React.PointerEvent, dir: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 's' | 'n') => {
    e.stopPropagation();
    e.preventDefault();
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const startW = device.size.w;
    const startH = device.size.h;
    const startX = e.clientX;
    const startY = e.clientY;
    const canvasW = canvasRect.width;
    const canvasH = canvasRect.height;
    const move = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - startX) / canvasW) * 100;
      const dyPx = ev.clientY - startY;
      let newW = startW;
      let newH = startH;
      if (dir.includes('e')) newW = Math.max(1, startW + dxPct);
      if (dir.includes('w')) newW = Math.max(1, startW - dxPct);
      if (dir === 's' || dir === 'n') {
        const dh = dir === 's' ? dyPx : -dyPx;
        newH = Math.max(1, startH + Math.round(dh / 4));
      } else if (dir === 'se' || dir === 'sw' || dir === 'ne' || dir === 'nw') {
        const dh = dir.includes('s') ? dyPx : -dyPx;
        newH = Math.max(1, startH + Math.round(dh / 4));
      }
      onResize({ w: newW, h: newH });
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  // 旋转手柄：上方的圆点，拖动改变 rotation
  const startRotate = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLDivElement;
    // 设备中心 = 设备包装层（target 的父级）的第一个子元素的中心
    const deviceEl = target.parentElement;
    const deviceInner = deviceEl?.firstElementChild as HTMLElement | undefined;
    const rect = deviceInner?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    const startRotation = rotation;
    const move = (ev: PointerEvent) => {
      const curAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
      const delta = curAngle - startAngle;
      const next = Math.round((startRotation + delta) / 15) * 15;
      onRotate(((next % 360) + 360) % 360);
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  const { icon: Icon, shape } = def;
  const isLine = shape === 'line';
  const isWide = shape === 'wide';
  const innerIconSize = isLine ? 10 : isWide ? 11 : 12;

  return (
    <>
      {/* 旋转手柄（放在屏幕层，不被设备旋转） */}
      {selected && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${device.position.x + device.size.w / 2}%`,
            top: `${device.position.y}%`,
            transform: 'translate(-50%, -22px)',
            zIndex: 60,
          }}
        >
          <div className="absolute left-1/2 -translate-x-1/2 w-px h-4 bg-accent-amber" style={{ top: '14px' }} />
          <div
            onPointerDown={startRotate}
            title="拖动旋转"
            className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-accent-amber border border-bg-base cursor-crosshair pointer-events-auto hover:scale-125 transition-transform"
            style={{ top: '10px' }}
          />
        </div>
      )}
      {/* 设备本体（旋转包装层） */}
      <div
        style={{
          left: `${device.position.x}%`,
          top: `${device.position.y}%`,
          width: `${device.size.w}%`,
          transform: `rotate(${rotation}deg)`,
          transformOrigin: 'center center',
        }}
        className="absolute"
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e); }}
      >
        <div
          onPointerDown={onPointerDown}
          title={`${def.label} · ${device.name} · id:${device.id} · ${rotation}°`}
          style={{
            width: '100%',
            height: isLine ? `${Math.max(14, device.size.h * 4)}px` : `${Math.max(def.minH, device.size.h * 4)}px`,
            minWidth: `${def.minW}px`,
            minHeight: `${isLine ? 14 : def.minH}px`,
          }}
          className={`relative border-2 ${STATUS_COLOR[device.status]} ${selected ? 'ring-2 ring-accent-amber ring-offset-1 ring-offset-bg-base' : highlighted ? 'ring-2 ring-accent-amber shadow-[0_0_12px_rgba(251,191,36,0.6)]' : ''} cursor-move select-none touch-none overflow-visible`}
        >
          {isLine ? (
            <div className="absolute inset-0 flex items-center gap-1 px-1.5 overflow-hidden">
              <Icon size={innerIconSize} className="text-ink-muted shrink-0" />
              <span className="text-[9px] text-ink-primary font-mono leading-none truncate flex-1 min-w-0">{device.name}</span>
            </div>
          ) : isWide ? (
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 px-2 overflow-hidden">
              <Icon size={innerIconSize} className={def.color + ' shrink-0'} />
              <span className="text-[10px] text-ink-primary font-mono leading-none truncate flex-1 min-w-0">{device.name}</span>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-0.5 gap-0.5 overflow-hidden">
              <Icon size={innerIconSize} className={device.status === 'running' ? 'text-accent-green' : device.status === 'fault' ? 'text-accent-red' : def.color} />
              <span className="text-[8px] text-ink-primary font-mono leading-none truncate w-full text-center">{device.name}</span>
            </div>
          )}
          <div className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${STATUS_DOT[device.status]}`} />
          {rotation !== 0 && (
            <div className="absolute -top-4 left-0 px-1 py-0.5 bg-bg-base border border-accent-amber/40 text-[8px] font-mono text-accent-amber">
              {rotation}°
            </div>
          )}

          {/* 调整大小的 8 个手柄（仅选中时显示） */}
          {selected && (
            <>
              <div onPointerDown={(e) => startResize(e, 'nw')} className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-accent-amber border border-bg-base cursor-nwse-resize z-10" style={{ touchAction: 'none' }} />
              <div onPointerDown={(e) => startResize(e, 'n')} className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-1.5 bg-accent-amber border border-bg-base cursor-ns-resize z-10" style={{ touchAction: 'none' }} />
              <div onPointerDown={(e) => startResize(e, 'ne')} className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-accent-amber border border-bg-base cursor-nesw-resize z-10" style={{ touchAction: 'none' }} />
              <div onPointerDown={(e) => startResize(e, 'w')} className="absolute top-1/2 -left-1 -translate-y-1/2 w-1.5 h-2.5 bg-accent-amber border border-bg-base cursor-ew-resize z-10" style={{ touchAction: 'none' }} />
              <div onPointerDown={(e) => startResize(e, 'e')} className="absolute top-1/2 -right-1 -translate-y-1/2 w-1.5 h-2.5 bg-accent-amber border border-bg-base cursor-ew-resize z-10" style={{ touchAction: 'none' }} />
              <div onPointerDown={(e) => startResize(e, 'sw')} className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-accent-amber border border-bg-base cursor-nesw-resize z-10" style={{ touchAction: 'none' }} />
              <div onPointerDown={(e) => startResize(e, 's')} className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-1.5 bg-accent-amber border border-bg-base cursor-ns-resize z-10" style={{ touchAction: 'none' }} />
              <div onPointerDown={(e) => startResize(e, 'se')} className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-accent-amber border border-bg-base cursor-nwse-resize z-10" style={{ touchAction: 'none' }} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ============== 右侧：详情面板 ==============
// ============== 详情面板：字段编辑（FIELDS） ==============
function FieldEditor({ device, onUpdate }: { device: StageDevice; onUpdate: (patch: Partial<StageDevice>) => void }) {
  const defs = DEVICE_FIELDS_SCHEMA[device.kind] ?? [];
  const values = device.fields ?? {};
  if (defs.length === 0) {
    return <div className="text-[9px] text-ink-muted font-mono">该设备类型无字段</div>;
  }
  const setField = (key: string, val: string | number | boolean | null) => {
    onUpdate({ fields: { ...values, [key]: val } });
  };
  return (
    <div className="flex flex-col gap-1.5">
      {defs.map((d) => {
        const v = values[d.key] ?? d.defaultValue ?? '';
        return (
          <div key={d.key} className="grid grid-cols-[1fr_auto] items-center gap-1 text-[10px] font-mono">
            <label className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-ink-muted">{d.label}</span>
                {d.apiField && <span className="text-[8px] text-accent-amber/70">→{d.apiField}</span>}
              </div>
              {d.type === 'boolean' ? (
                <select
                  value={String(v)}
                  onChange={(e) => setField(d.key, e.target.value === 'true')}
                  className="bg-bg-base border border-bg-border px-1.5 py-0.5 text-ink-primary focus:outline-none focus:border-accent-amber"
                >
                  <option value="true">是</option>
                  <option value="false">否</option>
                </select>
              ) : d.type === 'enum' ? (
                <select
                  value={String(v)}
                  onChange={(e) => setField(d.key, e.target.value)}
                  className="bg-bg-base border border-bg-border px-1.5 py-0.5 text-ink-primary focus:outline-none focus:border-accent-amber"
                >
                  {d.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : d.type === 'number' ? (
                <input
                  type="number"
                  value={typeof v === 'number' ? v : Number(v) || 0}
                  onChange={(e) => setField(d.key, Number(e.target.value))}
                  className="bg-bg-base border border-bg-border px-1.5 py-0.5 text-ink-primary focus:outline-none focus:border-accent-amber"
                />
              ) : (
                <input
                  type="text"
                  value={String(v ?? '')}
                  onChange={(e) => setField(d.key, e.target.value)}
                  className="bg-bg-base border border-bg-border px-1.5 py-0.5 text-ink-primary focus:outline-none focus:border-accent-amber min-w-0"
                />
              )}
            </label>
            <div className="flex items-center gap-0.5">
              {d.apiField && (
                <button
                  onClick={() => navigator.clipboard?.writeText(`{{device.${d.apiField}}}`)}
                  className="px-1 py-0.5 text-[8px] text-ink-muted hover:text-accent-amber border border-transparent hover:border-accent-amber/40"
                  title={`复制为 API 变量：{{device.${d.apiField}}}`}
                >
                  {`{{device.${d.apiField}}}`}
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div className="text-[8px] text-ink-muted/70 font-mono pt-0.5 border-t border-bg-border/50 mt-1">
        仿真调用 API 时，{'{{device.xxx}}'} 会自动替换为对应字段值
      </div>
    </div>
  );
}

function DeviceDetailPanel({ device, onClose, onUpdate, onDelete, onEdit, allDevices, onPickEndpoint }: {
  device: StageDevice | null;
  onClose: () => void;
  onUpdate: (patch: Partial<StageDevice>) => void;
  onDelete: () => void;
  onEdit: () => void;
  allDevices?: StageDevice[];
  onPickEndpoint?: (kind: 'routeFrom' | 'routeTo') => void;
}) {
  if (!device) {
    return (
      <aside className="w-72 border-l border-bg-border bg-bg-panel/40 p-3">
        <div className="label mb-2">设备详情 / DETAIL</div>
        <div className="text-[10px] text-ink-muted font-mono leading-relaxed">
          点选画布上的任意设备 → 在此查看任务/指令/异常。
        </div>
      </aside>
    );
  }
  const { icon: Icon } = DEVICE_DEFAULT[device.kind];
  const biz = device.business;

  return (
    <aside className="w-72 border-l border-bg-border bg-bg-panel/40 flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-bg-border bg-bg-raised/40">
        <Icon size={13} className={DEVICE_DEFAULT[device.kind].color} />
        <span className="font-mono text-[10px] text-accent-amber uppercase tracking-widest">{device.kind}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={onEdit} className="w-6 h-6 grid place-items-center text-ink-muted hover:text-accent-amber" title="编辑业务配置"><Edit3 size={11} /></button>
          <button onClick={onDelete} className="w-6 h-6 grid place-items-center text-ink-muted hover:text-accent-red" title="删除"><Trash2 size={11} /></button>
          <button onClick={onClose} className="w-6 h-6 grid place-items-center text-ink-muted hover:text-ink-primary"><X size={11} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2 border-b border-bg-border bg-bg-raised/20">
          <div className="text-[11px] text-ink-primary font-mono font-bold">{device.name}</div>
          <div className="text-[9px] text-ink-muted font-mono mt-0.5">id: {device.id}</div>
        </div>

        {/* 位置 / 大小 / 旋转 */}
        <div className="px-3 py-2 border-b border-bg-border">
          <div className="text-[10px] text-ink-muted font-mono uppercase tracking-widest mb-1.5">位置 / 大小 / 旋转</div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
            <label className="flex flex-col">
              <span className="text-ink-muted">X %</span>
              <input
                type="number" min={0} max={100} step={0.5}
                value={Number(device.position.x.toFixed(2))}
                onChange={(e) => onUpdate({ position: { ...device.position, x: Math.max(0, Math.min(100, Number(e.target.value))) } })}
                className="bg-bg-base border border-bg-border px-1.5 py-1 text-ink-primary focus:outline-none focus:border-accent-amber"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-ink-muted">Y %</span>
              <input
                type="number" min={0} max={100} step={0.5}
                value={Number(device.position.y.toFixed(2))}
                onChange={(e) => onUpdate({ position: { ...device.position, y: Math.max(0, Math.min(100, Number(e.target.value))) } })}
                className="bg-bg-base border border-bg-border px-1.5 py-1 text-ink-primary focus:outline-none focus:border-accent-amber"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-ink-muted">W %</span>
              <input
                type="number" min={1} max={100} step={0.5}
                value={Number(device.size.w.toFixed(2))}
                onChange={(e) => onUpdate({ size: { ...device.size, w: Math.max(1, Math.min(100, Number(e.target.value))) } })}
                className="bg-bg-base border border-bg-border px-1.5 py-1 text-ink-primary focus:outline-none focus:border-accent-amber"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-ink-muted">H (×4px)</span>
              <input
                type="number" min={1} max={50} step={1}
                value={device.size.h}
                onChange={(e) => onUpdate({ size: { ...device.size, h: Math.max(1, Math.min(50, Number(e.target.value))) } })}
                className="bg-bg-base border border-bg-border px-1.5 py-1 text-ink-primary focus:outline-none focus:border-accent-amber"
              />
            </label>
          </div>
          <div className="mt-2">
            <div className="flex items-center justify-between text-[9px] font-mono text-ink-muted mb-1">
              <span>旋转 ROTATION</span>
              <span className="text-accent-amber">{device.rotation ?? 0}°</span>
            </div>
            <input
              type="range" min={0} max={359} step={15}
              value={device.rotation ?? 0}
              onChange={(e) => onUpdate({ rotation: Number(e.target.value) })}
              className="w-full accent-accent-amber"
            />
            <div className="grid grid-cols-5 gap-1 mt-1">
              {[0, 45, 90, 180, 270].map((deg) => (
                <button
                  key={deg}
                  onClick={() => onUpdate({ rotation: deg })}
                  className={`px-1 py-0.5 text-[9px] font-mono border ${
                    (device.rotation ?? 0) === deg
                      ? 'border-accent-amber bg-accent-amber/10 text-accent-amber'
                      : 'border-bg-border text-ink-muted hover:text-accent-amber hover:border-accent-amber/40'
                  }`}
                >
                  {deg}°
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 路线专用：起点 / 终点 / 类型 */}
        {device.kind === 'route' && (
          <div className="px-3 py-2 border-b border-bg-border">
            <div className="text-[10px] text-ink-muted font-mono uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Route size={10} className="text-pink-400" />
              端点 / ENDPOINTS
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-ink-muted font-mono w-10 shrink-0">起点</span>
                <select
                  value={device.routeFrom ?? ''}
                  onChange={(e) => onUpdate({ routeFrom: e.target.value || undefined })}
                  className="flex-1 min-w-0 bg-bg-base border border-bg-border px-1.5 py-1 text-[10px] text-ink-primary font-mono focus:outline-none focus:border-pink-400"
                >
                  <option value="">— 未选 —</option>
                  {(allDevices ?? []).filter((d) => d.id !== device.id && d.kind !== 'route').map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.kind})</option>
                  ))}
                </select>
                {onPickEndpoint && (
                  <button
                    onClick={() => onPickEndpoint('routeFrom')}
                    className="px-1.5 py-1 text-[9px] text-pink-400 border border-pink-400/40 hover:bg-pink-400/10 font-mono"
                    title="进入连线模式，点击画布上的设备来选起点"
                  >点选</button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-ink-muted font-mono w-10 shrink-0">终点</span>
                <select
                  value={device.routeTo ?? ''}
                  onChange={(e) => onUpdate({ routeTo: e.target.value || undefined, pendingConnection: false })}
                  className="flex-1 min-w-0 bg-bg-base border border-bg-border px-1.5 py-1 text-[10px] text-ink-primary font-mono focus:outline-none focus:border-pink-400"
                >
                  <option value="">— 未选 —</option>
                  {(allDevices ?? []).filter((d) => d.id !== device.id && d.kind !== 'route' && d.id !== device.routeFrom).map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.kind})</option>
                  ))}
                </select>
                {onPickEndpoint && (
                  <button
                    onClick={() => onPickEndpoint('routeTo')}
                    className="px-1.5 py-1 text-[9px] text-pink-400 border border-pink-400/40 hover:bg-pink-400/10 font-mono"
                    title="进入连线模式，点击画布上的设备来选终点"
                  >点选</button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-ink-muted font-mono w-10 shrink-0">类型</span>
                <select
                  value={device.routeType ?? 'both'}
                  onChange={(e) => onUpdate({ routeType: e.target.value as 'inbound' | 'outbound' | 'both' })}
                  className="flex-1 min-w-0 bg-bg-base border border-bg-border px-1.5 py-1 text-[10px] text-ink-primary font-mono focus:outline-none focus:border-pink-400"
                >
                  <option value="inbound">入库路径</option>
                  <option value="outbound">出库路径</option>
                  <option value="both">通用（双向）</option>
                </select>
              </div>
              {device.pendingConnection && (
                <div className="text-[9px] text-pink-400 font-mono mt-1 flex items-center gap-1">
                  <Crosshair size={9} /> 待连线：在画布上点击两个设备来端点
                </div>
              )}
            </div>
          </div>
        )}

        {/* 业务配置 */}
        {biz && (
          <div className="px-3 py-2 border-b border-bg-border">
            <div className="text-[10px] text-ink-muted font-mono uppercase tracking-widest mb-1.5">业务配置 / BUSINESS</div>
            {biz.inboundEvent?.enabled && (
              <div className="text-[10px] font-mono mb-1">
                <span className="text-amber-400">▼ 入库事件</span>
                <span className="text-ink-muted"> · 每次 </span>
                <span className="text-accent-amber">{biz.inboundEvent.ordersPerRun}</span>
                <span className="text-ink-muted"> 单 · </span>
                <span className="text-accent-amber">{biz.inboundEvent.avgLinesPerOrder}</span>
                <span className="text-ink-muted"> 行/单 · 策略 </span>
                <span className="text-accent-amber">{biz.inboundEvent.putawayStrategy}</span>
              </div>
            )}
            {biz.outboundEvent?.enabled && (
              <div className="text-[10px] font-mono mb-1">
                <span className="text-cyan-400">▲ 出库事件</span>
                <span className="text-ink-muted"> · 每次 </span>
                <span className="text-accent-amber">{biz.outboundEvent.ordersPerRun}</span>
                <span className="text-ink-muted"> 单 · </span>
                <span className="text-accent-amber">{biz.outboundEvent.avgLinesPerOrder}</span>
                <span className="text-ink-muted"> 行/单 · 策略 </span>
                <span className="text-accent-amber">{biz.outboundEvent.pickStrategy}</span>
              </div>
            )}
            {biz.stationRole && biz.stationRole !== 'idle' && (
              <div className="text-[10px] font-mono mb-1">
                <span className="text-cyan-400">▶ 工位角色</span>
                <span className="text-ink-muted"> · </span>
                <span className="text-accent-amber">{({ putaway: '上架', pick: '拣选', pack: '打包', replenish: '补货' } as Record<string, string>)[biz.stationRole]}</span>
              </div>
            )}
            {biz.capacity && (
              <div className="text-[10px] font-mono mb-1">
                <span className="text-orange-400">▣ 容量</span>
                <span className="text-ink-muted"> · {biz.capacity.zone} 库区 · ABC </span>
                <span className="text-accent-amber">{biz.capacity.abcClass}</span>
                <span className="text-ink-muted"> · {biz.capacity.max} 件</span>
              </div>
            )}
            {!biz.inboundEvent?.enabled && !biz.outboundEvent?.enabled && !biz.stationRole && !biz.capacity && (
              <div className="text-[10px] text-ink-muted font-mono">未配业务 · 点 ✎ 配置</div>
            )}
          </div>
        )}

        {/* 字段 / FIELDS（可映射到 API） */}
        <div className="px-3 py-2 border-b border-bg-border">
          <div className="text-[10px] text-ink-muted font-mono uppercase tracking-widest mb-1.5">
            字段 / FIELDS
            <span className="ml-1 text-[9px] text-accent-amber/80">→ 可映射 API</span>
          </div>
          <FieldEditor
            device={device}
            onUpdate={onUpdate}
          />
        </div>

        {/* 仿真结果字段 */}
        {(device.taskNumber || device.currentCommand || device.barcode || device.anomaly) && (
          <div className="px-3 py-2 border-b border-bg-border">
            <div className="text-[10px] text-ink-muted font-mono uppercase tracking-widest mb-1.5">仿真结果 / RUN RESULT</div>
            <table className="w-full text-[10px] font-mono">
              <tbody>
                {device.taskNumber && <tr><td className="text-ink-muted pr-2">任务</td><td className="text-ink-primary">{device.taskNumber}</td></tr>}
                {device.commandNumber && <tr><td className="text-ink-muted pr-2">指令</td><td className="text-ink-primary">{device.commandNumber}</td></tr>}
                {device.currentCommand && <tr><td className="text-ink-muted pr-2">状态</td><td className="text-ink-primary">{device.currentCommand}</td></tr>}
                {device.barcode && <tr><td className="text-ink-muted pr-2">条码</td><td className="text-ink-primary break-all">{device.barcode}</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* 异常 */}
        {device.anomaly && (
          <div className="px-3 py-2 border-b border-bg-border bg-accent-red/5">
            <div className="text-[10px] text-accent-red font-mono uppercase tracking-widest mb-1">异常 / ANOMALY</div>
            <div className="text-[10px] text-ink-primary font-mono whitespace-pre-wrap">{device.anomaly}</div>
          </div>
        )}
      </div>
      <div className="border-t border-bg-border bg-bg-raised/40 px-3 py-2 text-[9px] text-ink-muted font-mono">
        POSITION: x={device.position.x.toFixed(1)}% y={device.position.y.toFixed(1)}%
      </div>
    </aside>
  );
}

// ============== 详情编辑对话框（业务事件配置） ==============
type BizTab = 'basic' | 'inbound' | 'outbound' | 'station' | 'capacity';

function DeviceEditDialog({ device, onClose, onSave }: { device: StageDevice; onClose: () => void; onSave: (patch: Partial<StageDevice>) => void }) {
  const [name, setName] = useState(device.name);
  const [status, setStatus] = useState<DeviceStatus>(device.status);
  const [remark, setRemark] = useState(device.business?.remark ?? '');

  // 业务事件
  const [inbound, setInbound] = useState<InboundEventConfig>(device.business?.inboundEvent ?? { enabled: false, ordersPerRun: 5, skuPool: [], avgLinesPerOrder: 3, avgQtyPerLine: 8, putawayStrategy: 'abc' });
  const [outbound, setOutbound] = useState<OutboundEventConfig>(device.business?.outboundEvent ?? { enabled: false, ordersPerRun: 4, skuPool: [], avgLinesPerOrder: 4, avgQtyPerLine: 5, pickStrategy: 'batch' });
  const [stationRole, setStationRole] = useState<StationRole>(device.business?.stationRole ?? 'idle');
  const [capacity, setCapacity] = useState(device.business?.capacity ?? { max: 100, abcClass: 'B' as AbcClass, zone: 'A' });

  // Tabs 视设备 kind 决定
  const tabs: { id: BizTab; label: string; show: boolean }[] = [
    { id: 'basic',    label: '基础',      show: true },
    { id: 'inbound',  label: '▼ 入库',    show: device.kind === 'dock' || device.kind === 'station' },
    { id: 'outbound', label: '▲ 出库',    show: device.kind === 'dock' || device.kind === 'station' },
    { id: 'station',  label: '▶ 工位',    show: device.kind === 'station' },
    { id: 'capacity', label: '▣ 库位容量', show: device.kind === 'shelf' || device.kind === 'zone' },
  ];
  const [tab, setTab] = useState<BizTab>('basic');

  const handleSave = () => {
    const business: DeviceBusiness = {
      ...(device.business ?? {}),
      remark: remark || undefined,
    };
    if (device.kind === 'dock' || device.kind === 'station') {
      business.inboundEvent = inbound;
      business.outboundEvent = outbound;
    }
    if (device.kind === 'station') {
      business.stationRole = stationRole;
    }
    if (device.kind === 'shelf' || device.kind === 'zone') {
      business.capacity = capacity;
    }
    onSave({ name: name.trim() || device.name, status, business });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-bg-panel border border-bg-border w-[560px] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-bg-border bg-bg-raised/40">
          <Edit3 size={13} className="text-accent-amber" />
          <span className="font-mono text-[11px] text-ink-primary uppercase tracking-widest">编辑业务 / BUSINESS CONFIG</span>
          <span className="text-[10px] text-ink-muted font-mono">· {DEVICE_DEFAULT[device.kind].label} · {device.name}</span>
          <button onClick={onClose} className="ml-auto text-ink-muted hover:text-accent-red"><X size={14} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-bg-border bg-bg-raised/20">
          {tabs.filter((t) => t.show).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-[11px] font-mono border-b-2 ${tab === t.id ? 'border-accent-amber text-accent-amber' : 'border-transparent text-ink-muted hover:text-ink-primary'}`}
            >{t.label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-[11px]">
          {tab === 'basic' && (
            <>
              <div>
                <div className="label mb-1">设备名称</div>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none focus:border-accent-amber/60" />
              </div>
              <div>
                <div className="label mb-1">状态 / STATUS</div>
                <select value={status} onChange={(e) => setStatus(e.target.value as DeviceStatus)} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none">
                  <option value="normal">normal（正常）</option>
                  <option value="idle">idle（空闲）</option>
                  <option value="running">running（运行）</option>
                  <option value="blocked">blocked（堵塞）</option>
                  <option value="offline">offline（离线）</option>
                  <option value="fault">fault（故障）</option>
                </select>
              </div>
              <div>
                <div className="label mb-1">备注 / REMARK</div>
                <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none resize-y" placeholder="例如：3 号入库口，2025-06-11 升级" />
              </div>
            </>
          )}

          {tab === 'inbound' && (
            <>
              <div className="flex items-center gap-2 px-2 py-1.5 bg-amber-500/10 border border-amber-500/30">
                <input id="inbound-en" type="checkbox" checked={inbound.enabled} onChange={(e) => setInbound((b) => ({ ...b, enabled: e.target.checked }))} />
                <label htmlFor="inbound-en" className="text-amber-400 font-mono font-bold">启用入库事件</label>
                <span className="text-[9px] text-ink-muted ml-auto">卡车到此月台卸货 → 触发入库申请</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="label mb-1">每次仿真 · 生成单数</div>
                  <input type="number" min={0} max={50} value={inbound.ordersPerRun} onChange={(e) => setInbound((b) => ({ ...b, ordersPerRun: Math.max(0, Number(e.target.value)) }))} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none" />
                </div>
                <div>
                  <div className="label mb-1">每单行数（SKU 数）</div>
                  <input type="number" min={1} max={20} value={inbound.avgLinesPerOrder} onChange={(e) => setInbound((b) => ({ ...b, avgLinesPerOrder: Math.max(1, Number(e.target.value)) }))} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none" />
                </div>
                <div>
                  <div className="label mb-1">每行件数</div>
                  <input type="number" min={1} max={999} value={inbound.avgQtyPerLine} onChange={(e) => setInbound((b) => ({ ...b, avgQtyPerLine: Math.max(1, Number(e.target.value)) }))} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none" />
                </div>
                <div>
                  <div className="label mb-1">上架策略</div>
                  <select value={inbound.putawayStrategy} onChange={(e) => setInbound((b) => ({ ...b, putawayStrategy: e.target.value as PutawayStrategy }))} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none">
                    <option value="abc">ABC（按分类）</option>
                    <option value="fifo">FIFO（先进先出）</option>
                    <option value="near-dock">NEAR-DOCK（就近月台）</option>
                    <option value="random">RANDOM（随机）</option>
                  </select>
                </div>
              </div>
              <div>
                <div className="label mb-1">SKU 池（逗号分隔，留空 = 全部 SKU 随机）</div>
                <input value={inbound.skuPool.join(',')} onChange={(e) => setInbound((b) => ({ ...b, skuPool: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none font-mono" placeholder="SKU-0001,SKU-0002" />
              </div>
            </>
          )}

          {tab === 'outbound' && (
            <>
              <div className="flex items-center gap-2 px-2 py-1.5 bg-cyan-500/10 border border-cyan-500/30">
                <input id="outbound-en" type="checkbox" checked={outbound.enabled} onChange={(e) => setOutbound((b) => ({ ...b, enabled: e.target.checked }))} />
                <label htmlFor="outbound-en" className="text-cyan-400 font-mono font-bold">启用出库事件</label>
                <span className="text-[9px] text-ink-muted ml-auto">卡车到此月台装货 → 触发出库申请</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="label mb-1">每次仿真 · 生成单数</div>
                  <input type="number" min={0} max={50} value={outbound.ordersPerRun} onChange={(e) => setOutbound((b) => ({ ...b, ordersPerRun: Math.max(0, Number(e.target.value)) }))} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none" />
                </div>
                <div>
                  <div className="label mb-1">每单行数</div>
                  <input type="number" min={1} max={20} value={outbound.avgLinesPerOrder} onChange={(e) => setOutbound((b) => ({ ...b, avgLinesPerOrder: Math.max(1, Number(e.target.value)) }))} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none" />
                </div>
                <div>
                  <div className="label mb-1">每行件数</div>
                  <input type="number" min={1} max={999} value={outbound.avgQtyPerLine} onChange={(e) => setOutbound((b) => ({ ...b, avgQtyPerLine: Math.max(1, Number(e.target.value)) }))} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none" />
                </div>
                <div>
                  <div className="label mb-1">拣选策略</div>
                  <select value={outbound.pickStrategy} onChange={(e) => setOutbound((b) => ({ ...b, pickStrategy: e.target.value as PickStrategy }))} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none">
                    <option value="single">SINGLE（单订单拣选）</option>
                    <option value="batch">BATCH（合单拣选）</option>
                    <option value="zone">ZONE（分区拣选）</option>
                    <option value="wave">WAVE（波次拣选）</option>
                  </select>
                </div>
              </div>
              <div>
                <div className="label mb-1">SKU 池（逗号分隔，留空 = 全部 SKU 随机）</div>
                <input value={outbound.skuPool.join(',')} onChange={(e) => setOutbound((b) => ({ ...b, skuPool: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none font-mono" placeholder="SKU-0001,SKU-0002" />
              </div>
            </>
          )}

          {tab === 'station' && (
            <div>
              <div className="label mb-1">工位角色 / STATION ROLE</div>
              <div className="grid grid-cols-5 gap-1.5">
                {(['putaway', 'pick', 'pack', 'replenish', 'idle'] as StationRole[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setStationRole(r)}
                    className={`px-2 py-2 border text-[10px] font-mono ${stationRole === r ? 'border-accent-amber bg-accent-amber/10 text-accent-amber' : 'border-bg-border bg-bg-base text-ink-muted hover:text-ink-primary'}`}
                  >{({ putaway: '上架', pick: '拣选', pack: '打包', replenish: '补货', idle: '空闲' } as Record<string, string>)[r]}</button>
                ))}
              </div>
              <p className="text-[9px] text-ink-muted mt-2">· 上架/拣选：仿真时从这个工位分到的任务<br />· 打包：出库拣选完成后打包<br />· 补货：触发补货建议<br />· 空闲：不参与仿真</p>
            </div>
          )}

          {tab === 'capacity' && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="label mb-1">所属库区 / ZONE</div>
                <select value={capacity.zone} onChange={(e) => setCapacity((c) => ({ ...c, zone: e.target.value }))} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none">
                  {['A', 'B', 'C', 'D'].map((z) => <option key={z} value={z}>{z} 区</option>)}
                </select>
              </div>
              <div>
                <div className="label mb-1">ABC 分类 / ABC</div>
                <div className="flex gap-1">
                  {(['A', 'B', 'C'] as AbcClass[]).map((a) => (
                    <button
                      key={a}
                      onClick={() => setCapacity((c) => ({ ...c, abcClass: a }))}
                      className={`flex-1 px-2 py-1.5 border font-mono ${capacity.abcClass === a ? 'border-accent-amber bg-accent-amber/10 text-accent-amber' : 'border-bg-border bg-bg-base text-ink-muted'}`}
                    >{a}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="label mb-1">最大容量 / MAX</div>
                <input type="number" min={0} max={9999} value={capacity.max} onChange={(e) => setCapacity((c) => ({ ...c, max: Math.max(0, Number(e.target.value)) }))} className="w-full bg-bg-base border border-bg-border px-2 py-1.5 focus:outline-none" />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-bg-border bg-bg-raised/40">
          <button onClick={onClose} className="px-3 py-1.5 text-[11px] text-ink-muted hover:text-ink-primary">取消</button>
          <button onClick={handleSave} className="px-3 py-1.5 text-[11px] bg-accent-amber text-bg-base flex items-center gap-1">
            <Save size={11} /> 保存业务配置
          </button>
        </div>
      </div>
    </div>
  );
}

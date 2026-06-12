import { useStore, useCurrentScenario } from '@/stores/sandbox';
import { Check, Trash2, ArrowUp, ArrowDown, Power, MapPin, ArrowRight } from 'lucide-react';
import type { ScenarioNode, SimulateSubKind } from '@/lib/types';
import { classNames } from '@/lib/utils';

const SIMULATE_LABELS: Record<SimulateSubKind, string> = {
  inbound: '入库申请',
  outbound: '出库单',
  inventory: '初始库存',
  'inventory-order': '库存单',
  allocate: '入库·库存分配',
  putaway: '入库·上架',
  'outbound-allocate': '出库·分配',
  cartonize: '出库·组盘',
  picklist: '出库·拣选单',
  pick: '出库·拣选路径',
  down: '出库·下架',
  pack: '出库·打包',
  ship: '出库·发货',
  'agv-deliver': '出库·AGV 配送',
  replenish: '补货扫描',
  custom: '自定义脚本',
};

const NODE_ICONS: Record<string, string> = {
  simulate: '◉',
  api: '⇄',
  transform: '⇒',
};

export default function ScopePicker() {
  const scenario = useCurrentScenario();
  const toggleNode = useStore((s) => s.toggleNode);
  const moveNode = useStore((s) => s.moveNode);
  const setCurrentScenario = useStore((s) => s.setCurrentScenario);

  if (!scenario) {
    return (
      <div className="text-[11px] font-mono text-ink-muted text-center py-4">
        请先在「场景编排」中创建或选择场景
      </div>
    );
  }
  const nodes = scenario.nodes;
  const enabled = nodes.filter((n) => n.enabled).length;

  return (
    <div className="space-y-2">
      {/* 场景下拉（快速切换） */}
      <select
        value={scenario.id}
        onChange={(e) => setCurrentScenario(e.target.value)}
        className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-xs font-mono text-ink-primary focus:outline-none focus:border-accent-amber/60"
      >
        {useStore.getState().scenarios.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      <div className="flex items-center justify-between text-[10px] font-mono text-ink-muted">
        <span>已启用 {enabled} / {nodes.length} 个节点</span>
        {scenario.builtin && <span className="chip-blue">内置</span>}
      </div>

      <div className="space-y-1.5">
        {nodes.map((node, idx) => (
          <NodeRow
            key={node.id}
            node={node}
            isFirst={idx === 0}
            isLast={idx === nodes.length - 1}
            onToggle={() => toggleNode(scenario.id, node.id)}
            onUp={() => moveNode(scenario.id, node.id, 'up')}
            onDown={() => moveNode(scenario.id, node.id, 'down')}
          />
        ))}
      </div>
    </div>
  );
}

function NodeRow({ node, isFirst, isLast, onToggle, onUp, onDown }: {
  node: ScenarioNode;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const label = node.kind === 'simulate'
    ? SIMULATE_LABELS[node.simulate?.subKind ?? 'inbound']
    : node.kind === 'api' ? 'API 接口' : '透传';

  return (
    <div className={classNames(
      'group flex items-center gap-2 px-2 py-2 border text-xs font-mono',
      node.enabled ? 'border-bg-border bg-bg-raised' : 'border-bg-border/40 bg-bg-base/30 opacity-50',
    )}>
      <button
        onClick={onToggle}
        className={classNames(
          'w-4 h-4 grid place-items-center border shrink-0',
          node.enabled ? 'border-accent-amber bg-accent-amber text-bg-base' : 'border-bg-border text-transparent',
        )}
        title={node.enabled ? '点击禁用' : '点击启用'}
      >
        <Check size={10} strokeWidth={3} />
      </button>
      <span className={classNames(
        'w-5 text-center text-[12px] shrink-0',
        node.kind === 'api' ? 'text-accent-blue' : 'text-accent-amber',
      )}>
        {NODE_ICONS[node.kind]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-ink-primary truncate">{node.name}</div>
        <div className="text-[9px] text-ink-muted truncate">
          {label}
          {node.kind === 'api' && node.api?.url && ` · ${node.api.method}`}
          {node.dependsOn.length > 0 && ` · 依赖 ${node.dependsOn.length} 个`}
        </div>
        {(node.sourceDeviceIds?.length || node.targetDeviceIds?.length) ? (
          <div className="flex items-center gap-1 mt-0.5">
            {node.sourceDeviceIds && node.sourceDeviceIds.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[8px] font-mono text-accent-amber/80 border border-accent-amber/30 px-1">
                <MapPin size={7} />源 {node.sourceDeviceIds.length}
              </span>
            )}
            {node.targetDeviceIds && node.targetDeviceIds.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[8px] font-mono text-accent-green/80 border border-accent-green/30 px-1">
                <ArrowRight size={7} />终 {node.targetDeviceIds.length}
              </span>
            )}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onUp}
          disabled={isFirst}
          className="w-5 h-5 grid place-items-center text-ink-muted hover:text-accent-amber disabled:opacity-30"
          title="上移"
        >
          <ArrowUp size={10} />
        </button>
        <button
          onClick={onDown}
          disabled={isLast}
          className="w-5 h-5 grid place-items-center text-ink-muted hover:text-accent-amber disabled:opacity-30"
          title="下移"
        >
          <ArrowDown size={10} />
        </button>
        <button
          onClick={onToggle}
          className="w-5 h-5 grid place-items-center text-ink-muted hover:text-accent-amber"
          title="启用/禁用"
        >
          <Power size={10} />
        </button>
      </div>
    </div>
  );
}

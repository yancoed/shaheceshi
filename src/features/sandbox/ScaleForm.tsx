import { useStore, useCurrentScenario } from '@/stores/sandbox';
import type { PutawayStrategyId, PickStrategyId, SimulateConfig } from '@/lib/types';
import { useMemo } from 'react';

const PUTAWAY_OPTIONS = [
  { id: 'nearest',  name: '就近上架' },
  { id: 'category', name: '同类集中' },
  { id: 'capacity', name: '容量优先' },
  { id: 'fifo',     name: '编号顺序' },
] as const;

const PICK_OPTIONS = [
  { id: 's_shape',     name: 'S 形遍历' },
  { id: 'return',      name: '返回式' },
  { id: 'midpoint',    name: '中点分割' },
  { id: 'largest_gap', name: '最大间隙' },
] as const;

export default function ScaleForm() {
  const scenario = useCurrentScenario();
  const config = useStore((s) => s.config);
  const setScale = useStore((s) => s.setScale);
  const setStrategy = useStore((s) => s.setStrategy);
  const setSeed = useStore((s) => s.setSeed);
  const updateNode = useStore((s) => s.updateNode);
  const templates = useStore((s) => s.templates);
  const setCurrentScenario = useStore((s) => s.setCurrentScenario);
  const updateScenario = useStore((s) => s.updateScenario);

  // 收集场景中所有「allocate」「pick」「replenish」节点的当前值
  const allocateNodes = useMemo(() => scenario?.nodes.filter((n) => n.kind === 'simulate' && n.simulate?.subKind === 'allocate') ?? [], [scenario]);
  const pickNodes = useMemo(() => scenario?.nodes.filter((n) => n.kind === 'simulate' && n.simulate?.subKind === 'pick') ?? [], [scenario]);
  const replenishNodes = useMemo(() => scenario?.nodes.filter((n) => n.kind === 'simulate' && n.simulate?.subKind === 'replenish') ?? [], [scenario]);
  const inboundNodes = useMemo(() => scenario?.nodes.filter((n) => n.kind === 'simulate' && n.simulate?.subKind === 'inbound') ?? [], [scenario]);

  // 写策略时同步到所有匹配节点
  const applyPutaway = (v: PutawayStrategyId) => {
    setStrategy({ putaway: v });
    allocateNodes.forEach((n) => updateNode(scenario!.id, n.id, { simulate: { ...n.simulate!, putawayStrategy: v } as SimulateConfig }));
  };
  const applyPick = (v: PickStrategyId) => {
    setStrategy({ pick: v });
    pickNodes.forEach((n) => updateNode(scenario!.id, n.id, { simulate: { ...n.simulate!, pickStrategy: v } as SimulateConfig }));
  };
  const applyThreshold = (n: number) => {
    setStrategy({ replenishThreshold: n });
    replenishNodes.forEach((nd) => updateNode(scenario!.id, nd.id, { simulate: { ...nd.simulate!, replenishThreshold: n } as SimulateConfig }));
  };
  const applyInboundCount = (n: number) => {
    setScale({ ...config.scale, orders: n });
    inboundNodes.forEach((nd) => updateNode(scenario!.id, nd.id, { simulate: { ...nd.simulate!, count: n } as SimulateConfig }));
  };

  // 关联模板
  const linkTemplate = (id: string) => {
    updateScenario(scenario!.id, { templateId: id === '' ? undefined : id });
  };

  if (!scenario) return null;

  return (
    <div className="space-y-4">
      {inboundNodes.length > 0 && (
        <div>
          <div className="label mb-2">入库数量 / ORDERS</div>
          <NumberField value={config.scale.orders} onChange={applyInboundCount} min={1} max={50} unit="单" />
        </div>
      )}

      {allocateNodes.length > 0 && (
        <div>
          <div className="label mb-2">上架策略 / PUTAWAY · 作用于 {allocateNodes.length} 个节点</div>
          <SelectField value={config.strategy.putaway} onChange={applyPutaway} options={PUTAWAY_OPTIONS} />
        </div>
      )}

      {pickNodes.length > 0 && (
        <div>
          <div className="label mb-2">拣选路径 / PICK · 作用于 {pickNodes.length} 个节点</div>
          <SelectField value={config.strategy.pick} onChange={applyPick} options={PICK_OPTIONS} />
        </div>
      )}

      {replenishNodes.length > 0 && (
        <div>
          <div className="label mb-2">补货阈值 / THRESHOLD · 作用于 {replenishNodes.length} 个节点</div>
          <NumberField value={config.strategy.replenishThreshold} onChange={applyThreshold} min={5} max={80} unit="单位" />
        </div>
      )}

      <div>
        <div className="label mb-2">关联数据模板 / TEMPLATE</div>
        <select
          value={scenario.templateId ?? ''}
          onChange={(e) => linkTemplate(e.target.value)}
          className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-xs font-mono text-ink-primary focus:outline-none focus:border-accent-amber/60"
        >
          <option value="">— 不使用模板（随机生成） —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name} · {t.fields.length} 字段 · {t.rowCount} 行</option>
          ))}
        </select>
        <p className="text-[10px] text-ink-muted font-mono mt-1 leading-relaxed">
          关联后，模拟将按该模板字段生成数据
        </p>
      </div>

      <div>
        <div className="label mb-2">随机种子 / SEED</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={config.seed ?? 0}
            onChange={(e) => setSeed(Number(e.target.value))}
            className="flex-1 h-8 bg-bg-base border border-bg-border px-2 text-xs font-mono text-ink-primary focus:outline-none focus:border-accent-amber/60"
          />
          <button onClick={() => setSeed(Date.now() % 100000)} className="btn-ghost text-[10px] py-1.5">随机</button>
        </div>
      </div>

      {scenario.nodes.length === 0 && (
        <div className="text-[11px] font-mono text-ink-muted text-center py-3">
          当前场景没有任何节点，请到「场景编排」添加
        </div>
      )}
    </div>
  );
}

function NumberField({ value, onChange, min = 1, max = 999, unit }: { value: number; onChange: (n: number) => void; min?: number; max?: number; unit?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        {unit && <span className="text-[9px] font-mono text-ink-muted">{unit}</span>}
      </div>
      <div className="flex items-center border border-bg-border bg-bg-base">
        <button onClick={() => onChange(Math.max(min, value - 1))} className="w-7 h-8 grid place-items-center text-ink-secondary hover:text-accent-amber hover:bg-bg-raised">−</button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
          className="flex-1 h-8 bg-transparent text-center font-mono text-sm text-ink-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button onClick={() => onChange(Math.min(max, value + 1))} className="w-7 h-8 grid place-items-center text-ink-secondary hover:text-accent-amber hover:bg-bg-raised">+</button>
      </div>
    </div>
  );
}

function SelectField<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: readonly { id: T; name: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-2 py-1.5 text-left border transition-colors ${
            value === o.id
              ? 'border-accent-amber bg-accent-amber/5 text-ink-primary'
              : 'border-bg-border bg-bg-raised text-ink-secondary hover:border-bg-border/60'
          }`}
        >
          <div className="font-mono text-xs">{o.name}</div>
        </button>
      ))}
    </div>
  );
}

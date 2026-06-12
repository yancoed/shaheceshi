import type { ScenarioNode, SimulateSubKind, StageDevice, StageDeviceKind, DeviceStatus } from '@/lib/types';
import { useStore } from '@/stores/sandbox';
import { X, ArrowUp, ArrowDown, Power, Trash2, MapPin, ArrowRight, Package, Cpu } from 'lucide-react';
import ApiConfigEditor from './ApiConfigEditor';

export const SIMULATE_OPTIONS: { id: SimulateSubKind; name: string; desc: string }[] = [
  { id: 'inbound',   name: '入库申请',   desc: '生成入库单 + 容器' },
  { id: 'outbound',  name: '出库单',     desc: '生成出库单 + 拣选行' },
  { id: 'inventory', name: '初始库存',   desc: '生成基础库存分布' },
  { id: 'allocate',  name: '库存分配',   desc: '为入库行分配库位' },
  { id: 'putaway',   name: '上架策略',   desc: '校验上架结果' },
  { id: 'pick',      name: '拣选路径',   desc: '计算拣选路径' },
  { id: 'replenish', name: '补货扫描',   desc: '生成补货建议' },
  { id: 'custom',    name: '自定义脚本', desc: '执行自定义脚本片段' },
];

export default function NodeEditor({ node, scenarioId, isFirst, isLast }: { node: ScenarioNode; scenarioId: string; isFirst: boolean; isLast: boolean }) {
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const moveNode = useStore((s) => s.moveNode);
  const toggleNode = useStore((s) => s.toggleNode);
  const allNodes = useStore((s) => s.scenarios.find((sc) => sc.id === scenarioId)?.nodes ?? []);
  const boundTpl = useStore((s) => node.templateId ? s.templates.find((t) => t.id === node.templateId) : undefined);
  const isBatchApi = node.kind === 'api' && !!boundTpl;

  const update = (patch: Partial<ScenarioNode>) => updateNode(scenarioId, node.id, patch);

  return (
    <div className={`border ${isBatchApi ? 'border-accent-blue/60' : 'border-bg-border'} bg-bg-panel/60`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-bg-border bg-bg-raised/40">
        <span className={`w-2 h-2 rounded-full ${node.enabled ? 'bg-accent-green dot-live' : 'bg-ink-muted'}`} />
        <span className="font-mono text-[10px] text-ink-muted">{node.id}</span>
        <span className={`chip ml-1 ${node.kind === 'api' ? 'chip-blue' : 'chip-amber'}`}>{node.kind.toUpperCase()}</span>
        {isBatchApi && (
          <span className="chip chip-blue" title="已绑定模板，将按行批量调用">
            BATCH ×{boundTpl!.rowCount}
          </span>
        )}
        {node.kind === 'simulate' && boundTpl && (
          <span className="chip chip-amber" title="已绑定模板，使用模板数据生成">TPL ×{boundTpl.rowCount}</span>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          <button onClick={() => moveNode(scenarioId, node.id, 'up')} disabled={isFirst} className="w-6 h-6 grid place-items-center text-ink-muted hover:text-accent-amber disabled:opacity-30"><ArrowUp size={11} /></button>
          <button onClick={() => moveNode(scenarioId, node.id, 'down')} disabled={isLast} className="w-6 h-6 grid place-items-center text-ink-muted hover:text-accent-amber disabled:opacity-30"><ArrowDown size={11} /></button>
          <button onClick={() => toggleNode(scenarioId, node.id)} className="w-6 h-6 grid place-items-center text-ink-muted hover:text-accent-amber" title="启用/禁用"><Power size={11} /></button>
          <button onClick={() => deleteNode(scenarioId, node.id)} className="w-6 h-6 grid place-items-center text-ink-muted hover:text-accent-red" title="删除"><Trash2 size={11} /></button>
        </span>
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="label">节点 ID / NODE ID</span>
            <input
              value={node.id}
              onChange={(e) => update({ id: e.target.value.replace(/\s/g, '-') })}
              className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] font-mono text-accent-amber focus:outline-none mt-1"
            />
          </div>
          <div>
            <span className="label">显示名 / NAME</span>
            <input
              value={node.name}
              onChange={(e) => update({ name: e.target.value })}
              className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] text-ink-primary focus:outline-none mt-1"
            />
          </div>
        </div>

        <div>
          <span className="label">节点类型 / KIND</span>
          <div className="flex border border-bg-border mt-1">
            {(['simulate', 'api'] as const).map((k) => (
              <button
                key={k}
                onClick={() => {
                  if (k === 'api' && node.kind !== 'api') {
                    update({ kind: 'api', simulate: undefined, api: { method: 'POST', url: '', headers: { 'Content-Type': 'application/json' }, body: '{}', responseMapping: '', mockResponse: '{}', timeoutMs: 3000, retry: 0, batchConcurrency: 5 } });
                  } else if (k === 'simulate' && node.kind !== 'simulate') {
                    update({ kind: 'simulate', api: undefined, simulate: { subKind: 'inbound', count: 12 } });
                  }
                }}
                className={`flex-1 py-1.5 text-[11px] font-mono ${node.kind === k ? 'bg-accent-amber/10 text-accent-amber border-r last:border-r-0 border-bg-border' : 'text-ink-secondary border-r last:border-r-0 border-bg-border'}`}
              >
                {k === 'simulate' ? '模拟 · SIMULATE' : '接口 · API'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">依赖节点 / DEPENDS ON</span>
          <div className="flex flex-wrap gap-1 mt-1 p-1.5 border border-bg-border bg-bg-base min-h-[32px]">
            {allNodes.filter((n) => n.id !== node.id).map((n) => {
              const checked = node.dependsOn.includes(n.id);
              return (
                <button
                  key={n.id}
                  onClick={() => update({
                    dependsOn: checked ? node.dependsOn.filter((x) => x !== n.id) : [...node.dependsOn, n.id],
                  })}
                  className={`px-2 py-0.5 text-[10px] font-mono border ${
                    checked ? 'border-accent-amber bg-accent-amber/10 text-accent-amber' : 'border-bg-border text-ink-muted hover:text-ink-secondary'
                  }`}
                  title={n.name}
                >
                  {n.id}
                </button>
              );
            })}
            {allNodes.length <= 1 && <span className="text-[10px] text-ink-muted font-mono">暂无其他节点</span>}
          </div>
        </div>

        <TemplatePicker node={node} onChange={update} />

        {node.kind === 'simulate' && (
          <SimulateBlock node={node} scenarioId={scenarioId} onChange={update} />
        )}

        {node.kind === 'api' && node.api && (
          <>
            <div>
              <div className="label mb-1.5">API 配置 / API CONFIG</div>
              <ApiConfigEditor
                api={node.api}
                onChange={(api) => update({ api })}
                boundTpl={boundTpl}
                scenarioId={scenarioId}
                node={node}
              />
            </div>
            <DeviceBinding
              scenarioId={scenarioId}
              node={node}
              subKind={'custom'}  // 强制用 custom 的「全部设备可绑」映射
              onChange={update}
              forceAll
            />
          </>
        )}

        <div>
          <span className="label">备注 / DESCRIPTION</span>
          <textarea
            value={node.description ?? ''}
            onChange={(e) => update({ description: e.target.value })}
            rows={2}
            placeholder="可选，说明此节点的用途..."
            className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] text-ink-primary focus:outline-none mt-1 resize-none"
          />
        </div>
      </div>
    </div>
  );
}

function TemplatePicker({ node, onChange }: { node: ScenarioNode; onChange: (p: Partial<ScenarioNode>) => void }) {
  const templates = useStore((s) => s.templates);
  const boundTpl = node.templateId ? templates.find((t) => t.id === node.templateId) : undefined;
  const setTemplate = (id: string | undefined) => onChange({ templateId: id && id !== '__none__' ? id : undefined });
  const isApi = node.kind === 'api';
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="label">数据模板 / TEMPLATE{isApi ? ' · 批量调用' : ''}</span>
        {boundTpl && (
          <span className="text-[9px] font-mono text-accent-amber">
            ✓ 已绑定 · {boundTpl.fields.length} 字段 · {boundTpl.rowCount} 行
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 mt-1">
        <select
          value={node.templateId ?? '__none__'}
          onChange={(e) => setTemplate(e.target.value)}
          className="flex-1 bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] text-accent-amber focus:outline-none"
        >
          <option value="__none__">
            — 不绑定（{isApi ? '单次调用' : '使用内置 mock'}）—
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.fields.length} 字段 · {t.rowCount} 行
            </option>
          ))}
        </select>
        {node.templateId && (
          <button
            onClick={() => setTemplate(undefined)}
            className="text-[10px] text-ink-muted hover:text-accent-red px-1.5 py-1.5"
            title="解绑"
          >
            解绑
          </button>
        )}
      </div>
      {boundTpl && (
        <div className="text-[9px] text-ink-muted font-mono mt-1 leading-tight">
          {isApi
            ? `启用后将按模板 ${boundTpl.rowCount} 行循环调用本接口，每行字段通过 {{fieldName}} 插入 URL/Headers/Body。`
            : boundTpl.description}
        </div>
      )}
    </div>
  );
}

function SimulateBlock({ node, scenarioId, onChange }: { node: ScenarioNode; scenarioId: string; onChange: (p: Partial<ScenarioNode>) => void }) {
  const cfg = node.simulate ?? { subKind: 'inbound' as const, count: 12 };
  const updateCfg = (patch: Partial<typeof cfg>) => onChange({ simulate: { ...cfg, ...patch } });

  return (
    <div className="border border-bg-border bg-bg-raised/40 p-3 space-y-3">
      <div>
        <span className="label">模拟类型 / SUB-KIND</span>
        <div className="grid grid-cols-2 gap-1 mt-1">
          {SIMULATE_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => updateCfg({ subKind: o.id })}
              className={`px-2 py-1.5 text-left border ${
                cfg.subKind === o.id
                  ? 'border-accent-amber bg-accent-amber/5 text-ink-primary'
                  : 'border-bg-border bg-bg-base text-ink-secondary hover:border-bg-border/60'
              }`}
            >
              <div className="font-mono text-[11px]">{o.name}</div>
              <div className="text-[9px] text-ink-muted">{o.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {['inbound', 'outbound'].includes(cfg.subKind) && (
        <NumField label="数量" value={cfg.count ?? 12} onChange={(n) => updateCfg({ count: n })} min={1} max={200} unit="单" />
      )}

      {cfg.subKind === 'allocate' && (
        <div>
          <span className="label">上架策略 / PUTAWAY</span>
          <div className="grid grid-cols-2 gap-1 mt-1">
            {[
              { id: 'nearest',  name: '就近上架' },
              { id: 'category', name: '同类集中' },
              { id: 'capacity', name: '容量优先' },
              { id: 'fifo',     name: '编号顺序' },
            ].map((o) => (
              <button
                key={o.id}
                onClick={() => updateCfg({ putawayStrategy: o.id as 'nearest' })}
                className={`px-2 py-1.5 text-[11px] font-mono border ${
                  cfg.putawayStrategy === o.id
                    ? 'border-accent-amber bg-accent-amber/5 text-ink-primary'
                    : 'border-bg-border bg-bg-base text-ink-secondary'
                }`}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {cfg.subKind === 'pick' && (
        <div>
          <span className="label">拣选路径 / PICK</span>
          <div className="grid grid-cols-2 gap-1 mt-1">
            {[
              { id: 's_shape',     name: 'S 形遍历' },
              { id: 'return',      name: '返回式' },
              { id: 'midpoint',    name: '中点分割' },
              { id: 'largest_gap', name: '最大间隙' },
            ].map((o) => (
              <button
                key={o.id}
                onClick={() => updateCfg({ pickStrategy: o.id as 's_shape' })}
                className={`px-2 py-1.5 text-[11px] font-mono border ${
                  cfg.pickStrategy === o.id
                    ? 'border-accent-amber bg-accent-amber/5 text-ink-primary'
                    : 'border-bg-border bg-bg-base text-ink-secondary'
                }`}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {cfg.subKind === 'replenish' && (
        <NumField label="补货阈值" value={cfg.replenishThreshold ?? 30} onChange={(n) => updateCfg({ replenishThreshold: n })} min={5} max={80} unit="单位" />
      )}

      {cfg.subKind === 'custom' && (
        <div>
          <span className="label">自定义脚本 / SCRIPT</span>
          <textarea
            value={cfg.customScript ?? ''}
            onChange={(e) => updateCfg({ customScript: e.target.value })}
            rows={3}
            placeholder="// 沙盒内仅做回显，可填写业务描述或后续接入真实执行器"
            className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] text-ink-primary font-mono focus:outline-none mt-1 resize-y"
          />
        </div>
      )}

      <DeviceBinding scenarioId={scenarioId} node={node} subKind={cfg.subKind} onChange={onChange} />
    </div>
  );
}

// ============== 设备绑定：来源 / 目标 ==============
const KIND_LABEL: Record<StageDeviceKind, string> = {
  dock: '月台', station: '工位', shelfRow: '货架排', shelf: '立体库货架', zone: '区域',
  agv: 'AGV', conveyor: '输送线', chute: '滑槽',
  aisle: '巷道', stack: '堆垛机', lift: '提升机', pallet: '托盘', tote: '料箱',
  route: '路线',
};
const KIND_ICON: Record<StageDeviceKind, string> = {
  dock: '🅓', station: '🅢', shelfRow: '🆁', shelf: '🅢', zone: '🅩', agv: '🅐', conveyor: '🅒', chute: '🅗',
  aisle: '═', stack: '⬍', lift: '⇅', pallet: '▭', tote: '▣',
  route: '➔',
};

/** 子类型 → 适用的来源/目标设备 kind */
const SUBKIND_BINDING: Record<SimulateSubKind, { source: StageDeviceKind[]; target: StageDeviceKind[]; sourceLabel: string; targetLabel: string; sourceHint: string; targetHint: string }> = {
  inbound:    { source: ['dock', 'station'], target: [], sourceLabel: '在哪些位置申请',  targetLabel: '',                 sourceHint: '仿真时从选中的月台/工位生成入库申请',                 targetHint: '' },
  outbound:   { source: ['dock', 'station'], target: [], sourceLabel: '在哪些位置申请',  targetLabel: '',                 sourceHint: '仿真时从选中的月台/工位生成出库申请',                 targetHint: '' },
  inventory:  { source: [],                  target: ['shelf', 'zone'], sourceLabel: '', targetLabel: '放在哪些库位',  sourceHint: '',                                          targetHint: '只把初始库存生成在选中的库位/区域' },
  allocate:   { source: [],                  target: ['shelf', 'zone'], sourceLabel: '', targetLabel: '分到哪些库位',  sourceHint: '',                                          targetHint: '优先把入库行分配到选中的库位/区域，没选就用全部' },
  putaway:    { source: [],                  target: ['station'],       sourceLabel: '', targetLabel: '经由哪些工位',  sourceHint: '',                                          targetHint: '只让选中的工位执行上架（工位角色需配 putaway）' },
  pick:       { source: ['shelf'],           target: ['station'],       sourceLabel: '从哪些库位拣',  targetLabel: '经由哪些工位',  sourceHint: '只从选中的库位拣选',                                targetHint: '只让选中的工位执行拣选（工位角色需配 pick）' },
  replenish:  { source: ['shelf'],           target: ['station'],       sourceLabel: '扫描哪些库位',  targetLabel: '经由哪些工位',  sourceHint: '只扫描选中的库位',                                  targetHint: '只让选中的工位执行补货（工位角色需配 replenish）' },
  custom:     { source: ['dock', 'station', 'shelf', 'zone', 'aisle', 'stack', 'lift', 'pallet', 'tote'], target: ['dock', 'station', 'shelf', 'zone', 'aisle', 'stack', 'lift', 'pallet', 'tote'], sourceLabel: '从哪些设备读', targetLabel: '写到哪些设备', sourceHint: '执行时从这些设备读数据', targetHint: '执行结果写到这些设备' },
};

function DeviceBinding({ scenarioId, node, subKind, onChange, forceAll }: { scenarioId: string; node: ScenarioNode; subKind: SimulateSubKind; onChange: (p: Partial<ScenarioNode>) => void; forceAll?: boolean }) {
  const scenario = useStore((s) => s.scenarios.find((sc) => sc.id === scenarioId));
  const stage = scenario?.stage;
  const devices = stage?.devices ?? [];
  // API 节点用：source = 全部设备 / target = 全部设备（让用户可绑任何设备来注入字段）
  const baseCfg = SUBKIND_BINDING[subKind];
  const cfg = forceAll
    ? {
        source: baseCfg.source.length ? baseCfg.source : (['dock', 'station', 'shelf', 'zone', 'agv', 'conveyor', 'aisle', 'stack', 'lift', 'pallet', 'tote'] as StageDeviceKind[]),
        target: baseCfg.target.length ? baseCfg.target : (['dock', 'station', 'shelf', 'zone', 'agv', 'conveyor', 'aisle', 'stack', 'lift', 'pallet', 'tote'] as StageDeviceKind[]),
        sourceLabel: baseCfg.sourceLabel || '来源设备',
        targetLabel: baseCfg.targetLabel || '目标设备',
        sourceHint: baseCfg.sourceHint || '调用 API 时把来源设备的 fields 注入为 {{device.xxx}}',
        targetHint: baseCfg.targetHint || '调用 API 时把目标设备的 fields 注入为 {{device.xxx}}',
      }
    : baseCfg;

  if (cfg.source.length === 0 && cfg.target.length === 0) {
    return (
      <div className="border-t border-bg-border pt-2 text-[10px] text-ink-muted font-mono">
        {subKind} 节点不绑定设备
      </div>
    );
  }

  const sourceIds = node.sourceDeviceIds ?? [];
  const targetIds = node.targetDeviceIds ?? [];

  const toggleSource = (id: string) => {
    const next = sourceIds.includes(id) ? sourceIds.filter((x) => x !== id) : [...sourceIds, id];
    onChange({ sourceDeviceIds: next.length ? next : undefined });
  };
  const toggleTarget = (id: string) => {
    const next = targetIds.includes(id) ? targetIds.filter((x) => x !== id) : [...targetIds, id];
    onChange({ targetDeviceIds: next.length ? next : undefined });
  };
  const setAll = (kind: 'source' | 'target') => {
    if (kind === 'source') onChange({ sourceDeviceIds: cfg.source.length ? devices.filter((d) => cfg.source.includes(d.kind)).map((d) => d.id) : undefined });
    else onChange({ targetDeviceIds: cfg.target.length ? devices.filter((d) => cfg.target.includes(d.kind)).map((d) => d.id) : undefined });
  };
  const clear = (kind: 'source' | 'target') => {
    if (kind === 'source') onChange({ sourceDeviceIds: undefined });
    else onChange({ targetDeviceIds: undefined });
  };

  return (
    <div className="border-t border-bg-border pt-2 space-y-2">
      {cfg.source.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="label flex items-center gap-1">
              <MapPin size={9} className="text-accent-amber" /> {cfg.sourceLabel} / SOURCE
            </span>
            <span className="text-[9px] text-ink-muted">{sourceIds.length} 选中</span>
          </div>
          <div className="text-[9px] text-ink-muted mb-1.5 font-mono">{cfg.sourceHint}</div>
          {stage ? (
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {devices.filter((d) => cfg.source.includes(d.kind)).map((d) => {
                const checked = sourceIds.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => toggleSource(d.id)}
                    className={`px-1.5 py-0.5 text-[10px] font-mono border ${checked ? 'border-accent-amber bg-accent-amber/10 text-accent-amber' : 'border-bg-border bg-bg-base text-ink-secondary hover:border-ink-muted'}`}
                  >
                    {KIND_ICON[d.kind]} {d.name}
                  </button>
                );
              })}
              {devices.filter((d) => cfg.source.includes(d.kind)).length === 0 && (
                <span className="text-[10px] text-ink-muted">舞台里没有可用的{KIND_LABEL[cfg.source[0]]}，请到 /stage 配</span>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-ink-muted">本场景暂无舞台</div>
          )}
          {devices.filter((d) => cfg.source.includes(d.kind)).length > 0 && (
            <div className="flex gap-1 mt-1">
              <button onClick={() => setAll('source')} className="text-[9px] text-ink-muted hover:text-accent-amber">全选</button>
              <button onClick={() => clear('source')} className="text-[9px] text-ink-muted hover:text-accent-red">清空</button>
            </div>
          )}
        </div>
      )}

      {cfg.target.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="label flex items-center gap-1">
              <ArrowRight size={9} className="text-accent-green" /> {cfg.targetLabel} / TARGET
            </span>
            <span className="text-[9px] text-ink-muted">{targetIds.length} 选中</span>
          </div>
          <div className="text-[9px] text-ink-muted mb-1.5 font-mono">{cfg.targetHint}</div>
          {stage ? (
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {devices.filter((d) => cfg.target.includes(d.kind)).map((d) => {
                const checked = targetIds.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => toggleTarget(d.id)}
                    className={`px-1.5 py-0.5 text-[10px] font-mono border ${checked ? 'border-accent-green bg-accent-green/10 text-accent-green' : 'border-bg-border bg-bg-base text-ink-secondary hover:border-ink-muted'}`}
                  >
                    {KIND_ICON[d.kind]} {d.name}
                  </button>
                );
              })}
              {devices.filter((d) => cfg.target.includes(d.kind)).length === 0 && (
                <span className="text-[10px] text-ink-muted">舞台里没有可用的{KIND_LABEL[cfg.target[0]]}，请到 /stage 配</span>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-ink-muted">本场景暂无舞台</div>
          )}
          {devices.filter((d) => cfg.target.includes(d.kind)).length > 0 && (
            <div className="flex gap-1 mt-1">
              <button onClick={() => setAll('target')} className="text-[9px] text-ink-muted hover:text-accent-green">全选</button>
              <button onClick={() => clear('target')} className="text-[9px] text-ink-muted hover:text-accent-red">清空</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange, min = 1, max = 999, unit }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; unit?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {unit && <span className="text-[9px] text-ink-muted">{unit}</span>}
      </div>
      <div className="flex items-center border border-bg-border bg-bg-base mt-1">
        <button onClick={() => onChange(Math.max(min, value - 1))} className="w-7 h-7 grid place-items-center text-ink-secondary hover:text-accent-amber">−</button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
          className="flex-1 h-7 bg-transparent text-center font-mono text-[11px] text-ink-primary focus:outline-none"
        />
        <button onClick={() => onChange(Math.min(max, value + 1))} className="w-7 h-7 grid place-items-center text-ink-secondary hover:text-accent-amber">+</button>
      </div>
    </div>
  );
}

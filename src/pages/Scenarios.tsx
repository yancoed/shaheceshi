import { useEffect, useRef, useState } from 'react';
import { useStore, useCurrentScenario, defaultNode } from '@/stores/sandbox';
import type { Scenario, ScenarioNode, DataTemplate, SimulateSubKind } from '@/lib/types';
import { Plus, Copy, Trash2, Save, FileUp, Database, Play, ChevronRight, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import NodeEditor, { SIMULATE_OPTIONS } from '@/features/scenarios/NodeEditor';
import TemplateEditor from '@/features/scenarios/TemplateEditor';

export default function ScenariosPage() {
  const scenarios = useStore((s) => s.scenarios);
  const templates = useStore((s) => s.templates);
  const currentScenario = useCurrentScenario();
  const setCurrentScenario = useStore((s) => s.setCurrentScenario);
  const addScenario = useStore((s) => s.addScenario);
  const updateScenario = useStore((s) => s.updateScenario);
  const deleteScenario = useStore((s) => s.deleteScenario);
  const duplicateScenario = useStore((s) => s.duplicateScenario);
  const addNode = useStore((s) => s.addNode);
  const addTemplate = useStore((s) => s.addTemplate);
  const deleteTemplate = useStore((s) => s.deleteTemplate);

  const [rightTab, setRightTab] = useState<'nodes' | 'template'>('nodes');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(templates[0]?.id ?? '');
  const [simulateMenuOpen, setSimulateMenuOpen] = useState(false);
  const simulateMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!simulateMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (simulateMenuRef.current && !simulateMenuRef.current.contains(e.target as Node)) {
        setSimulateMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSimulateMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [simulateMenuOpen]);

  const currentTemplate = templates.find((t) => t.id === selectedTemplateId);

  const handleCreateScenario = () => {
    const t = Date.now();
    const id = `scn-${t}`;
    const newScen: Scenario = {
      id, name: `新场景 ${scenarios.length + 1}`, description: '', createdAt: t, updatedAt: t,
      nodes: [
        { id: 'n-inbound', name: '入库申请', kind: 'simulate', enabled: true, dependsOn: [], simulate: { subKind: 'inbound', count: 10 } },
      ],
    };
    addScenario(newScen);
  };

  const handleAddNode = (kind: 'simulate' | 'api', subKind?: SimulateSubKind) => {
    if (!currentScenario) return;
    const node = defaultNode(kind, subKind);
    addNode(currentScenario.id, node);
    setSimulateMenuOpen(false);
  };

  const handleAddTemplate = () => {
    const t = Date.now();
    const id = `tpl-${t}`;
    const tpl: DataTemplate = {
      id, name: `新模板 · ${templates.length + 1}`, description: '', source: 'manual', rowCount: 20, seed: t,
      fields: [
        { name: 'id',   type: 'string', required: true, prefix: 'R' },
        { name: 'qty',  type: 'int',    required: true, min: 1, max: 50 },
      ],
      createdAt: t, updatedAt: t,
    };
    addTemplate(tpl);
    setSelectedTemplateId(id);
  };

  return (
    <div className="h-[calc(100vh-3rem)] grid grid-cols-[280px_1fr_460px]">
      {/* 左：场景 + 模板 列表 */}
      <aside className="border-r border-bg-border bg-bg-panel/40 overflow-y-auto flex flex-col">
        <div className="p-3 border-b border-bg-border flex items-center justify-between sticky top-0 bg-bg-panel/95 z-10">
          <div>
            <div className="label">场景 / SCENARIOS</div>
          </div>
          <button onClick={handleCreateScenario} className="btn-ghost text-[10px] py-1 px-1.5">
            <Plus size={10} /> 新建
          </button>
        </div>
        <div className="p-2 space-y-1">
          {scenarios.map((s) => {
            const active = currentScenario?.id === s.id;
            return (
              <div
                key={s.id}
                onClick={() => setCurrentScenario(s.id)}
                className={`group p-2 border cursor-pointer transition-colors ${
                  active ? 'border-accent-amber bg-accent-amber/5' : 'border-bg-border bg-bg-raised/40 hover:border-bg-border/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-ink-primary truncate flex-1" title={s.name}>
                    {s.name}
                  </span>
                  <ChevronRight size={12} className={`shrink-0 ${active ? 'text-accent-amber' : 'text-ink-muted'}`} />
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-ink-muted">
                  <span>{s.nodes.length} 节点</span>
                  <span>·</span>
                  <span>{s.nodes.filter((n) => n.enabled).length} 启用</span>
                  {s.builtin && <span className="chip-blue">内置</span>}
                </div>
                <div className="opacity-0 group-hover:opacity-100 flex gap-1 mt-1.5">
                  <button onClick={(e) => { e.stopPropagation(); duplicateScenario(s.id); }} className="text-ink-muted hover:text-accent-amber text-[10px] flex items-center gap-0.5">
                    <Copy size={10} /> 复制
                  </button>
                  {!s.builtin && (
                    <button onClick={(e) => { e.stopPropagation(); if (confirm('确认删除？')) deleteScenario(s.id); }} className="text-ink-muted hover:text-accent-red text-[10px] flex items-center gap-0.5">
                      <Trash2 size={10} /> 删除
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-3 border-b border-t border-bg-border flex items-center justify-between sticky top-0 bg-bg-panel/95 z-10 mt-2">
          <div>
            <div className="label">数据模板 / TEMPLATES</div>
          </div>
          <button onClick={handleAddTemplate} className="btn-ghost text-[10px] py-1 px-1.5">
            <Plus size={10} /> 新建
          </button>
        </div>
        <div className="p-2 space-y-1">
          {templates.map((t) => {
            const active = selectedTemplateId === t.id;
            return (
              <div
                key={t.id}
                onClick={() => setSelectedTemplateId(t.id)}
                className={`group p-2 border cursor-pointer transition-colors ${
                  active ? 'border-accent-amber bg-accent-amber/5' : 'border-bg-border bg-bg-raised/40 hover:border-bg-border/60'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Database size={10} className={active ? 'text-accent-amber' : 'text-ink-muted'} />
                  <span className="font-mono text-[11px] text-ink-primary truncate flex-1" title={t.name}>{t.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-ink-muted">
                  <span>{t.fields.length} 字段</span>
                  <span>·</span>
                  <span>{t.rowCount} 行</span>
                  <span className="chip ml-auto text-[9px]">{t.source}</span>
                </div>
                <div className="opacity-0 group-hover:opacity-100 flex gap-1 mt-1.5">
                  <button onClick={(e) => { e.stopPropagation(); if (confirm('确认删除此模板？关联的节点将回退到内置 mock。')) deleteTemplate(t.id); }} className="text-ink-muted hover:text-accent-red text-[10px] flex items-center gap-0.5">
                    <Trash2 size={10} /> 删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* 中：场景节点编辑 */}
      <section className="border-r border-bg-border bg-bg-base/30 overflow-y-auto flex flex-col min-w-0">
        {currentScenario ? (
          <>
            <div className="p-4 border-b border-bg-border sticky top-0 bg-bg-base/95 z-10">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <input
                    value={currentScenario.name}
                    onChange={(e) => updateScenario(currentScenario.id, { name: e.target.value })}
                    className="w-full bg-transparent text-base font-mono text-ink-primary focus:outline-none"
                  />
                  <input
                    value={currentScenario.description}
                    onChange={(e) => updateScenario(currentScenario.id, { description: e.target.value })}
                    placeholder="场景描述..."
                    className="w-full bg-transparent text-[11px] text-ink-secondary focus:outline-none mt-1"
                  />
                </div>
                <Link to="/sandbox" className="btn-primary text-[10px] py-1.5">
                  <Play size={12} fill="currentColor" /> 去运行
                </Link>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="label">节点 / NODES · {currentScenario.nodes.length}</div>
                <div className="flex gap-1">
                  <div ref={simulateMenuRef} className="relative">
                    <button
                      onClick={() => setSimulateMenuOpen((v) => !v)}
                      className="btn-ghost text-[10px] py-1 px-1.5 flex items-center gap-0.5"
                    >
                      <Plus size={10} /> 模拟 <ChevronDown size={9} className={`transition-transform ${simulateMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {simulateMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 w-72 bg-bg-panel border border-bg-border shadow-lg z-20">
                        <div className="px-2 py-1.5 border-b border-bg-border text-[9px] font-mono uppercase tracking-widest text-ink-muted">
                          选择模拟策略 · 8 BUILT-IN
                        </div>
                        <div className="grid grid-cols-2 gap-px bg-bg-border">
                          {SIMULATE_OPTIONS.map((o) => (
                            <button
                              key={o.id}
                              onClick={() => handleAddNode('simulate', o.id)}
                              className="text-left px-2 py-1.5 bg-bg-panel hover:bg-accent-amber/5 hover:text-accent-amber"
                            >
                              <div className="font-mono text-[11px] text-ink-primary">{o.name}</div>
                              <div className="text-[9px] text-ink-muted leading-tight mt-0.5">{o.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleAddNode('api')} className="btn-ghost text-[10px] py-1 px-1.5">
                    <Plus size={10} /> API
                  </button>
                </div>
              </div>
              {currentScenario.nodes.length === 0 && (
                <div className="text-center text-ink-muted text-xs font-mono py-8 border border-dashed border-bg-border">
                  暂无节点 · 点击右上「+ 模拟」或「+ API」添加
                </div>
              )}
              {currentScenario.nodes.map((node, idx) => (
                <NodeEditor
                  key={node.id}
                  node={node}
                  scenarioId={currentScenario.id}
                  isFirst={idx === 0}
                  isLast={idx === currentScenario.nodes.length - 1}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-ink-muted text-xs font-mono">
            请从左侧选择一个场景
          </div>
        )}
      </section>

      {/* 右：模板编辑器 + 变量参考 */}
      <aside className="bg-bg-panel/40 overflow-y-auto flex flex-col min-w-0">
        {currentTemplate ? (
          <>
            <div className="p-4 border-b border-bg-border sticky top-0 bg-bg-panel/95 z-10">
              <div className="font-mono text-sm tracking-wider text-ink-primary flex items-center gap-2">
                <Database size={14} className="text-accent-amber" /> 模板编辑
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-ink-muted mt-0.5">
                {currentTemplate.name}
              </div>
            </div>
            <div className="p-4">
              <TemplateEditor template={currentTemplate} />
            </div>
            <div className="p-4 border-t border-bg-border bg-bg-base/30">
              <div className="label mb-2">变量引用提示 / VARIABLES</div>
              <p className="text-[10px] text-ink-secondary font-mono leading-relaxed">
                在 API 节点的 URL / Body 中使用 <code className="text-accent-amber">{`{{nodeId.field}}`}</code> 引用前置节点的输出。例如：
              </p>
              <pre className="mt-2 text-[10px] text-ink-primary bg-bg-base/60 p-2 font-mono whitespace-pre-wrap break-all border border-bg-border">
{`POST /api/inbound
{
  "orderId": "{{n-inbound.sample.id}}",
  "qty": {{n-inbound.sample.lines}}
}`}
              </pre>
              <p className="text-[10px] text-ink-muted font-mono mt-2">
                可用节点 ID 取决于当前场景的节点。
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-ink-muted text-xs font-mono">
            请从左侧选择一个模板
          </div>
        )}
      </aside>
    </div>
  );
}

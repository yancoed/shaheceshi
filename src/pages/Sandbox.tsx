import { useMemo, useState } from 'react';
import { useStore, useCurrentScenario, defaultNode } from '@/stores/sandbox';
import { runScenario } from '@/lib/simulator';
import { Play, RotateCcw, Save, GitMerge, ChevronDown, ChevronUp, Plus, Settings, Database, FileUp, LayoutDashboard } from 'lucide-react';
import ScopePicker from '@/features/sandbox/ScopePicker';
import ScaleForm from '@/features/sandbox/ScaleForm';
import TraceTimeline from '@/features/sandbox/TraceTimeline';
import LocationGrid from '@/features/sandbox/LocationGrid';
import PickPath from '@/features/sandbox/PickPath';
import MetricsBar from '@/features/sandbox/MetricsBar';
import AssignmentTable from '@/features/sandbox/AssignmentTable';
import OutboundPathTable from '@/features/sandbox/OutboundPathTable';
import { WcsStageView } from '@/features/dashboard/Widgets';
import type { TraceEvent, ScenarioNode } from '@/lib/types';
import { Link, useNavigate } from 'react-router-dom';

const TABS = [
  { id: 'grid',     label: '库位图',   sub: 'GRID' },
  { id: 'pick',     label: '拣选路径', sub: 'PICK' },
  { id: 'list',     label: '入库分配', sub: 'IN' },
  { id: 'outbound', label: '出库路径', sub: 'OUT' },
  { id: 'api',      label: 'API 日志', sub: 'API' },
  { id: 'stage',    label: '舞台',     sub: 'STAGE' },
] as const;
type TabId = typeof TABS[number]['id'];

export default function SandboxPage() {
  const scenario = useCurrentScenario();
  const isRunning = useStore((s) => s.isRunning);
  const setRunning = useStore((s) => s.setRunning);
  const setProgress = useStore((s) => s.setProgress);
  const setResult = useStore((s) => s.setResult);
  const result = useStore((s) => s.result);
  const reset = useStore((s) => s.reset);
  const syncToProd = useStore((s) => s.syncToProd);
  const templates = useStore((s) => s.templates);
  const config = useStore((s) => s.config);
  const setSeed = useStore((s) => s.setSeed);
  const addNode = useStore((s) => s.addNode);
  const navigate = useNavigate();

  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [tab, setTab] = useState<TabId>('stage');
  const [configOpen, setConfigOpen] = useState(true);

  const enabledCount = scenario?.nodes.filter((n) => n.enabled).length ?? 0;
  const canRun = !!scenario && enabledCount > 0 && !isRunning;
  const currentTemplate = useMemo(
    () => (scenario?.templateId ? templates.find((t) => t.id === scenario.templateId) : undefined),
    [scenario, templates],
  );

  const handleRun = async () => {
    if (!scenario) return;
    setResult(null);
    setEvents([]);
    setProgress(0);
    setRunning(true);
    try {
      const templatesById = Object.fromEntries(templates.map((t) => [t.id, t]));
      const r = await runScenario(
        scenario,
        currentTemplate,
        config.seed ?? Date.now(),
        (e) => setEvents((prev) => [...prev, e]),
        (p) => setProgress(p),
        templatesById,
        scenario.stage,
      );
      setResult(r);
    } finally {
      setRunning(false);
      setProgress(1);
    }
  };

  const quickAdd = (kind: 'simulate' | 'api') => {
    if (!scenario) return;
    const node = defaultNode(kind);
    addNode(scenario.id, node);
  };

  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col">
      <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr_600px]">
      {/* 左：场景 + 配置 */}
      <section className="row-span-1 border-r border-bg-border bg-bg-panel/40 overflow-y-auto flex flex-col min-h-0">
        <div className="p-4 border-b border-bg-border sticky top-0 bg-bg-panel/95 z-10">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="label">当前场景 / SCENARIO</div>
              {scenario ? (
                <div className="font-mono text-sm text-ink-primary mt-0.5 truncate" title={scenario.name}>
                  {scenario.name}
                </div>
              ) : (
                <div className="font-mono text-sm text-accent-red mt-0.5">未选择场景</div>
              )}
            </div>
            <Link to="/scenarios" className="btn-ghost text-[10px] py-1.5">
              <Settings size={12} /> 编排
            </Link>
          </div>
          {scenario && (
            <div className="flex items-center gap-2 mt-2 text-[10px] font-mono text-ink-muted">
              <span className="chip-green"><span className="w-1.5 h-1.5 rounded-full bg-accent-green" />{enabledCount}/{scenario.nodes.length} 启用</span>
              {currentTemplate && (
                <span className="chip-blue"><Database size={10} />{currentTemplate.name}</span>
              )}
            </div>
          )}
        </div>

        {configOpen && scenario && (
          <div className="p-4 space-y-5">
            {/* 节点开关（按场景定义动态显示） */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="label">节点 / NODES</div>
                <div className="flex gap-1">
                  <button onClick={() => quickAdd('simulate')} className="btn-ghost text-[10px] py-1 px-1.5"><Plus size={10} />模拟</button>
                  <button onClick={() => quickAdd('api')} className="btn-ghost text-[10px] py-1 px-1.5"><Plus size={10} />API</button>
                </div>
              </div>
              <ScopePicker />
            </div>
            <div className="divider" />
            <ScaleForm />
          </div>
        )}

        {!scenario && (
          <div className="p-6 text-center text-xs font-mono text-ink-muted">
            暂无场景，请到
            <Link to="/scenarios" className="text-accent-amber hover:underline mx-1">场景编排</Link>
            创建一个
          </div>
        )}
      </section>

      {/* 中：轨迹 + 指标 */}
      <section className="row-span-1 border-r border-bg-border bg-bg-base/30 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="p-4 border-b border-bg-border flex items-center justify-between">
          <div>
            <div className="font-mono text-sm tracking-wider text-ink-primary">EXECUTION TRACE</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">执行轨迹</div>
          </div>
          {result && (
            <div className="flex items-center gap-2 text-[10px] font-mono text-ink-secondary">
              <span>SIM-ID <span className="text-accent-amber">{result.id}</span></span>
              <span className="text-ink-muted">·</span>
              <span>{result.duration}ms</span>
            </div>
          )}
        </div>
        <div className="flex-1 p-4 overflow-hidden grid grid-rows-[auto_1fr] gap-3 min-h-0">
          <MetricsBar />
          <div className="min-h-0 overflow-hidden">
            <TraceTimeline events={events} />
          </div>
        </div>
      </section>

      {/* 右：看板 */}
      <section className="row-span-1 bg-bg-panel/40 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="p-4 border-b border-bg-border">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-mono text-sm tracking-wider text-ink-primary">RESULT BOARD</div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">结果看板</div>
            </div>
          </div>
          <div className="flex border border-bg-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 py-2 text-xs font-mono tracking-wider border-r last:border-r-0 border-bg-border ${
                  tab === t.id ? 'bg-accent-amber/10 text-accent-amber' : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {t.label}
                <span className="ml-1 text-[9px] text-ink-muted">{t.sub}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={`flex-1 min-h-0 flex flex-col ${tab === 'stage' ? 'p-0 overflow-hidden' : 'p-4 overflow-y-auto'}`}>
          {tab === 'grid'     && <LocationGrid />}
          {tab === 'pick'     && <PickPath />}
          {tab === 'list'     && <AssignmentTable />}
          {tab === 'outbound' && <OutboundPathTable />}
          {tab === 'api'      && <ApiLogPanel events={events} />}
          {tab === 'stage' && (
            scenario?.stage ? (
              <WcsStageView
                stage={scenario.stage}
                result={result}
                scenarioName={scenario.name}
                onOpenStage={() => navigate('/stage')}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-ink-muted text-[11px] font-mono">
                当前场景未配置舞台 — 去「编排」绑定一个舞台
              </div>
            )
          )}
        </div>
      </section>
      </div>

      {/* 底部：操作栏（flex-shrink-0 防止被挤压到屏幕外） */}
      <section className="flex-shrink-0 h-14 border-t border-bg-border bg-bg-panel/95 flex items-center px-4 gap-3 z-20">
        <button
          onClick={handleRun}
          disabled={!canRun}
          className={`btn-primary ${!canRun ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Play size={12} fill="currentColor" />
          {isRunning ? '模拟执行中...' : '开始模拟'}
        </button>
        <button onClick={reset} className="btn-ghost" disabled={isRunning}>
          <RotateCcw size={12} /> 重置
        </button>
        <div className="h-6 w-px bg-bg-border mx-2" />
        <button
          onClick={syncToProd}
          disabled={!result || isRunning}
          className={`btn-ghost ${!result ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          <GitMerge size={12} /> 一键同步到生产
        </button>
        <button className="btn-ghost" disabled={!result}>
          <Save size={12} /> 保存为场景模板
        </button>
        <div className="ml-auto flex items-center gap-2 text-[10px] font-mono text-ink-muted">
          <FileUp size={10} />
          <span>SEED</span>
          <input
            type="number"
            value={config.seed ?? 0}
            onChange={(e) => setSeed(Number(e.target.value))}
            className="w-16 h-6 bg-bg-base border border-bg-border px-1 text-center text-ink-primary focus:outline-none focus:border-accent-amber/60"
          />
        </div>
      </section>
    </div>
  );
}

function ApiLogPanel({ events }: { events: TraceEvent[] }) {
  const apiEvents = events.filter((e) => {
    const p = e.payload as { request?: { method?: string } } | undefined;
    return p?.request?.method;
  });
  if (apiEvents.length === 0) {
    return <div className="text-center text-ink-muted text-xs font-mono py-8">无 API 调用记录</div>;
  }
  return (
    <div className="space-y-2">
      {apiEvents.map((e) => {
        const p = e.payload as { request?: { method?: string; url?: string; headers?: Record<string,string>; body?: string }; response?: unknown; status?: number; durationMs?: number };
        return (
          <div key={e.id} className="border border-bg-border bg-bg-raised/40 p-3 text-[11px] font-mono">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 text-[9px] font-bold ${
                  p.request?.method === 'GET' ? 'bg-accent-blue/20 text-accent-blue' : 'bg-accent-amber/20 text-accent-amber'
                }`}>{p.request?.method}</span>
                <span className="text-ink-primary truncate max-w-[200px]" title={p.request?.url}>{p.request?.url}</span>
              </div>
              <span className={`text-[10px] ${p.status && p.status < 400 ? 'text-accent-green' : 'text-accent-red'}`}>
                {p.status} · {p.durationMs}ms
              </span>
            </div>
            {p.request?.body && (
              <pre className="mt-2 text-[10px] text-ink-secondary bg-bg-base/50 p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
{p.request.body}
              </pre>
            )}
            <div className="mt-2 text-[10px] text-ink-muted">RESPONSE</div>
            <pre className="mt-1 text-[10px] text-accent-green bg-bg-base/50 p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
{typeof p.response === 'string' ? p.response : JSON.stringify(p.response, null, 2)}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useStore, WAREHOUSE, useCurrentScenario } from '@/stores/sandbox';
import { Activity, Box, Clock } from 'lucide-react';
import { formatTime } from '@/lib/utils';

export default function StatusBar() {
  const prodConfig = useStore((s) => s.prodConfig);
  const scenario = useCurrentScenario();
  const isRunning = useStore((s) => s.isRunning);
  const progress = useStore((s) => s.progress);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const enabled = scenario?.nodes.filter((n) => n.enabled).length ?? 0;
  const total = scenario?.nodes.length ?? 0;
  const apiCount = scenario?.nodes.filter((n) => n.kind === 'api' && n.enabled).length ?? 0;
  const simCount = scenario?.nodes.filter((n) => n.kind === 'simulate' && n.enabled).length ?? 0;

  return (
    <header className="h-12 border-b border-bg-border bg-bg-panel/80 backdrop-blur flex items-center px-4 gap-4 relative scanline">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 grid place-items-center bg-accent-amber text-bg-base font-mono font-bold text-sm">
          LS
        </div>
        <div className="leading-tight">
          <div className="font-mono text-sm tracking-wider text-ink-primary">WMS · LEAN SANDBOX</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">精益沙盒 · 可配置版</div>
        </div>
      </div>
      <div className="h-6 w-px bg-bg-border" />

      <div className="flex items-center gap-2">
        <span className="label">环境</span>
        <span className="chip-amber">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-amber dot-live" /> SANDBOX
        </span>
        <span className="text-ink-muted text-[10px] font-mono">→</span>
        <span className="chip-green">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green" /> PROD · {prodConfig.version}
        </span>
      </div>

      <div className="h-6 w-px bg-bg-border" />

      <div className="flex items-center gap-3 text-[11px] font-mono text-ink-secondary min-w-0">
        <span className="flex items-center gap-1 shrink-0"><Box size={12} className="text-accent-amber" />{WAREHOUSE.id}</span>
        {scenario && (
          <>
            <span className="text-ink-muted shrink-0">·</span>
            <span className="truncate" title={scenario.name}>
              {scenario.name}
            </span>
            <span className="text-ink-muted shrink-0">·</span>
            <span className="shrink-0 text-accent-amber">{enabled}/{total} 节点</span>
            <span className="text-ink-muted shrink-0">·</span>
            <span className="shrink-0">模拟 {simCount} · API {apiCount}</span>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-4">
        {isRunning ? (
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-accent-amber dot-live" />
            <span className="text-[11px] font-mono text-accent-amber tracking-wider">RUNNING</span>
            <div className="w-32 h-1.5 bg-bg-raised overflow-hidden">
              <div
                className="h-full bg-accent-amber transition-all duration-200"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <span className="text-[10px] num text-ink-secondary">{Math.round(progress * 100)}%</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[11px] font-mono text-ink-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green dot-live" />
            IDLE
          </div>
        )}
        <div className="flex items-center gap-1 text-[11px] font-mono text-ink-secondary">
          <Clock size={12} />
          {formatTime(now)}
        </div>
      </div>
    </header>
  );
}

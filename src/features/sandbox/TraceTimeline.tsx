import { useStore, useCurrentScenario } from '@/stores/sandbox';
import type { TraceEvent, TraceStatus, ScenarioNode } from '@/lib/types';
import { Check, Circle, AlertOctagon, Loader } from 'lucide-react';
import { formatTime } from '@/lib/utils';

const STATUS_DOT: Record<TraceStatus, string> = {
  pending: 'bg-ink-muted',
  running: 'bg-accent-amber dot-live',
  done: 'bg-accent-green',
  error: 'bg-accent-red',
  skipped: 'bg-ink-muted',
};
const STATUS_TEXT: Record<TraceStatus, string> = {
  pending: 'text-ink-muted',
  running: 'text-accent-amber',
  done: 'text-accent-green',
  error: 'text-accent-red',
  skipped: 'text-ink-muted',
};

export default function TraceTimeline({ events }: { events: TraceEvent[] }) {
  const scenario = useCurrentScenario();
  const isRunning = useStore((s) => s.isRunning);

  // 把每个节点最近一条状态聚合成卡片
  const items: { node: ScenarioNode; evs: TraceEvent[]; status: TraceStatus }[] = (scenario?.nodes ?? []).map((node) => {
    const evs = events.filter((e) => e.nodeId === node.id);
    let status: TraceStatus = node.enabled ? 'pending' : 'skipped';
    if (evs.some((e) => e.status === 'error')) status = 'error';
    else if (evs.length > 0 && evs.every((e) => e.status === 'done')) status = 'done';
    else if (evs.some((e) => e.status === 'running')) status = 'running';
    return { node, evs, status };
  });

  return (
    <div className="space-y-2 overflow-y-auto h-full pr-1">
      {items.length === 0 && (
        <div className="text-center text-ink-muted text-xs font-mono py-12">
          <div className="mb-2 text-2xl">· · ·</div>
          当前场景没有节点
        </div>
      )}
      {items.map(({ node, evs, status }) => (
        <div key={node.id} className="border border-bg-border bg-bg-raised/40">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-bg-border">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
            <span className={`font-mono text-[11px] tracking-wider ${STATUS_TEXT[status]}`}>
              {node.id}
            </span>
            <span className="text-[10px] text-ink-muted font-mono tracking-widest ml-1">
              {node.name}
            </span>
            <span className="ml-auto text-[10px] font-mono text-ink-muted">
              {status === 'pending' && 'WAITING'}
              {status === 'running' && 'RUNNING'}
              {status === 'done' && 'DONE'}
              {status === 'error' && 'ERROR'}
              {status === 'skipped' && 'SKIPPED'}
            </span>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            {evs.length === 0 && (
              <div className="text-[10px] text-ink-muted font-mono">
                {node.enabled ? '等待执行...' : '节点已禁用'}
              </div>
            )}
            {evs.map((e) => (
              <div key={e.id} className="flex items-start gap-2 text-[11px]">
                <span className="text-ink-muted font-mono shrink-0 mt-px">{formatTime(e.ts)}</span>
                {e.durationMs !== undefined && (
                  <span className="text-ink-muted font-mono shrink-0 mt-px">+{e.durationMs}ms</span>
                )}
                <span className={`mt-0.5 shrink-0 ${STATUS_TEXT[e.status]}`}>
                  {e.status === 'done' && <Check size={10} />}
                  {e.status === 'running' && <Loader size={10} className="animate-spin" />}
                  {e.status === 'error' && <AlertOctagon size={10} />}
                  {e.status === 'pending' && <Circle size={10} />}
                  {e.status === 'skipped' && <Circle size={10} />}
                </span>
                <span className={e.status === 'error' ? 'text-accent-red' : 'text-ink-primary'}>
                  {e.summary}
                </span>
              </div>
            ))}
            {isRunning && status === 'running' && (
              <div className="text-[10px] font-mono text-accent-amber/60 flex items-center gap-1 mt-1">
                <span className="cursor-blink">执行中</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

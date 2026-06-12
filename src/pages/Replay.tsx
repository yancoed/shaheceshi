import { useState } from 'react';
import { useStore, useCurrentScenario, defaultNode } from '@/stores/sandbox';
import { runScenario } from '@/lib/simulator';
import { Play, Database, Calendar, Package, TrendingUp, TrendingDown } from 'lucide-react';
import type { HistoricalSnapshot } from '@/lib/types';

export default function ReplayPage() {
  const snapshots = useStore((s) => s.snapshots);
  const scenario = useCurrentScenario();
  const config = useStore((s) => s.config);
  const [selected, setSelected] = useState<HistoricalSnapshot | null>(snapshots[0] ?? null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ distance: number; time: number; util: number; anomalies: number; apiOk: number; apiTotal: number } | null>(null);

  const handleReplay = async () => {
    if (!selected || !scenario) return;
    setRunning(true);
    setResult(null);
    const r = await runScenario(
      { ...scenario, nodes: scenario.nodes.map((n) => ({ ...n, enabled: true })) },
      undefined,
      (config.seed ?? Date.now()) + selected.id.length * 17,
      () => {},
      () => {},
    );
    setResult({
      distance: r.metrics.pickDistance,
      time: r.metrics.pickTime,
      util: r.metrics.utilization,
      anomalies: r.metrics.anomalies,
      apiOk: r.metrics.apiSuccessCount,
      apiTotal: r.metrics.apiCallsCount,
    });
    setRunning(false);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-mono text-xl tracking-wider text-ink-primary">HISTORICAL REPLAY</h1>
          <p className="text-[11px] font-mono uppercase tracking-widest text-ink-muted mt-1">用当前场景配置回放历史数据</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-ink-muted">
          <Database size={12} className="text-accent-amber" />
          <span>已载入 {snapshots.length} 个历史快照</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
        <div className="space-y-2">
          <div className="label">快照列表 / SNAPSHOTS</div>
          {snapshots.map((s) => {
            const isSel = selected?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className={`w-full text-left p-3 border transition-colors ${
                  isSel ? 'border-accent-amber bg-accent-amber/5 shadow-glow' : 'border-bg-border bg-bg-panel/60 hover:border-bg-border/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs tracking-wider text-ink-primary">{s.id}</span>
                  <span className="text-[10px] font-mono text-ink-muted flex items-center gap-1">
                    <Calendar size={10} /> {s.date}
                  </span>
                </div>
                <div className="text-sm text-ink-primary mt-1">{s.name}</div>
                <div className="text-[11px] text-ink-muted mt-0.5">{s.description}</div>
                <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-ink-secondary">
                  <span className="flex items-center gap-1"><Package size={10} /> {s.orders} 单</span>
                  <span>·</span>
                  <span>基础利用率 {s.baseMetrics.utilization}%</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {!scenario ? (
            <div className="text-center text-ink-muted text-xs font-mono py-8 border border-dashed border-bg-border">
              请先到「场景编排」选择一个场景
            </div>
          ) : selected ? (
            <>
              <div className="panel p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="label">当前快照 / SELECTED</div>
                    <div className="font-mono text-lg text-ink-primary mt-1">{selected.name}</div>
                    <div className="text-xs text-ink-muted mt-0.5">{selected.id} · {selected.date}</div>
                  </div>
                  <button onClick={handleReplay} disabled={running} className={`btn-primary ${running ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <Play size={12} fill="currentColor" /> {running ? '回放中...' : '用当前场景回放'}
                  </button>
                </div>
                <div className="mt-3 pt-3 border-t border-bg-border text-[10px] font-mono text-ink-muted">
                  将使用场景：<span className="text-accent-amber">{scenario.name}</span> · {scenario.nodes.filter((n) => n.enabled).length} 个启用节点
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="panel p-4">
                  <div className="label mb-3">基础指标 / BASELINE</div>
                  <div className="space-y-2 text-xs font-mono">
                    <Row label="库位利用率" v={`${selected.baseMetrics.utilization}%`} />
                    <Row label="拣选距离" v={`${selected.baseMetrics.pickDistance} m`} />
                    <Row label="拣选耗时" v={`${selected.baseMetrics.pickTime} min`} />
                    <Row label="异常" v={`${selected.baseMetrics.anomalies}`} />
                    <Row label="订单数" v={`${selected.baseMetrics.ordersCount}`} />
                  </div>
                </div>
                <div className="panel p-4 relative scanline">
                  <div className="label mb-3">回放结果 / REPLAY</div>
                  {!result ? (
                    <div className="text-xs font-mono text-ink-muted text-center py-8">
                      点击「用当前场景回放」开始
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs font-mono">
                      <Row label="库位利用率" v={`${result.util}%`} delta={result.util - selected.baseMetrics.utilization} inverse />
                      <Row label="拣选距离" v={`${result.distance} m`} delta={selected.baseMetrics.pickDistance ? ((result.distance - selected.baseMetrics.pickDistance) / selected.baseMetrics.pickDistance) * 100 : 0} />
                      <Row label="拣选耗时" v={`${result.time.toFixed(1)} min`} delta={selected.baseMetrics.pickTime ? ((result.time - selected.baseMetrics.pickTime) / selected.baseMetrics.pickTime) * 100 : 0} />
                      <Row label="异常" v={`${result.anomalies}`} delta={result.anomalies - selected.baseMetrics.anomalies} inverse />
                      <Row label="API 调用" v={`${result.apiOk}/${result.apiTotal}`} />
                    </div>
                  )}
                </div>
              </div>

              <div className="panel p-4">
                <div className="label mb-2">对比解读 / INSIGHT</div>
                <p className="text-[12px] text-ink-secondary leading-relaxed">
                  用当前沙盒配置中的「{config.strategy.putaway} / {config.strategy.pick} / 阈值 {config.strategy.replenishThreshold}」回放该历史快照，
                  通过比较 <span className="text-accent-amber">回放结果</span> 与 <span className="text-accent-green">历史基线</span>，验证新策略是否真的带来优化。
                  如果 <span className="text-accent-green">↑ 提升</span> 显著且 <span className="text-accent-red">↓ 下降</span> 合理，可到「生产同步」一键发布。
                </p>
              </div>
            </>
          ) : (
            <div className="text-ink-muted text-xs font-mono text-center py-12">请先选择左侧快照</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, v, delta, inverse }: { label: string; v: string; delta?: number; inverse?: boolean }) {
  let good = false;
  if (delta !== undefined && delta !== 0) {
    good = inverse ? delta < 0 : delta > 0;
  }
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-ink-primary num">{v}</span>
        {delta !== undefined && delta !== 0 && (
          <span className={`flex items-center text-[10px] ${good ? 'text-accent-green' : 'text-accent-red'}`}>
            {delta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useStore } from '@/stores/sandbox';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { classNames } from '@/lib/utils';

interface MetricProps {
  label: string;
  value: number;
  unit: string;
  prev?: number;
  format?: (n: number) => string;
  tone?: 'amber' | 'green' | 'red' | 'blue';
}
function Metric({ label, value, unit, prev, format, tone = 'amber' }: MetricProps) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = display;
    const dur = 600;
    const t0 = performance.now();
    let raf: number;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + (value - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const delta = prev !== undefined && prev !== 0 ? ((value - prev) / prev) * 100 : 0;
  const toneClass = {
    amber: 'text-accent-amber',
    green: 'text-accent-green',
    red: 'text-accent-red',
    blue: 'text-accent-blue',
  }[tone];

  return (
    <div className="panel p-3 relative scanline">
      <div className="label">{label}</div>
      <div className="flex items-end gap-1 mt-1.5">
        <span className={`num text-2xl font-bold leading-none ${toneClass} count-up`}>
          {format ? format(display) : Math.round(display)}
        </span>
        <span className="text-[10px] font-mono text-ink-muted mb-0.5">{unit}</span>
      </div>
      {prev !== undefined && (
        <div className={classNames(
          'flex items-center gap-0.5 text-[10px] font-mono mt-1',
          delta > 0 ? 'text-accent-green' : delta < 0 ? 'text-accent-red' : 'text-ink-muted',
        )}>
          {delta > 0 ? <TrendingUp size={10} /> : delta < 0 ? <TrendingDown size={10} /> : null}
          <span>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
          <span className="text-ink-muted ml-1">vs 上一轮</span>
        </div>
      )}
    </div>
  );
}

export default function MetricsBar() {
  const result = useStore((s) => s.result);
  if (!result) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {['库位利用率', '拣选总距离', '拣选总耗时', '异常'].map((l) => (
          <div key={l} className="panel p-3">
            <div className="label">{l}</div>
            <div className="num text-2xl text-ink-muted mt-1.5">--</div>
          </div>
        ))}
      </div>
    );
  }
  const m = result.metrics;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <Metric label="库位利用率" value={m.utilization} unit="%" tone="amber" />
      <Metric label="拣选总距离" value={m.pickDistance} unit="m" tone="blue" />
      <Metric label="拣选总耗时" value={m.pickTime} unit="min" tone="green" format={(n) => n.toFixed(1)} />
      <Metric label="异常" value={m.anomalies} unit="个" tone="red" />
    </div>
  );
}

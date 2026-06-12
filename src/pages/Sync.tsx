import { useStore } from '@/stores/sandbox';
import { GitMerge, Check, X, ArrowRight, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

const PUTAWAY_NAMES: Record<string, string> = {
  nearest: '就近上架',
  category: '同类集中',
  capacity: '容量优先',
  fifo: '编号顺序',
};
const PICK_NAMES: Record<string, string> = {
  s_shape: 'S 形遍历',
  return: '返回式',
  midpoint: '中点分割',
  largest_gap: '最大间隙',
};

export default function SyncPage() {
  const prod = useStore((s) => s.prodConfig);
  const config = useStore((s) => s.config);
  const syncDiff = useStore((s) => s.syncDiff);
  const syncToProd = useStore((s) => s.syncToProd);
  const result = useStore((s) => s.result);

  const rows = [
    {
      key: 'putaway' as const,
      label: '上架策略',
      from: PUTAWAY_NAMES[prod.putaway] || prod.putaway,
      to: PUTAWAY_NAMES[config.strategy.putaway] || config.strategy.putaway,
      diff: prod.putaway !== config.strategy.putaway,
    },
    {
      key: 'pick' as const,
      label: '拣选策略',
      from: PICK_NAMES[prod.pick] || prod.pick,
      to: PICK_NAMES[config.strategy.pick] || config.strategy.pick,
      diff: prod.pick !== config.strategy.pick,
    },
    {
      key: 'replenishThreshold' as const,
      label: '补货阈值',
      from: `${prod.replenishThreshold} 单位`,
      to: `${config.strategy.replenishThreshold} 单位`,
      diff: prod.replenishThreshold !== config.strategy.replenishThreshold,
    },
  ];

  const anyDiff = rows.some((r) => r.diff);

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-mono text-xl tracking-wider text-ink-primary">PRODUCTION SYNC</h1>
          <p className="text-[11px] font-mono uppercase tracking-widest text-ink-muted mt-1">把沙盒配置推送到生产，逐项对比差异</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-ink-muted">
          <Shield size={12} className="text-accent-green" />
          <span>差异确认后才写入 · 安全优先</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 沙盒配置 */}
        <div className="panel relative scanline">
          <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
            <div>
              <div className="label">沙盒配置 / SANDBOX</div>
              <div className="font-mono text-sm text-ink-primary mt-0.5">待推送</div>
            </div>
            <span className="chip-amber"><span className="w-1.5 h-1.5 rounded-full bg-accent-amber dot-live" />SANDBOX</span>
          </div>
          <div className="p-4 space-y-3">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between text-xs font-mono">
                <span className="text-ink-secondary">{r.label}</span>
                <span className="text-accent-amber">{r.to}</span>
              </div>
            ))}
            <div className="divider" />
            <div className="text-[10px] font-mono text-ink-muted">
              {result
                ? <>基于最新模拟 <span className="text-accent-amber">{result.id}</span></>
                : <>未关联模拟结果</>}
            </div>
          </div>
        </div>

        {/* 生产配置 */}
        <div className="panel">
          <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
            <div>
              <div className="label">生产配置 / PROD</div>
              <div className="font-mono text-sm text-ink-primary mt-0.5">{prod.version}</div>
            </div>
            <span className="chip-green"><span className="w-1.5 h-1.5 rounded-full bg-accent-green" />PROD</span>
          </div>
          <div className="p-4 space-y-3">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between text-xs font-mono">
                <span className="text-ink-secondary">{r.label}</span>
                <span className="text-accent-green">{r.from}</span>
              </div>
            ))}
            <div className="divider" />
            <div className="text-[10px] font-mono text-ink-muted">
              最后同步 · {prod.version} · 自动备份
            </div>
          </div>
        </div>
      </div>

      {/* 差异表 */}
      <div className="panel">
        <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
          <div>
            <div className="label">差异对比 / DIFF</div>
            <div className="font-mono text-sm text-ink-primary mt-0.5">
              {anyDiff ? `${rows.filter((r) => r.diff).length} 项差异` : '无差异 · 已与生产一致'}
            </div>
          </div>
        </div>
        <div className="divide-y divide-bg-border">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[120px_1fr_1fr_60px] items-center px-4 py-3 text-xs font-mono">
              <div className="text-ink-secondary">{r.label}</div>
              <div className={`flex items-center gap-2 ${r.diff ? 'text-ink-muted' : 'text-ink-primary'}`}>
                {r.from}
                {r.diff && <ArrowRight size={12} className="text-accent-amber" />}
              </div>
              <div className={r.diff ? 'text-accent-amber' : 'text-ink-muted'}>
                {r.diff ? r.to : '— 无变化 —'}
              </div>
              <div className="flex justify-end">
                {r.diff ? (
                  <span className="chip-amber text-[9px]">DIFF</span>
                ) : (
                  <span className="text-accent-green"><Check size={14} /></span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 操作区 */}
      <div className="panel p-4 flex items-center gap-3">
        {!result && (
          <div className="text-[11px] font-mono text-ink-muted flex-1">
            ⚠ 暂无模拟结果。先到 <Link to="/sandbox" className="text-accent-amber hover:underline">模拟台</Link> 跑一次模拟。
          </div>
        )}
        {result && !anyDiff && (
          <div className="text-[11px] font-mono text-accent-green flex-1 flex items-center gap-1">
            <Check size={12} /> 当前沙盒配置与生产完全一致，无需同步
          </div>
        )}
        {result && anyDiff && (
          <>
            <div className="text-[11px] font-mono text-ink-secondary flex-1">
              将推送 <span className="text-accent-amber">{rows.filter((r) => r.diff).length}</span> 项差异到生产，新版本将覆盖当前 <span className="text-accent-green">{prod.version}</span>
            </div>
            <button onClick={syncToProd} className="btn-primary">
              <GitMerge size={12} /> 一键同步
            </button>
          </>
        )}
        {syncDiff && (
          <div className="text-[11px] font-mono text-accent-green flex items-center gap-1">
            <Check size={12} /> 已同步 · 新版本 {prod.version}
          </div>
        )}
      </div>
    </div>
  );
}

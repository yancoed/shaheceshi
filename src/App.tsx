import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { FlaskConical, History, GitCompareArrows, Cpu, Workflow, LayoutDashboard, LayoutGrid } from 'lucide-react';
import SandboxPage from '@/pages/Sandbox';
import ReplayPage from '@/pages/Replay';
import SyncPage from '@/pages/Sync';
import ScenariosPage from '@/pages/Scenarios';
import DashboardPage from '@/pages/Dashboard';
import StagePage from '@/features/stage/StagePage';
import StatusBar from '@/components/StatusBar';

function NavItem({ to, icon: Icon, label, sub }: { to: string; icon: typeof FlaskConical; label: string; sub: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-4 py-2.5 border-l-2 transition-colors ${
          isActive
            ? 'border-accent-amber bg-accent-amber/5 text-ink-primary'
            : 'border-transparent text-ink-secondary hover:text-ink-primary hover:bg-bg-raised'
        }`
      }
    >
      <Icon size={16} className="shrink-0" />
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-xs tracking-wider">{label}</span>
        <span className="text-[10px] text-ink-muted font-mono uppercase tracking-widest">{sub}</span>
      </div>
    </NavLink>
  );
}

export default function App() {
  return (
    <Router>
      <div className="relative min-h-screen flex flex-col z-10">
        <StatusBar />
        <div className="flex-1 flex">
          <aside className="w-56 border-r border-bg-border bg-bg-panel/60 flex flex-col">
            <div className="p-3 border-b border-bg-border">
              <div className="label">导航 / NAV</div>
            </div>
            <nav className="py-2 flex flex-col">
              <NavItem to="/sandbox"   icon={FlaskConical}     label="模拟台"   sub="SANDBOX" />
              <NavItem to="/scenarios" icon={Workflow}         label="场景编排" sub="SCENARIOS" />
              <NavItem to="/stage"     icon={LayoutGrid}       label="WCS 舞台" sub="STAGE" />
              <NavItem to="/dashboard" icon={LayoutDashboard}  label="结果看板" sub="DASHBOARD" />
              <NavItem to="/replay"    icon={History}          label="历史回放" sub="REPLAY" />
              <NavItem to="/sync"      icon={GitCompareArrows} label="生产同步" sub="SYNC" />
            </nav>
            <div className="mt-auto p-3 border-t border-bg-border">
              <div className="flex items-center gap-2 text-[10px] font-mono text-ink-muted">
                <Cpu size={12} className="text-accent-green" />
                <span>ENGINE&nbsp;ONLINE</span>
              </div>
              <div className="text-[10px] font-mono text-ink-muted mt-1">v0.2.0 · Configurable</div>
            </div>
          </aside>
          <main className="flex-1 min-w-0 overflow-hidden">
            <Routes>
              <Route path="/" element={<Navigate to="/sandbox" replace />} />
              <Route path="/sandbox" element={<SandboxPage />} />
              <Route path="/scenarios" element={<ScenariosPage />} />
              <Route path="/stage" element={<StagePage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/replay" element={<ReplayPage />} />
              <Route path="/sync" element={<SyncPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

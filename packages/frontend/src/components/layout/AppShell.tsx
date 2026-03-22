import { NavLink, Outlet } from 'react-router';
import { useWorkspace } from '../../contexts/WorkspaceContext';

const NAV_ITEMS = [
  { to: '/', label: 'Agent overview' },
  { to: '/tool-call-performance', label: 'Tool call performance' },
  { to: '/llm-token-usage', label: 'LLM token usage' },
  { to: '/error-breakdown', label: 'Error breakdown' },
  { to: '/cost-tracking', label: 'Cost tracking' },
];

export function AppShell() {
  const { workspaces, current, switchWorkspace, switching } = useWorkspace();

  return (
    <div className="app-shell">
      {/* Top bar */}
      <header className="app-header">
        <div className="app-header__brand">
          <div className="app-header__logo" />
          <span className="app-header__name">AgentWatch</span>
        </div>
        <div className="app-header__right">
          <select
            className="workspace-switcher"
            value={current.id}
            onChange={(e) => switchWorkspace(e.target.value)}
            disabled={switching}
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
          <span className="app-header__status">
            <span className="status-dot status-dot--live" /> Live
          </span>
        </div>
      </header>

      <div className="app-body">
        {/* Sidebar */}
        <nav className="app-sidebar">
          <div className="app-sidebar__section-label">Views</div>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `app-sidebar__link ${isActive ? 'app-sidebar__link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Main content */}
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { Layers3 } from 'lucide-react'
import { StatusBadge } from './StatusBadge'

export function AppShell({
  brandTitle,
  brandDescription,
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  statusItems = [],
  children
}) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">
          <div className="app-sidebar-brand-mark" aria-hidden="true">
            <Layers3 size={18} />
          </div>
          <div className="app-sidebar-brand-copy">
            <span className="section-eyebrow">Guanghe Ops</span>
            <strong>{brandTitle}</strong>
            <p>{brandDescription}</p>
          </div>
        </div>

        <nav className="app-side-nav" aria-label="工作区导航">
          {workspaces.map((workspace) => {
            const selected = activeWorkspace === workspace.key
            const Icon = workspace.icon

            return (
              <button
                key={workspace.key}
                type="button"
                className={`app-side-nav-item${selected ? ' active' : ''}`}
                aria-label={workspace.label}
                aria-current={selected ? 'page' : undefined}
                onClick={() => onSelectWorkspace(workspace.key)}
              >
                <span className="app-side-nav-item-head">
                  <span className="app-side-nav-icon" aria-hidden="true">
                    {Icon ? <Icon size={18} /> : null}
                  </span>
                  <span className="app-side-nav-copy">
                    <strong>{workspace.label}</strong>
                    <small>{workspace.shortLabel}</small>
                  </span>
                </span>
                <span className="app-side-nav-description">{workspace.description}</span>
              </button>
            )
          })}
        </nav>

        <div className="app-sidebar-footer">
          {statusItems.map((item) => {
            const Icon = item.icon
            return (
              <section key={item.label} className="app-sidebar-status-card">
                <div className="app-sidebar-status-head">
                  <span className="app-sidebar-status-label">
                    {Icon ? <Icon size={15} aria-hidden="true" /> : null}
                    <span>{item.label}</span>
                  </span>
                  {item.badge ? (
                    <StatusBadge tone={item.tone || 'neutral'} size="sm" emphasis="glass">
                      {item.badge}
                    </StatusBadge>
                  ) : null}
                </div>
                <strong>{item.value}</strong>
                {item.detail ? <small>{item.detail}</small> : null}
              </section>
            )
          })}
        </div>
      </aside>

      <div className="app-shell-main">
        {children}
      </div>
    </div>
  )
}

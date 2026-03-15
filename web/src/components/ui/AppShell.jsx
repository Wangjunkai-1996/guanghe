import { ChevronDown, Layers3 } from 'lucide-react'
import { useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'

export function AppShell({
  brandTitle,
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  statusItems = [],
  children
}) {
  const isMobile = useMediaQuery('(max-width: 900px)')
  const [mobileStatusExpanded, setMobileStatusExpanded] = useState(false)
  const activeWorkspaceMeta = workspaces.find((workspace) => workspace.key === activeWorkspace) || workspaces[0]
  const mobileStatusSummary = statusItems.filter(Boolean)
  const primaryStatus = mobileStatusSummary[3] || mobileStatusSummary[1] || mobileStatusSummary[0]
  const secondaryStatus = mobileStatusSummary[4] || mobileStatusSummary[2] || mobileStatusSummary[1]

  return (
    <div className="app-shell app-shell-v6">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">
          <div className="app-sidebar-brand-mark" aria-hidden="true">
            <Layers3 size={18} />
          </div>
          <div className="app-sidebar-brand-copy">
            <strong>{brandTitle}</strong>
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
                    <Icon size={17} />
                  </span>
                  <span className="app-side-nav-item-copy">
                    <span className="app-side-nav-title-row">
                      <strong>{workspace.label}</strong>
                      <span className={`workspace-state-dot tone-${workspace.stateTone || 'neutral'}`} aria-hidden="true" />
                    </span>
                    <small>{workspace.shortLabel}</small>
                  </span>
                </span>
                {workspace.count ? <span className="app-side-nav-count">{workspace.count}</span> : null}
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="app-shell-main">
        <header className="app-topbar">
          {isMobile ? (
            <button
              className="app-mobile-status-toggle"
              type="button"
              aria-expanded={mobileStatusExpanded}
              aria-controls="app-mobile-status-strip"
              onClick={() => setMobileStatusExpanded((current) => !current)}
            >
              <div className="app-mobile-status-toggle-copy">
                <span className="section-eyebrow">执行心跳</span>
                <strong>{primaryStatus?.value || primaryStatus?.detail || activeWorkspaceMeta?.label || brandTitle}</strong>
                <small>{secondaryStatus ? `${secondaryStatus.label}：${secondaryStatus.value}` : '展开后查看目标表、队列与异常状态'}</small>
              </div>
              <span className="app-mobile-status-toggle-action">
                {mobileStatusExpanded ? '收起' : '展开'}
                <ChevronDown className="app-mobile-status-toggle-chevron" size={16} aria-hidden="true" />
              </span>
            </button>
          ) : null}

          {(!isMobile || mobileStatusExpanded) ? (
            <div id="app-mobile-status-strip" className="app-topbar-status-strip app-heartbeat-strip" role="status" aria-live="polite">
              {statusItems.map((item) => (
                <div key={item.label} className={`app-topbar-status app-heartbeat-card tone-${item.tone || 'neutral'}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  {isMobile && item.detail ? <small>{item.detail}</small> : null}
                </div>
              ))}
            </div>
          ) : null}
        </header>
        <div className="app-shell-body">{children}</div>
      </div>
    </div>
  )
}

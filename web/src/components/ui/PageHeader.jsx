import { LayoutPanelTop } from 'lucide-react'
import { StatCard } from './StatCard'

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: IconComponent = LayoutPanelTop,
  badge = '',
  variant = 'hero',
  actions = null,
  stats = [],
  className = ''
}) {
  const classes = ['panel', 'workspace-hero', 'page-header', `page-header-${variant}`, className].filter(Boolean).join(' ')

  return (
    <header className={`${classes} page-header-enter`}>
      <div className="workspace-hero-copy page-header-copy">
        <div className="page-header-brandline">
          <div className="page-header-brand-mark">
            {IconComponent ? <IconComponent /> : null}
          </div>
          <div className="page-header-brand-copy">
            {eyebrow ? <span className="section-eyebrow">{eyebrow}</span> : null}
            {badge ? <span className="page-header-badge">{badge}</span> : null}
          </div>
        </div>
        <h1>{title}</h1>
        {description ? <p className="page-header-description">{description}</p> : null}
      </div>

      <div className="page-header-meta">
        {actions ? <div className="workspace-hero-actions page-header-actions">{actions}</div> : null}
        {stats.length ? (
          <div className="workspace-header-stats page-header-stats">
            {stats.map((item) => (
              <StatCard
                key={`${item.label}-${item.value}`}
                label={item.label}
                value={item.value}
                detail={item.detail}
                tone={item.tone}
                eyebrow={item.eyebrow}
                icon={item.icon}
                emphasis={item.emphasis}
              />
            ))}
          </div>
        ) : null}
      </div>
    </header>
  )
}

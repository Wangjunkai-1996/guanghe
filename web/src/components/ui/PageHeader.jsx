import { StatCard } from './StatCard'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions = null,
  stats = [],
  className = ''
}) {
  const classes = ['panel', 'workspace-hero', 'page-header', className].filter(Boolean).join(' ')

  return (
    <header className={classes}>
      <div className="workspace-hero-copy page-header-copy">
        {eyebrow ? <span className="section-eyebrow">{eyebrow}</span> : null}
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
              />
            ))}
          </div>
        ) : null}
      </div>
    </header>
  )
}

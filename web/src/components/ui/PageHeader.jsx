import { DashboardIcon } from './ShellIcons'

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: IconComponent = DashboardIcon,
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
            {stats.map((item) => <PageHeaderStatCard key={`${item.label}-${item.value}`} {...item} />)}
          </div>
        ) : null}
      </div>
    </header>
  )
}

function PageHeaderStatCard({
  label,
  value,
  detail,
  tone = 'neutral',
  eyebrow = '',
  icon: Icon = null,
  emphasis = 'soft'
}) {
  const classes = ['header-stat-card', 'ui-stat-card', `tone-${tone}`, `emphasis-${emphasis}`].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <div className="ui-stat-card-topline">
        <div className="ui-stat-card-copy">
          {eyebrow ? <span className="ui-stat-card-eyebrow">{eyebrow}</span> : null}
          <span>{label}</span>
        </div>
        {Icon ? (
          <div className="ui-stat-card-icon-wrap">
            <Icon className={`ui-tone-icon tone-${tone} ui-stat-card-icon`} aria-hidden="true" />
          </div>
        ) : null}
      </div>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  )
}

import { ToneIcon } from './ToneIcon'

export function StatCard({
  label,
  value,
  detail,
  tone = 'neutral',
  eyebrow = '',
  icon = null,
  emphasis = 'soft',
  className = ''
}) {
  const classes = [
    'header-stat-card',
    'ui-stat-card',
    `tone-${tone}`,
    `emphasis-${emphasis}`,
    className
  ].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <div className="ui-stat-card-topline">
        <div className="ui-stat-card-copy">
          {eyebrow ? <span className="ui-stat-card-eyebrow">{eyebrow}</span> : null}
          <span>{label}</span>
        </div>
        {icon ? (
          <div className="ui-stat-card-icon-wrap">
            <ToneIcon tone={tone} icon={icon} className="ui-stat-card-icon" />
          </div>
        ) : null}
      </div>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  )
}

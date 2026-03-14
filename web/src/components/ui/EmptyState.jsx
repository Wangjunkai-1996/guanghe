import { Sparkles } from 'lucide-react'
import { ToneIcon } from './ToneIcon'

export function EmptyState({
  title,
  description,
  eyebrow = '',
  tone = 'neutral',
  icon = Sparkles,
  actionLabel,
  onAction,
  action,
  className = ''
}) {
  const resolvedLabel = action?.label ?? actionLabel
  const resolvedAction = action?.onClick ?? onAction
  const classes = ['result-empty-state', 'ui-empty-state', `tone-${tone}`, className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <div className="ui-empty-state-icon-wrap">
        <ToneIcon tone={tone} icon={icon} className="ui-empty-state-icon" />
      </div>
      {eyebrow ? <span className="section-eyebrow">{eyebrow}</span> : null}
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {resolvedLabel && resolvedAction ? (
        <div className="ui-empty-state-actions">
          <button className="secondary-btn" type="button" onClick={resolvedAction}>
            {resolvedLabel}
          </button>
        </div>
      ) : null}
    </div>
  )
}

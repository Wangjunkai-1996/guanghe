import { ToneIcon } from './ToneIcon'

export function StatusBadge({
  tone = 'neutral',
  size = 'md',
  emphasis = 'soft',
  icon = null,
  showIcon = true,
  className = '',
  children
}) {
  const classes = [
    'status-pill',
    `status-${tone}`,
    `status-pill-${emphasis}`,
    size === 'sm' ? 'status-pill-sm' : '',
    className
  ].filter(Boolean).join(' ')

  return (
    <span className={classes}>
      {showIcon ? <ToneIcon tone={tone} icon={icon} className="status-pill-icon" /> : null}
      <span>{children}</span>
    </span>
  )
}

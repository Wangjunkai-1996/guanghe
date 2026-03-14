export function InlineNotice({
  tone = 'info',
  title,
  description,
  actionLabel,
  onAction,
  action,
  className = ''
}) {
  const resolvedLabel = action?.label ?? actionLabel
  const resolvedAction = action?.onClick ?? onAction
  const classes = ['ui-inline-notice', `tone-${tone}`, className].filter(Boolean).join(' ')
  const role = tone === 'danger' ? 'alert' : 'status'

  return (
    <div className={classes} role={role} aria-live={tone === 'danger' ? 'assertive' : 'polite'} aria-atomic="true">
      <div className="ui-inline-notice-copy">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {resolvedLabel && resolvedAction ? (
        <div className="ui-inline-notice-actions">
          <button className="secondary-btn" type="button" onClick={resolvedAction}>
            {resolvedLabel}
          </button>
        </div>
      ) : null}
    </div>
  )
}

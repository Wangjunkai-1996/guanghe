export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  action,
  className = ''
}) {
  const resolvedLabel = action?.label ?? actionLabel
  const resolvedAction = action?.onClick ?? onAction
  const classes = ['result-empty-state', 'ui-empty-state', className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
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

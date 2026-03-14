export function Toolbar({ title, description, actions = null, className = '', children }) {
  const classes = ['ui-toolbar', className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      {(title || description || actions) ? (
        <div className="ui-toolbar-header">
          <div className="ui-toolbar-copy">
            {title ? <h3>{title}</h3> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="ui-toolbar-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children ? <div className="ui-toolbar-body">{children}</div> : null}
    </div>
  )
}

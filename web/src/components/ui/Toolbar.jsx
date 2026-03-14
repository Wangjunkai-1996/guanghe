import { ToneIcon } from './ToneIcon'

export function Toolbar({
  title,
  description,
  eyebrow = '',
  icon = null,
  actions = null,
  className = '',
  children
}) {
  const classes = ['ui-toolbar', className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      {(title || description || actions) ? (
        <div className="ui-toolbar-header">
          <div className="ui-toolbar-copy">
            {(eyebrow || icon) ? (
              <div className="ui-toolbar-kicker">
                {icon ? <ToneIcon tone="accent" icon={icon} className="ui-toolbar-kicker-icon" /> : null}
                {eyebrow ? <span className="section-eyebrow">{eyebrow}</span> : null}
              </div>
            ) : null}
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

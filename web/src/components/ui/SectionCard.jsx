import { ToneIcon } from './ToneIcon'

export function SectionCard({
  as: Component = 'section',
  className = '',
  children,
  variant = 'default',
  emphasis = 'soft',
  eyebrow = '',
  title = '',
  description = '',
  icon = null,
  actions = null,
  ...props
}) {
  const classes = [
    'panel',
    'ui-section-card',
    `section-card-${variant}`,
    `section-emphasis-${emphasis}`,
    className
  ].filter(Boolean).join(' ')

  return (
    <Component className={classes} {...props}>
      {(eyebrow || title || description || actions) ? (
        <div className="ui-section-card-header">
          <div className="ui-section-card-header-copy">
            {(icon || eyebrow) ? (
              <div className="ui-section-card-kicker">
                {icon ? <ToneIcon tone={variant === 'hero' ? 'accent' : 'info'} icon={icon} className="ui-section-card-kicker-icon" /> : null}
                {eyebrow ? <span className="section-eyebrow">{eyebrow}</span> : null}
              </div>
            ) : null}
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="ui-section-card-header-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Component>
  )
}

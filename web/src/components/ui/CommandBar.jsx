export function CommandBar({
  eyebrow,
  title,
  description,
  actions = null,
  meta = null,
  children = null,
  className = ''
}) {
  const classes = ['panel', 'command-bar', className].filter(Boolean).join(' ')

  return (
    <section className={classes}>
      <div className="command-bar-header">
        <div className="command-bar-copy">
          {eyebrow ? <span className="section-eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>

        {(actions || meta) ? (
          <div className="command-bar-meta">
            {meta ? <div className="command-bar-meta-copy">{meta}</div> : null}
            {actions ? <div className="command-bar-actions">{actions}</div> : null}
          </div>
        ) : null}
      </div>

      {children ? <div className="command-bar-body">{children}</div> : null}
    </section>
  )
}

export function SectionCard({ as: Component = 'section', className = '', children, ...props }) {
  const classes = ['panel', 'ui-section-card', className].filter(Boolean).join(' ')
  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  )
}

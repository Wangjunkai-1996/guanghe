export function StatusBadge({ tone = 'neutral', size = 'md', className = '', children }) {
  const classes = [
    'status-pill',
    `status-${tone}`,
    size === 'sm' ? 'status-pill-sm' : '',
    className
  ].filter(Boolean).join(' ')

  return <span className={classes}>{children}</span>
}

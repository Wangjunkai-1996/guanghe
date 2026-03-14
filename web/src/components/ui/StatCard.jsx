export function StatCard({ label, value, detail, tone = 'neutral', className = '' }) {
  const classes = ['header-stat-card', 'ui-stat-card', `tone-${tone}`, className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  )
}

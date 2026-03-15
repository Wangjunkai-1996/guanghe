import { ChevronDown } from 'lucide-react'
import { useId } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { SectionCard } from './SectionCard'
import { StatusBadge } from './StatusBadge'

export function StageSectionCard({
  id,
  className = '',
  children,
  variant = 'default',
  emphasis = 'soft',
  eyebrow = '',
  title = '',
  description = '',
  icon = null,
  actions = null,
  mobileSummary = null,
  mobileExpanded = false,
  onToggleMobile = () => {},
  ...props
}) {
  const isMobile = useMediaQuery('(max-width: 900px)')
  const mobileContentId = useId()

  if (!isMobile) {
    return (
      <SectionCard
        id={id}
        className={className}
        variant={variant}
        emphasis={emphasis}
        eyebrow={eyebrow}
        title={title}
        description={description}
        icon={icon}
        actions={actions}
        {...props}
      >
        {children}
      </SectionCard>
    )
  }

  const classes = [
    'panel',
    'ui-section-card',
    `section-card-${variant}`,
    `section-emphasis-${emphasis}`,
    className,
    'mobile-stage-card',
    mobileExpanded ? 'is-open' : 'is-collapsed'
  ].filter(Boolean).join(' ')

  return (
    <section id={id} className={classes} {...props}>
      <button
        className="mobile-stage-summary"
        type="button"
        aria-expanded={mobileExpanded}
        aria-controls={mobileContentId}
        onClick={onToggleMobile}
      >
        <div className="mobile-stage-summary-copy">
          {eyebrow ? <span className="section-eyebrow">{eyebrow}</span> : null}
          {title ? <h2>{title}</h2> : null}
          {(mobileSummary?.description || description) ? <p>{mobileSummary?.description || description}</p> : null}
        </div>

        <div className="mobile-stage-summary-meta">
          {mobileSummary?.status ? (
            <StatusBadge tone={mobileSummary.statusTone || 'neutral'} size="sm" emphasis="soft">
              {mobileSummary.status}
            </StatusBadge>
          ) : null}
          {mobileSummary?.value ? <strong>{mobileSummary.value}</strong> : null}
          {mobileSummary?.detail ? <small>{mobileSummary.detail}</small> : null}
          <span className="mobile-stage-summary-toggle">
            {mobileExpanded ? '收起' : '展开'}
            <ChevronDown className="mobile-stage-summary-chevron" size={16} aria-hidden="true" />
          </span>
        </div>
      </button>

      <div id={mobileContentId} className="mobile-stage-content" hidden={!mobileExpanded}>
        {children}
      </div>
    </section>
  )
}

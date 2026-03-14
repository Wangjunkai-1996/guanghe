import {
  AlertTriangle,
  BellRing,
  CircleAlert,
  CircleCheckBig,
  Info,
  Sparkles
} from 'lucide-react'

const TONE_ICONS = {
  accent: Sparkles,
  danger: CircleAlert,
  info: BellRing,
  neutral: Info,
  success: CircleCheckBig,
  warning: AlertTriangle
}

export function ToneIcon({ tone = 'info', icon: IconComponent = null, className = '', ariaHidden = true }) {
  const Icon = IconComponent || TONE_ICONS[tone] || Info
  const classes = ['ui-tone-icon', `tone-${tone}`, className].filter(Boolean).join(' ')

  return <Icon className={classes} aria-hidden={ariaHidden} strokeWidth={2} />
}

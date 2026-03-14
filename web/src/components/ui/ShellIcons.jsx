function BaseShellIcon({ size = 18, className = '', children, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {children}
    </svg>
  )
}

export function DashboardIcon(props) {
  return (
    <BaseShellIcon {...props}>
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <path d="M8 9h8" />
      <path d="M8 14h4" />
      <path d="M15.5 13v3.5" />
      <path d="M13.75 14.75h3.5" />
    </BaseShellIcon>
  )
}

export function WorkflowIcon(props) {
  return (
    <BaseShellIcon {...props}>
      <circle cx="6.5" cy="7" r="2.25" />
      <circle cx="17.5" cy="7" r="2.25" />
      <circle cx="12" cy="17" r="2.25" />
      <path d="M8.7 8.2 10.8 10" />
      <path d="M15.3 8.2 13.2 10" />
      <path d="M12 12.5V14.7" />
    </BaseShellIcon>
  )
}

export function UsersIcon(props) {
  return (
    <BaseShellIcon {...props}>
      <path d="M8.75 13.25c-2.55 0-4.75 1.55-5.75 3.75" />
      <path d="M15.25 13.25c2.55 0 4.75 1.55 5.75 3.75" />
      <circle cx="8.25" cy="8.25" r="2.75" />
      <circle cx="15.75" cy="8.25" r="2.25" />
    </BaseShellIcon>
  )
}

export function SparklesIcon(props) {
  return (
    <BaseShellIcon {...props}>
      <path d="M12 3.75 13.45 8.2 17.9 9.65 13.45 11.1 12 15.55 10.55 11.1 6.1 9.65 10.55 8.2 12 3.75Z" />
      <path d="M18.25 15.25 18.95 17.05 20.75 17.75 18.95 18.45 18.25 20.25 17.55 18.45 15.75 17.75 17.55 17.05 18.25 15.25Z" />
      <path d="M5.75 14.75 6.3 16.05 7.6 16.6 6.3 17.15 5.75 18.45 5.2 17.15 3.9 16.6 5.2 16.05 5.75 14.75Z" />
    </BaseShellIcon>
  )
}

export function TrendUpIcon(props) {
  return (
    <BaseShellIcon {...props}>
      <path d="M4 18.5h16" />
      <path d="m6.25 14.5 3.25-3.25 2.5 2.5 5-5" />
      <path d="M14.75 6.25H19v4.25" />
    </BaseShellIcon>
  )
}

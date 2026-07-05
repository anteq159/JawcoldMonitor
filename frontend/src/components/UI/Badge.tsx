interface Props {
  children: React.ReactNode
  variant?: 'green' | 'red' | 'yellow' | 'gray' | 'blue'
  className?: string
}

const variants = {
  green: 'bg-good-bg text-good border border-good/20',
  red: 'bg-crit-bg text-crit border border-crit/20',
  yellow: 'bg-warn-bg text-warn border border-warn/20',
  gray: 'bg-surface-2 text-ink-muted border border-border-strong',
  blue: 'bg-info-bg text-info border border-info/20',
}

export function Badge({ children, variant = 'gray', className = '' }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}

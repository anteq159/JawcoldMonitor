interface Props {
  icon?: React.ReactNode
  title?: string
  message: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, message, action, className = '' }: Props) {
  return (
    <div className={`text-center py-10 px-6 ${className}`}>
      {icon && <div className="text-ink-muted/60 mx-auto mb-3 flex justify-center">{icon}</div>}
      {title && <p className="text-sm font-medium text-ink mb-1">{title}</p>}
      <p className="text-sm text-ink-muted">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

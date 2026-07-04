interface Props {
  children: React.ReactNode
  className?: string
  title?: string
  action?: React.ReactNode
}

export function Card({ children, className = '', title, action }: Props) {
  return (
    <div className={`bg-surface border border-border rounded-xl shadow-panel ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          {title && <h3 className="font-semibold text-ink text-sm">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export function StatCard({ label, value, sub, icon, color = 'blue' }: {
  label: string; value: string | number; sub?: string; icon?: React.ReactNode; color?: string
}) {
  const colors: Record<string, string> = {
    blue: 'text-accent',
    green: 'text-good',
    red: 'text-crit',
    yellow: 'text-warn',
    purple: 'text-violet-600',
  }
  return (
    <div className="bg-surface border border-border rounded-xl shadow-panel p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-ink-muted uppercase tracking-wider">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${colors[color] || 'text-ink'}`}>{value}</p>
          {sub && <p className="text-xs text-ink-muted mt-1">{sub}</p>}
        </div>
        {icon && <div className={`${colors[color]} opacity-70`}>{icon}</div>}
      </div>
    </div>
  )
}

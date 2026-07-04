interface Props {
  children: React.ReactNode
  className?: string
  title?: string
  action?: React.ReactNode
}

export function Card({ children, className = '', title, action }: Props) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          {title && <h3 className="font-semibold text-white text-sm">{title}</h3>}
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
    blue: 'text-blue-400',
    green: 'text-green-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
    purple: 'text-purple-400',
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${colors[color] || 'text-white'}`}>{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        {icon && <div className={`${colors[color]} opacity-60`}>{icon}</div>}
      </div>
    </div>
  )
}

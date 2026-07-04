interface Props {
  children: React.ReactNode
  variant?: 'green' | 'red' | 'yellow' | 'gray' | 'blue'
  className?: string
}

const variants = {
  green: 'bg-green-500/20 text-green-400 border border-green-500/30',
  red: 'bg-red-500/20 text-red-400 border border-red-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  gray: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  blue: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
}

export function Badge({ children, variant = 'gray', className = '' }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}

import { Menu } from 'lucide-react'
import { useDeviceStore } from '../../store/devices'

interface Props { onMenuClick: () => void; title: string }

export function Header({ onMenuClick, title }: Props) {
  const stats = useDeviceStore((s) => s.systemStats)

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-4 shrink-0">
      <button onClick={onMenuClick} className="text-gray-400 hover:text-white lg:hidden">
        <Menu size={20} />
      </button>
      <h1 className="text-sm font-semibold text-white flex-1">{title}</h1>
      {stats && (
        <div className="hidden md:flex items-center gap-4 text-xs text-gray-400">
          <span>CPU: {stats.cpu_percent.toFixed(0)}%</span>
          {stats.cpu_temp && <span>Temp: {stats.cpu_temp.toFixed(0)}°C</span>}
          <span>RAM: {stats.ram_percent.toFixed(0)}%</span>
        </div>
      )}
    </header>
  )
}

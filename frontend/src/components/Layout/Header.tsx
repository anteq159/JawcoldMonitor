import { Menu, Wifi, WifiOff, Loader2, Cpu as CpuIcon, MemoryStick, Thermometer } from 'lucide-react'
import { useDeviceStore } from '../../store/devices'

interface Props { onMenuClick: () => void; title: string }

const WS_LABEL: Record<string, string> = {
  connected: 'Połączono',
  connecting: 'Łączenie…',
  disconnected: 'Rozłączono',
}

export function Header({ onMenuClick, title }: Props) {
  const stats = useDeviceStore((s) => s.systemStats)
  const wsStatus = useDeviceStore((s) => s.wsStatus)

  return (
    <header className="h-14 bg-surface border-b border-border flex items-center px-4 gap-4 shrink-0">
      <button onClick={onMenuClick} className="text-ink-muted hover:text-ink lg:hidden" aria-label="Otwórz menu">
        <Menu size={20} />
      </button>
      <h1 className="text-sm font-semibold text-ink flex-1">{title}</h1>

      <div
        className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border shrink-0 ${
          wsStatus === 'connected'
            ? 'bg-good-bg text-good border-good/20'
            : wsStatus === 'connecting'
              ? 'bg-warn-bg text-warn border-warn/20'
              : 'bg-crit-bg text-crit border-crit/20'
        }`}
        title="Status połączenia na żywo (WebSocket)"
      >
        {wsStatus === 'connected' ? (
          <Wifi size={12} />
        ) : wsStatus === 'connecting' ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <WifiOff size={12} />
        )}
        {WS_LABEL[wsStatus]}
      </div>

      {stats && (
        <div className="hidden md:flex items-center gap-3 text-xs text-ink-muted shrink-0">
          <span className="flex items-center gap-1"><CpuIcon size={12} /> {stats.cpu_percent.toFixed(0)}%</span>
          {stats.cpu_temp != null && (
            <span className="flex items-center gap-1"><Thermometer size={12} /> {stats.cpu_temp.toFixed(0)}°C</span>
          )}
          <span className="flex items-center gap-1"><MemoryStick size={12} /> {stats.ram_percent.toFixed(0)}%</span>
        </div>
      )}
    </header>
  )
}

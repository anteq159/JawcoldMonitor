import { NavLink } from 'react-router-dom'
import { useDeviceStore } from '../../store/devices'
import { deviceSummary } from '../../utils/registers'
import {
  LayoutDashboard, Cpu, Thermometer, Bell, FileText, Users, ShieldCheck, Activity, Settings2, Map, Settings, X, LogOut, Snowflake
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useAuthStore } from '../../store/auth'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  exact?: boolean
  // Shown only to users holding this permission (Admin holds all).
  permission?: string
}

const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { to: '/map', label: 'Mapa', icon: Map },
    ],
  },
  {
    label: 'Monitorowanie',
    items: [
      { to: '/devices', label: 'Sterowniki', icon: Cpu },
      { to: '/configuration', label: 'Konfiguracja', icon: Settings2, permission: 'config:write' },
      { to: '/sensors', label: 'Czujniki', icon: Thermometer },
      { to: '/alerts', label: 'Alerty', icon: Bell },
      { to: '/logs', label: 'Logi', icon: FileText },
    ],
  },
  {
    label: 'Administracja',
    items: [
      { to: '/users', label: 'Użytkownicy', icon: Users, permission: 'user:manage' },
      { to: '/roles', label: 'Role i uprawnienia', icon: ShieldCheck, permission: 'user:manage' },
      { to: '/diagnostics', label: 'Diagnostyka', icon: Activity, permission: 'system:manage' },
      { to: '/settings', label: 'Ustawienia', icon: Settings },
    ],
  },
]

interface Props { onClose?: () => void }

export function Sidebar({ onClose }: Props) {
  const { user, logout } = useAuth()
  const can = useAuthStore((s) => s.can)
  // Subscribing to the user re-renders the menu when roles change.
  useAuthStore((s) => s.user)
  // Primitive selector: re-renders only when the number changes.
  const alarmCount = useDeviceStore((s) =>
    s.devices.reduce((n, d) => n + deviceSummary(d, s.liveReadings[d.id] ?? {}).activeAlarms.length, 0))

  return (
    <aside className="flex flex-col h-full bg-surface border-r border-border w-64 shrink-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <span className="flex items-center gap-2 text-ink font-bold text-lg tracking-tight">
          <Snowflake size={19} className="text-accent" strokeWidth={2.25} />
          JawcoldMonitor
        </span>
        {onClose && (
          <button onClick={onClose} className="text-ink-muted hover:text-ink lg:hidden" aria-label="Zamknij menu">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_GROUPS.map((group, gi) => {
          const items = group.items.filter((item) => !item.permission || can(item.permission))
          if (items.length === 0) return null
          return (
            <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
              {group.label && (
                <p className="px-3 mb-1 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                  {group.label}
                </p>
              )}
              {items.map(({ to, label, icon: Icon, exact }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={exact}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
                      isActive
                        ? 'bg-accent-soft text-accent-strong font-medium'
                        : 'text-ink-body hover:text-ink hover:bg-surface-2'
                    }`
                  }
                  onClick={onClose}
                >
                  <Icon size={16} />
                  <span className="flex-1">{label}</span>
                  {to === '/alerts' && alarmCount > 0 && (
                    <span className="min-w-[1.25rem] text-center text-[11px] font-semibold bg-crit text-white rounded-full px-1.5 py-0.5"
                      title="Aktywne alarmy sterowników">
                      {alarmCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      <div className="px-4 py-3 border-t border-border">
        <div className="text-xs font-medium text-ink">{user?.username}</div>
        <div className="text-xs text-ink-muted">{user?.roles.map((r) => r.name).join(', ')}</div>
        <button
          onClick={logout}
          className="mt-2 flex items-center gap-2 text-xs text-ink-muted hover:text-crit transition-colors"
        >
          <LogOut size={13} />
          Wyloguj
        </button>
      </div>
    </aside>
  )
}

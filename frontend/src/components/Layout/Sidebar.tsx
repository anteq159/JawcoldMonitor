import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Cpu, Thermometer, Bell, FileText, Users, ShieldCheck, Map, Settings, X, LogOut
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/map', label: 'Mapa', icon: Map },
  { to: '/devices', label: 'Urządzenia RS485', icon: Cpu },
  { to: '/sensors', label: 'Czujniki Dallas', icon: Thermometer },
  { to: '/alerts', label: 'Alerty', icon: Bell },
  { to: '/logs', label: 'Logi', icon: FileText },
  { to: '/users', label: 'Użytkownicy', icon: Users, adminOnly: true },
  { to: '/roles', label: 'Role i uprawnienia', icon: ShieldCheck, adminOnly: true },
  { to: '/settings', label: 'Ustawienia', icon: Settings },
]

interface Props { onClose?: () => void }

export function Sidebar({ onClose }: Props) {
  const { user, logout, isAdmin } = useAuth()

  return (
    <aside className="flex flex-col h-full bg-gray-900 border-r border-gray-800 w-64 shrink-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <span className="text-blue-400 font-bold text-lg tracking-tight">JawcoldMonitor</span>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-white lg:hidden">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV.map(({ to, label, icon: Icon, exact, adminOnly }) => {
          if (adminOnly && !isAdmin) return null
          return (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
              onClick={onClose}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          )
        })}
      </nav>

      <div className="px-4 py-3 border-t border-gray-800">
        <div className="text-xs text-gray-500 mb-1">{user?.username}</div>
        <div className="text-xs text-gray-600">{user?.roles.map((r) => r.name).join(', ')}</div>
        <button
          onClick={logout}
          className="mt-2 flex items-center gap-2 text-xs text-gray-400 hover:text-red-400 transition-colors"
        >
          <LogOut size={13} />
          Wyloguj
        </button>
      </div>
    </aside>
  )
}

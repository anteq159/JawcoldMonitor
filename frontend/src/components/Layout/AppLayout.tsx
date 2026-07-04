import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Toaster } from 'react-hot-toast'
import { useWebSocket } from '../../hooks/useWebSocket'
import { NewDeviceModal } from '../Alerts/NewDeviceModal'

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/devices': 'Urządzenia RS485',
  '/sensors': 'Czujniki Dallas',
  '/alerts': 'Alerty',
  '/logs': 'Logi zdarzeń',
  '/users': 'Użytkownicy',
  '/roles': 'Role i uprawnienia',
  '/settings': 'Ustawienia',
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  useWebSocket()

  const title = Object.entries(TITLES).find(([path]) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  )?.[1] ?? 'JawcoldMonitor'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 h-full z-50">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <Toaster position="top-right" toastOptions={{ style: { background: '#1f2937', color: '#f9fafb', border: '1px solid #374151' } }} />
      <NewDeviceModal />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Toaster } from 'react-hot-toast'
import { useWebSocket } from '../../hooks/useWebSocket'
import { NewDeviceModal } from '../Alerts/NewDeviceModal'
import { SetupWizard, isWizardCompleted } from '../Wizard/SetupWizard'
import { getFavorites, getFavoriteParameters } from '../../api/favorites'
import { useDeviceStore } from '../../store/devices'

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/map': 'Mapa',
  '/devices': 'Sterowniki',
  '/configuration': 'Konfiguracja',
  '/sensors': 'Czujniki',
  '/alerts': 'Alerty',
  '/trendy': 'Trendy',
  '/logs': 'Logi zdarzeń',
  '/users': 'Użytkownicy',
  '/roles': 'Role i uprawnienia',
  '/diagnostics': 'Diagnostyka',
  '/settings': 'Ustawienia',
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const setFavoriteIds = useDeviceStore((s) => s.setFavoriteIds)
  const setFavoriteParameters = useDeviceStore((s) => s.setFavoriteParameters)
  const setWizardOpen = useDeviceStore((s) => s.setWizardOpen)
  useWebSocket()

  useEffect(() => {
    getFavorites().then((favs) => setFavoriteIds(new Set(favs.map((f) => f.device_id)))).catch(() => {})
    getFavoriteParameters().then((favs) => setFavoriteParameters(
      favs.map((f) => ({
        id: `${f.source_type}:${f.source_id}:${f.param_name ?? ''}`,
        type: f.source_type,
        sourceId: f.source_id,
        paramName: f.param_name ?? undefined,
      }))
    )).catch(() => {})
    if (!isWizardCompleted()) setWizardOpen(true)
  }, [])

  const title = Object.entries(TITLES).find(([path]) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  )?.[1] ?? 'JawcoldMonitor'

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-ink-body">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 h-full z-50">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* key on pathname re-mounts the wrapper per navigation so the
              entrance animation plays on every page change, not only the
              first layout mount */}
          <div key={location.pathname} className="animate-page-in">
            <Outlet />
          </div>
        </main>
      </div>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#FFFFFF',
            color: '#1B2624',
            border: '1px solid #DCE6E4',
            boxShadow: '0 4px 12px rgba(27,38,36,0.08)',
          },
        }}
      />
      <NewDeviceModal />
      <SetupWizard />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Toaster } from 'react-hot-toast'
import { useWebSocket } from '../../hooks/useWebSocket'
import { NewDeviceModal } from '../Alerts/NewDeviceModal'
import { SetupWizard, isWizardCompleted } from '../Wizard/SetupWizard'
import { getFavorites, getFavoriteParameters } from '../../api/favorites'
import { getMe } from '../../api/auth'
import { useDeviceStore } from '../../store/devices'
import { useAuthStore } from '../../store/auth'

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
  // Desktop sidebar collapse - persisted so the choice survives reloads.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('jawcold-sidebar-collapsed') === '1'
  )
  const toggleSidebar = () => {
    setSidebarCollapsed((c) => {
      localStorage.setItem('jawcold-sidebar-collapsed', c ? '0' : '1')
      return !c
    })
  }
  const location = useLocation()
  const setFavoriteIds = useDeviceStore((s) => s.setFavoriteIds)
  const setFavoriteParameters = useDeviceStore((s) => s.setFavoriteParameters)
  const setWizardOpen = useDeviceStore((s) => s.setWizardOpen)
  useWebSocket()

  useEffect(() => {
    // Refresh the stored user on every app load: the persisted copy in
    // localStorage predates permission changes an admin may have made
    // (or the permissions field itself, for sessions from before it was
    // exposed) - without this, permission-gated UI would stay wrong
    // until the next manual re-login.
    getMe().then((u) => useAuthStore.getState().setUser(u)).catch(() => {})
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
      {/* Desktop sidebar - width animates to 0 when collapsed; the inner
          Sidebar keeps its fixed w-64 so contents slide out instead of
          squishing during the transition */}
      <div
        className={`hidden lg:block overflow-hidden transition-[width] duration-300 ease-in-out motion-reduce:transition-none ${
          sidebarCollapsed ? 'w-0' : 'w-64'
        }`}
      >
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
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          onToggleSidebar={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
          title={title}
        />
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

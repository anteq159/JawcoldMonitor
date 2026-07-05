import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './components/Layout/AppLayout'
import { PageSpinner } from './components/UI/Spinner'
import { ProtectedRoute } from './App'

// Route-level code splitting: without it the whole app (echarts included,
// ~1MB minified on its own) shipped as one 1.5MB chunk that every page -
// including the login screen - had to download before rendering. Each page
// now loads its own chunk on first visit; echarts only ever downloads when
// a page that actually renders a chart is opened. Matters most on the
// Raspberry Pi deployment, where the Pi itself serves the bundle over LAN
// (or worse, over VPN from a remote site).
const Login = lazy(() => import('./pages/Login'))
const ChangePassword = lazy(() => import('./pages/ChangePassword'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Devices = lazy(() => import('./pages/Devices'))
const DeviceDetail = lazy(() => import('./pages/DeviceDetail'))
const Sensors = lazy(() => import('./pages/Sensors'))
const Alerts = lazy(() => import('./pages/Alerts'))
const Trends = lazy(() => import('./pages/Trends'))
const Logs = lazy(() => import('./pages/Logs'))
const Users = lazy(() => import('./pages/Users'))
const Roles = lazy(() => import('./pages/Roles'))
const Configuration = lazy(() => import('./pages/Configuration'))
const Diagnostics = lazy(() => import('./pages/Diagnostics'))
const Map = lazy(() => import('./pages/Map'))
const Settings = lazy(() => import('./pages/Settings'))
const NotFound = lazy(() => import('./pages/NotFound'))

const page = (el: React.ReactNode) => <Suspense fallback={<PageSpinner />}>{el}</Suspense>

export const router = createBrowserRouter([
  { path: '/login', element: page(<Login />) },
  { path: '/change-password', element: page(<ChangePassword />) },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: page(<Dashboard />) },
      { path: 'devices', element: page(<Devices />) },
      { path: 'devices/:id', element: page(<DeviceDetail />) },
      { path: 'sensors', element: page(<Sensors />) },
      { path: 'alerts', element: page(<Alerts />) },
      { path: 'trendy', element: page(<Trends />) },
      { path: 'map', element: page(<Map />) },
      { path: 'logs', element: page(<Logs />) },
      { path: 'users', element: page(<Users />) },
      { path: 'roles', element: page(<Roles />) },
      { path: 'configuration', element: page(<Configuration />) },
      { path: 'diagnostics', element: page(<Diagnostics />) },
      { path: 'settings', element: page(<Settings />) },
    ],
  },
  { path: '*', element: page(<NotFound />) },
])

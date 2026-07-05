import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './components/Layout/AppLayout'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import DeviceDetail from './pages/DeviceDetail'
import Sensors from './pages/Sensors'
import Alerts from './pages/Alerts'
import Trends from './pages/Trends'
import Logs from './pages/Logs'
import Users from './pages/Users'
import Roles from './pages/Roles'
import Configuration from './pages/Configuration'
import Diagnostics from './pages/Diagnostics'
import Map from './pages/Map'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'
import { ProtectedRoute } from './App'

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/change-password', element: <ChangePassword /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'devices', element: <Devices /> },
      { path: 'devices/:id', element: <DeviceDetail /> },
      { path: 'sensors', element: <Sensors /> },
      { path: 'alerts', element: <Alerts /> },
      { path: 'trendy', element: <Trends /> },
      { path: 'map', element: <Map /> },
      { path: 'logs', element: <Logs /> },
      { path: 'users', element: <Users /> },
      { path: 'roles', element: <Roles /> },
      { path: 'configuration', element: <Configuration /> },
      { path: 'diagnostics', element: <Diagnostics /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
  { path: '*', element: <NotFound /> },
])

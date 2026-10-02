import api from './client'

export const getEventLogs = (params?: { event_type?: string; device_id?: number; limit?: number; before?: string }) =>
  api.get('/logs/events', { params }).then((r) => r.data)

export const getAuditLogs = (limit = 100) => api.get('/logs/audit', { params: { limit } }).then((r) => r.data)

export interface LoginEntry {
  id: number
  action: 'login' | 'login_failed' | 'logout' | 'change_password'
  username: string | null
  user_exists: boolean
  reason: 'unknown_user' | 'bad_password' | 'inactive' | null
  user_agent: string | null
  ip_address: string | null
  timestamp: string
}
export const getLogins = (params?: { before?: string; limit?: number; failed_only?: boolean }): Promise<{ enabled: boolean; items: LoginEntry[] }> =>
  api.get('/logs/logins', { params }).then((r) => r.data)
export const setLoginLogging = (enabled: boolean) => api.put('/logs/logins/settings', { enabled }).then((r) => r.data)

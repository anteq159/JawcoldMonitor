import api from './client'
import type { ServiceStatus, SystemStats } from '../types/websocket'

export interface DiagnosticEntry {
  timestamp: string
  level: string
  logger: string
  message: string
}

export interface UpdateInfo {
  current_version: string
  latest_version: string | null
  update_available: boolean
  // Updates run on the Raspberry with this command (scripts/jawcold).
  update_command: string
}

export const getSystemStats = (): Promise<SystemStats> => api.get('/system/stats').then((r) => r.data)
export const getRS485Status = () => api.get('/system/rs485').then((r) => r.data)
export const getDashboard = () => api.get('/system/dashboard').then((r) => r.data)
export const getSerialPorts = (): Promise<{ ports: string[] }> => api.get('/system/ports').then((r) => r.data)
export const getServicesStatus = (): Promise<ServiceStatus[]> => api.get('/system/services').then((r) => r.data)
export const getDiagnostics = (limit = 100): Promise<DiagnosticEntry[]> =>
  api.get('/system/diagnostics', { params: { limit } }).then((r) => r.data)

export const getUpdateInfo = (): Promise<UpdateInfo> => api.get('/system/update/info').then((r) => r.data)
export interface RuntimeSetting {
  key: string
  label: string
  category: string
  type: 'int' | 'float' | 'bool' | 'str'
  value: string
  is_set: boolean | null
  restart_required: boolean
  secret: boolean
  hint?: string
}

export const getRuntimeSettings = (): Promise<RuntimeSetting[]> =>
  api.get('/system/settings').then((r) => r.data)
export const updateRuntimeSettings = (
  values: Record<string, string>,
): Promise<{ changed: string[]; restart_required: boolean; compose_apply_required?: boolean }> =>
  api.put('/system/settings', { values }).then((r) => r.data)

export type PowerAction = 'restart-app' | 'reboot' | 'shutdown'
export const powerAction = (action: PowerAction): Promise<{ message: string }> =>
  api.post(`/system/power/${action}`).then((r) => r.data)

export type NotifyChannel = 'email' | 'telegram' | 'sms'
export interface NotificationStatus {
  channels: Record<NotifyChannel, { enabled: boolean; configured: boolean }>
  system_channels: string[]
  sms_sent_today: number
  sms_daily_limit: number
}
export const getNotificationStatus = (): Promise<NotificationStatus> =>
  api.get('/system/notifications/status').then((r) => r.data)
export const testNotification = (channel: NotifyChannel): Promise<{ message: string }> =>
  api.post('/system/notifications/test', null, { params: { channel }, timeout: 30000 }).then((r) => r.data)

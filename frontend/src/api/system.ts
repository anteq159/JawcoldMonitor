import api from './client'
import type { ServiceStatus, SystemStats } from '../types/websocket'

export interface DiagnosticEntry {
  timestamp: string
  level: string
  logger: string
  message: string
}

export interface UpdateMeta {
  from_version: string
  to_version: string
  applied_at: string
  action: 'update' | 'rollback'
}

export interface UpdateInfo {
  current_version: string
  last_update: UpdateMeta | null
  rollback_available: boolean
}

export const getSystemStats = (): Promise<SystemStats> => api.get('/system/stats').then((r) => r.data)
export const getRS485Status = () => api.get('/system/rs485').then((r) => r.data)
export const getDashboard = () => api.get('/system/dashboard').then((r) => r.data)
export const getSerialPorts = (): Promise<{ ports: string[] }> => api.get('/system/ports').then((r) => r.data)
export const getServicesStatus = (): Promise<ServiceStatus[]> => api.get('/system/services').then((r) => r.data)
export const getDiagnostics = (limit = 100): Promise<DiagnosticEntry[]> =>
  api.get('/system/diagnostics', { params: { limit } }).then((r) => r.data)

export const getUpdateInfo = (): Promise<UpdateInfo> => api.get('/system/update/info').then((r) => r.data)
export const uploadUpdate = (file: File): Promise<UpdateMeta & { message: string }> => {
  const form = new FormData()
  form.append('file', file)
  // Longer than the default client timeout - this copies a full app/
  // backup and extracts the new tree before responding, not just a quick
  // API round trip.
  return api.post('/system/update/upload', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 }).then((r) => r.data)
}
export const rollbackUpdate = (): Promise<UpdateMeta & { message: string }> =>
  api.post('/system/update/rollback').then((r) => r.data)

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

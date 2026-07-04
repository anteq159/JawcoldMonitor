import api from './client'
import type { ServiceStatus, SystemStats } from '../types/websocket'

export interface DiagnosticEntry {
  timestamp: string
  level: string
  logger: string
  message: string
}

export interface UpdateCheck {
  current_version: string
  latest_version: string
  up_to_date: boolean
  checked_at: string
  changelog: { version: string; notes: string }[]
}

export const getSystemStats = (): Promise<SystemStats> => api.get('/system/stats').then((r) => r.data)
export const getRS485Status = () => api.get('/system/rs485').then((r) => r.data)
export const getDashboard = () => api.get('/system/dashboard').then((r) => r.data)
export const getSerialPorts = (): Promise<{ ports: string[] }> => api.get('/system/ports').then((r) => r.data)
export const getServicesStatus = (): Promise<ServiceStatus[]> => api.get('/system/services').then((r) => r.data)
export const getDiagnostics = (limit = 100): Promise<DiagnosticEntry[]> =>
  api.get('/system/diagnostics', { params: { limit } }).then((r) => r.data)
export const getUpdateCheck = (): Promise<UpdateCheck> => api.get('/system/update-check').then((r) => r.data)

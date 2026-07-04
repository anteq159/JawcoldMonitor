import api from './client'
import type { AlertRule, AlertEvent } from '../types/alert'

export const getAlertRules = (): Promise<AlertRule[]> => api.get('/alerts/rules').then((r) => r.data)
export const createAlertRule = (data: Partial<AlertRule>) => api.post('/alerts/rules', data).then((r) => r.data)
export const updateAlertRule = (id: number, data: Partial<AlertRule>) => api.put(`/alerts/rules/${id}`, data).then((r) => r.data)
export const deleteAlertRule = (id: number) => api.delete(`/alerts/rules/${id}`)

export interface AlertEventFilters {
  unacknowledged_only?: boolean
  severity?: string
  category?: string
  device_id?: number
  since?: string
  until?: string
}

export const getAlertEvents = (filters: AlertEventFilters | boolean = {}): Promise<AlertEvent[]> => {
  // legacy callers pass a bare boolean for unacknowledged_only
  const params = typeof filters === 'boolean' ? { unacknowledged_only: filters } : filters
  return api.get('/alerts/events', { params }).then((r) => r.data)
}

export const acknowledgeEvent = (id: number) => api.post(`/alerts/events/${id}/acknowledge`).then((r) => r.data)

import api from './client'
import type { AlertRule, AlertEvent } from '../types/alert'

export const getAlertRules = (): Promise<AlertRule[]> => api.get('/alerts/rules').then((r) => r.data)
export const createAlertRule = (data: Partial<AlertRule>) => api.post('/alerts/rules', data).then((r) => r.data)
export const updateAlertRule = (id: number, data: Partial<AlertRule>) => api.put(`/alerts/rules/${id}`, data).then((r) => r.data)
export const deleteAlertRule = (id: number) => api.delete(`/alerts/rules/${id}`)

export const getAlertEvents = (unacknowledged_only = false): Promise<AlertEvent[]> =>
  api.get('/alerts/events', { params: { unacknowledged_only } }).then((r) => r.data)

export const acknowledgeEvent = (id: number) => api.post(`/alerts/events/${id}/acknowledge`).then((r) => r.data)

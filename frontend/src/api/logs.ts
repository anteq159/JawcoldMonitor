import api from './client'

export const getEventLogs = (params?: { event_type?: string; device_id?: number; limit?: number }) =>
  api.get('/logs/events', { params }).then((r) => r.data)

export const getAuditLogs = (limit = 100) => api.get('/logs/audit', { params: { limit } }).then((r) => r.data)

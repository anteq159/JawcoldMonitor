import api from './client'
import type { ServiceStatus } from '../types/websocket'

export const getSystemStats = () => api.get('/system/stats').then((r) => r.data)
export const getRS485Status = () => api.get('/system/rs485').then((r) => r.data)
export const getDashboard = () => api.get('/system/dashboard').then((r) => r.data)
export const getSerialPorts = (): Promise<{ ports: string[] }> => api.get('/system/ports').then((r) => r.data)
export const getServicesStatus = (): Promise<ServiceStatus[]> => api.get('/system/services').then((r) => r.data)

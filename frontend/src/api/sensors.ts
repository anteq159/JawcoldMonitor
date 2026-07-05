import api from './client'
import type { Sensor } from '../types/sensor'

export const getSensors = (): Promise<Sensor[]> => api.get('/sensors/').then((r) => r.data)
export const getSensor = (id: number): Promise<Sensor> => api.get(`/sensors/${id}`).then((r) => r.data)
export const updateSensor = (id: number, data: Partial<Sensor>) => api.put(`/sensors/${id}`, data).then((r) => r.data)

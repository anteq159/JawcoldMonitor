import api from './client'
import type { Device, DeviceCreate } from '../types/device'

export const getDevices = (): Promise<Device[]> => api.get('/devices/').then((r) => r.data)
export const getDevice = (id: number): Promise<Device> => api.get(`/devices/${id}`).then((r) => r.data)
export const createDevice = (data: DeviceCreate): Promise<Device> => api.post('/devices/', data).then((r) => r.data)
export const updateDevice = (id: number, data: Partial<DeviceCreate>) => api.put(`/devices/${id}`, data).then((r) => r.data)
export const deleteDevice = (id: number) => api.delete(`/devices/${id}`)

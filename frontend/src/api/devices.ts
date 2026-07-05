import api from './client'
import type { Device, DeviceCreate } from '../types/device'

export const getDevices = (): Promise<Device[]> => api.get('/devices/').then((r) => r.data)
export const getDevice = (id: number): Promise<Device> => api.get(`/devices/${id}`).then((r) => r.data)
export const createDevice = (data: DeviceCreate): Promise<Device> => api.post('/devices/', data).then((r) => r.data)
export const updateDevice = (id: number, data: Partial<DeviceCreate>) => api.put(`/devices/${id}`, data).then((r) => r.data)
export const deleteDevice = (id: number) => api.delete(`/devices/${id}`)

export interface RegisterWriteResult {
  name: string
  value: number
  unit: string | null
}

export const writeDeviceRegister = (deviceId: number, name: string, value: number): Promise<RegisterWriteResult> =>
  api.post(`/devices/${deviceId}/registers/write`, { name, value }).then((r) => r.data)

export interface ManufacturerLookupResult {
  simulated: boolean
  detected_manufacturer: string | null
  message: string
  suggested_next_step: string
}

export const lookupManufacturer = (deviceId: number): Promise<ManufacturerLookupResult> =>
  api.post(`/devices/${deviceId}/lookup-manufacturer`).then((r) => r.data)

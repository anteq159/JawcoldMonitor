import api from './client'
import type { Device, DeviceCreate } from '../types/device'

export interface DeviceUpdate extends Partial<DeviceCreate> {
  poll_interval_seconds?: number | null
  hidden_parameters?: string[]
  parameter_aliases?: Record<string, string>
}

export const getDevices = (): Promise<Device[]> => api.get('/devices/').then((r) => r.data)
export const getDevice = (id: number): Promise<Device> => api.get(`/devices/${id}`).then((r) => r.data)
export const createDevice = (data: DeviceCreate): Promise<Device> => api.post('/devices/', data).then((r) => r.data)
export const updateDevice = (id: number, data: DeviceUpdate): Promise<Device> => api.put(`/devices/${id}`, data).then((r) => r.data)
export const deleteDevice = (id: number) => api.delete(`/devices/${id}`)

export interface DiscoveredDevice {
  modbus_address: number
  suggested_name: string
  detected_manufacturer: string | null
  matched_profile_id: number | null
  matched_profile_name: string | null
}

export const discoverDevices = (): Promise<DiscoveredDevice[]> => api.get('/devices/discover').then((r) => r.data)

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

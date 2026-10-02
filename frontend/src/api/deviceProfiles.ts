import api from './client'
import type { RegisterCategory } from '../utils/registers'

export interface RegisterDefinition {
  id: number
  position: number
  address: number
  name: string
  unit: string | null
  description: string | null
  data_type: string
  scale_factor: number
  writable: boolean
  is_alarm_register: boolean
  register_type: 'holding' | 'input' | 'coil' | 'discrete_input'
  category: RegisterCategory | null
  bit: number | null
}

export interface RegisterDefinitionInput {
  address: number
  name: string
  unit?: string | null
  description?: string | null
  data_type: string
  scale_factor: number
  writable: boolean
  is_alarm_register?: boolean
  register_type?: 'holding' | 'input' | 'coil' | 'discrete_input'
  category?: RegisterCategory | null
  bit?: number | null
}

export interface DeviceProfileDetail {
  id: number
  name: string
  manufacturer: string | null
  model: string | null
  description: string | null
  source: string
  // Built-in profile edited by a user - kept as-is across restarts until
  // "Przywróć domyślne" (resetDeviceProfile).
  customized: boolean
  registers: RegisterDefinition[]
}

export interface DeviceProfileInput {
  name: string
  manufacturer?: string | null
  model?: string | null
  description?: string | null
  registers: RegisterDefinitionInput[]
}

export const getDeviceProfiles = (): Promise<DeviceProfileDetail[]> => api.get('/device-profiles/').then((r) => r.data)
export const getDeviceProfile = (id: number): Promise<DeviceProfileDetail> => api.get(`/device-profiles/${id}`).then((r) => r.data)
export const createDeviceProfile = (data: DeviceProfileInput): Promise<DeviceProfileDetail> =>
  api.post('/device-profiles/', data).then((r) => r.data)
export const updateDeviceProfile = (id: number, data: Partial<DeviceProfileInput>): Promise<DeviceProfileDetail> =>
  api.put(`/device-profiles/${id}`, data).then((r) => r.data)
export const deleteDeviceProfile = (id: number): Promise<void> => api.delete(`/device-profiles/${id}`)
export const resetDeviceProfile = (id: number): Promise<DeviceProfileDetail> =>
  api.post(`/device-profiles/${id}/reset`).then((r) => r.data)

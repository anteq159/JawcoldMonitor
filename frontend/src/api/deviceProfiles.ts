import api from './client'

export interface RegisterDefinition {
  id: number
  address: number
  name: string
  unit: string | null
  description: string | null
  data_type: string
  scale_factor: number
  writable: boolean
  is_alarm_register: boolean
  register_type: 'holding' | 'input' | 'coil' | 'discrete_input'
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
}

export interface DeviceProfileDetail {
  id: number
  name: string
  manufacturer: string | null
  model: string | null
  description: string | null
  source: string
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

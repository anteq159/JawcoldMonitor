import api from './client'

export interface RegisterDefinition {
  id: number
  address: number
  name: string
  unit: string | null
  description: string | null
  data_type: string
  scale_factor: number
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

export const getDeviceProfiles = (): Promise<DeviceProfileDetail[]> => api.get('/device-profiles/').then((r) => r.data)
export const getDeviceProfile = (id: number): Promise<DeviceProfileDetail> => api.get(`/device-profiles/${id}`).then((r) => r.data)

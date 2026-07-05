export interface DeviceParameter {
  id: number
  name: string
  unit: string | null
  description: string | null
  register_address: number
  register_type: string
  data_type: string
  scale_factor: number
  offset: number
  threshold_min: number | null
  threshold_max: number | null
  enabled: boolean
}

export interface DeviceProfile {
  id: number
  name: string
  manufacturer: string | null
  model: string | null
}

export interface Device {
  id: number
  name: string
  modbus_address: number
  port: string
  baudrate: number
  parity: string
  stopbits: number
  timeout: number
  poll_interval_seconds: number | null
  profile_id: number | null
  status: 'online' | 'offline' | 'unknown'
  recognition_status: 'recognized' | 'unrecognized'
  detected_manufacturer: string | null
  location: string | null
  group_name: string | null
  description: string | null
  first_seen: string | null
  last_seen: string | null
  created_at: string
  profile: DeviceProfile | null
  parameters: DeviceParameter[]
}

export interface DeviceCreate {
  name: string
  modbus_address: number
  port?: string
  baudrate?: number
  parity?: string
  stopbits?: number
  timeout?: number
  profile_id?: number | null
  location?: string
  group_name?: string
  description?: string
}

export interface Sensor {
  id: number
  rom_id: string
  name: string
  sensor_type: string
  location: string | null
  room: string | null
  description: string | null
  status: 'online' | 'offline' | 'unknown'
  calibration_offset: number
  first_seen: string | null
  last_seen: string | null
  created_at: string
}

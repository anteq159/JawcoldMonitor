export type WSEventType =
  | 'device_connected'
  | 'device_disconnected'
  | 'new_reading'
  | 'sensor_reading'
  | 'alert_triggered'
  | 'alert_acknowledged'
  | 'new_device_found'
  | 'system_stats'

export interface WSMessage {
  type: WSEventType
  data: any
}

export interface SystemStats {
  cpu_percent: number
  cpu_temp: number | null
  ram_percent: number
  ram_used_mb: number
  ram_total_mb: number
  disk_percent: number
  disk_used_gb: number
  disk_total_gb: number
  uptime_seconds: number
}

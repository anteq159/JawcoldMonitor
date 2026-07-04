export interface AlertRule {
  id: number
  device_id: number | null
  sensor_id: number | null
  parameter_name: string
  name: string
  condition: string
  threshold_value: number | null
  threshold_min: number | null
  threshold_max: number | null
  severity: 'info' | 'warning' | 'critical'
  enabled: boolean
  notify_channels: string[]
  created_at: string
}

export interface AlertEvent {
  id: number
  rule_id: number
  device_id: number | null
  sensor_id: number | null
  value: number | null
  severity: 'info' | 'warning' | 'critical'
  message: string | null
  timestamp: string
  acknowledged: boolean
  acknowledged_by: number | null
  acknowledged_at: string | null
}

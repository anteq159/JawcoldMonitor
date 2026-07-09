import api from './client'

export interface HardwareAlarmEvent {
  id: number
  device_id: number
  code: number
  name: string
  description: string | null
  severity: string
  active: boolean
  triggered_at: string
  resolved_at: string | null
  acknowledged: boolean
  acknowledged_by: number | null
  acknowledged_at: string | null
}

export const getHardwareAlarms = (activeOnly = false): Promise<HardwareAlarmEvent[]> =>
  api.get('/hardware-alarms/', { params: { active_only: activeOnly } }).then((r) => r.data)

export const acknowledgeHardwareAlarm = (id: number) =>
  api.post(`/hardware-alarms/${id}/acknowledge`).then((r) => r.data)

import api from './client'
import type { ParameterReadings, LatestReading } from '../types/reading'

export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d' | '90d' | '1y'

export const getDeviceReadings = (deviceId: number, range: TimeRange = '1h', params?: string): Promise<ParameterReadings[]> =>
  api.get(`/readings/device/${deviceId}`, { params: { range, params } }).then((r) => r.data)

export const getSensorReadings = (sensorId: number, range: TimeRange = '24h'): Promise<ParameterReadings[]> =>
  api.get(`/readings/sensor/${sensorId}`, { params: { range } }).then((r) => r.data)

export const getLatestDeviceReadings = (deviceId: number): Promise<Record<string, LatestReading>> =>
  api.get(`/readings/latest/device/${deviceId}`).then((r) => r.data)

export interface ChartThreshold {
  key: string
  label: string
  value: number
  kind: 'setpoint' | 'alarm_low' | 'alarm_high'
  unit: string | null
}

// Setpoint and effective alarm limits as horizontal chart lines, computed
// by the backend driver (MPXPRO: AL/AH relative to St unless A1 = 1).
export const getDeviceThresholds = (deviceId: number): Promise<ChartThreshold[]> =>
  api.get(`/readings/thresholds/device/${deviceId}`).then((r) => r.data)

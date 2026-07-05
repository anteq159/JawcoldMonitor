import { useState } from 'react'
import { getDeviceReadings, type TimeRange } from '../api/readings'
import type { Device } from '../types/device'
import type { ParameterReadings } from '../types/reading'

export interface CompSeries {
  deviceId: number
  deviceName: string
  paramName: string
  data: ParameterReadings[]
}

// Shared by the Dashboard comparison widget and the full-page Trendy view -
// both let a user pick several device/parameter pairs and compare them on
// one chart, just at different sizes.
export function useComparisonSeries(initialRange: TimeRange = '1h') {
  const [series, setSeries] = useState<CompSeries[]>([])
  const [range, setRange] = useState<TimeRange>(initialRange)

  const addSeries = async (device: Device, paramName: string) => {
    const data = await getDeviceReadings(device.id, range, paramName)
    const labeled = data.map((r) => ({ ...r, parameter_name: `${device.name} · ${r.parameter_name}` }))
    setSeries((prev) => [...prev, { deviceId: device.id, deviceName: device.name, paramName, data: labeled }])
  }

  const removeSeries = (index: number) => setSeries((prev) => prev.filter((_, i) => i !== index))

  const changeRange = async (newRange: TimeRange) => {
    setRange(newRange)
    const updated = await Promise.all(
      series.map(async (s) => {
        const data = await getDeviceReadings(s.deviceId, newRange, s.paramName)
        const labeled = data.map((r) => ({ ...r, parameter_name: `${s.deviceName} · ${r.parameter_name}` }))
        return { ...s, data: labeled }
      })
    )
    setSeries(updated)
  }

  const merged: ParameterReadings[] = series.flatMap((s) => s.data)

  return { series, range, merged, addSeries, removeSeries, changeRange }
}

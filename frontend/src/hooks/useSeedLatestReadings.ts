import { useEffect } from 'react'
import { useDeviceStore } from '../store/devices'
import { getLatestDeviceReadings } from '../api/readings'

// Fills the live-readings store with the last stored values of a device
// when nothing has arrived over the WebSocket yet - otherwise every view
// stays empty until the next scan cycle (up to the poll interval).
export function useSeedLatestReadings(deviceId: number) {
  const updateLiveReadings = useDeviceStore((s) => s.updateLiveReadings)
  useEffect(() => {
    if (Object.keys(useDeviceStore.getState().liveReadings[deviceId] ?? {}).length) return
    getLatestDeviceReadings(deviceId)
      .then((latest) => {
        if (Object.keys(useDeviceStore.getState().liveReadings[deviceId] ?? {}).length) return
        updateLiveReadings(deviceId, Object.entries(latest).map(([name, r]) => ({
          parameter_name: name, value: r.value, unit: r.unit,
        })))
      })
      .catch(() => {})
  }, [deviceId])
}

import { create } from 'zustand'
import type { Device } from '../types/device'
import type { Sensor } from '../types/sensor'
import type { SystemStats } from '../types/websocket'

export type WsStatus = 'connecting' | 'connected' | 'disconnected'

interface DeviceState {
  devices: Device[]
  sensors: Sensor[]
  liveReadings: Record<number, Record<string, { value: number; unit: string | null; ts: number }>>
  liveSensorTemps: Record<number, { temp: number; ts: number }>
  systemStats: SystemStats | null
  newDeviceCandidate: Device | null
  wsStatus: WsStatus
  favoriteIds: Set<number>
  setFavoriteIds: (ids: Set<number>) => void
  addFavoriteId: (id: number) => void
  removeFavoriteId: (id: number) => void
  setDevices: (devices: Device[]) => void
  setSensors: (sensors: Sensor[]) => void
  updateDeviceStatus: (deviceId: number, status: Device['status']) => void
  addDevice: (device: Device) => void
  updateLiveReadings: (deviceId: number, readings: Array<{ parameter_name: string; value: number; unit: string | null }>) => void
  updateSensorTemp: (sensorId: number, temp: number) => void
  setSystemStats: (stats: SystemStats) => void
  setNewDeviceCandidate: (device: Device | null) => void
  setWsStatus: (status: WsStatus) => void
}

export const useDeviceStore = create<DeviceState>()((set) => ({
  devices: [],
  sensors: [],
  liveReadings: {},
  liveSensorTemps: {},
  systemStats: null,
  newDeviceCandidate: null,
  wsStatus: 'connecting',
  favoriteIds: new Set(),
  setFavoriteIds: (ids) => set({ favoriteIds: ids }),
  addFavoriteId: (id) => set((s) => ({ favoriteIds: new Set(s.favoriteIds).add(id) })),
  removeFavoriteId: (id) =>
    set((s) => {
      const next = new Set(s.favoriteIds)
      next.delete(id)
      return { favoriteIds: next }
    }),
  setDevices: (devices) => set({ devices }),
  setSensors: (sensors) => set({ sensors }),
  updateDeviceStatus: (deviceId, status) =>
    set((s) => ({
      devices: s.devices.map((d) => (d.id === deviceId ? { ...d, status } : d)),
    })),
  addDevice: (device) =>
    set((s) => ({
      devices: s.devices.some((d) => d.id === device.id) ? s.devices : [...s.devices, device],
    })),
  updateLiveReadings: (deviceId, readings) =>
    set((s) => {
      const prev = s.liveReadings[deviceId] || {}
      const updated = { ...prev }
      readings.forEach((r) => {
        updated[r.parameter_name] = { value: r.value, unit: r.unit, ts: Date.now() }
      })
      return { liveReadings: { ...s.liveReadings, [deviceId]: updated } }
    }),
  updateSensorTemp: (sensorId, temp) =>
    set((s) => ({
      liveSensorTemps: { ...s.liveSensorTemps, [sensorId]: { temp, ts: Date.now() } },
    })),
  setSystemStats: (stats) => set({ systemStats: stats }),
  setNewDeviceCandidate: (device) => set({ newDeviceCandidate: device }),
  setWsStatus: (status) => set({ wsStatus: status }),
}))

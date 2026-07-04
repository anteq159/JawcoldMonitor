import { useEffect, useRef, useCallback } from 'react'
import { useDeviceStore } from '../store/devices'
import type { WSMessage } from '../types/websocket'
import toast from 'react-hot-toast'

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retriesRef = useRef(0)
  const store = useDeviceStore()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    store.setWsStatus('connecting')
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      retriesRef.current = 0
      store.setWsStatus('connected')
    }

    ws.onmessage = (e) => {
      try {
        const msg: WSMessage = JSON.parse(e.data)
        handleMessage(msg, store)
      } catch {
        // ignore invalid JSON
      }
    }

    ws.onclose = () => {
      store.setWsStatus('disconnected')
      const delay = Math.min(1000 * 2 ** retriesRef.current, 30000)
      retriesRef.current++
      reconnectTimer.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [store])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])
}

function handleMessage(msg: WSMessage, store: ReturnType<typeof useDeviceStore.getState>) {
  switch (msg.type) {
    case 'device_connected': {
      const d = msg.data
      store.updateDeviceStatus(d.id, 'online')
      break
    }
    case 'device_disconnected': {
      store.updateDeviceStatus(msg.data.device_id, 'offline')
      break
    }
    case 'new_reading': {
      store.updateLiveReadings(msg.data.device_id, msg.data.readings)
      break
    }
    case 'sensor_reading': {
      store.updateSensorTemp(msg.data.sensor_id, msg.data.temperature)
      break
    }
    case 'alert_triggered': {
      const ev = msg.data
      const label = ev.severity === 'critical' ? '🔴' : ev.severity === 'warning' ? '🟡' : '🔵'
      toast.error(`${label} Alert: ${ev.rule_name} — ${ev.value}`, { duration: 8000 })
      break
    }
    case 'new_device_found': {
      store.addDevice(msg.data)
      store.setNewDeviceCandidate(msg.data)
      toast.success(`Wykryto nowe urządzenie: ${msg.data.name}`, { duration: 6000 })
      break
    }
    case 'system_stats': {
      store.setSystemStats(msg.data)
      break
    }
  }
}

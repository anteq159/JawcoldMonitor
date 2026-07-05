import { useEffect, useRef } from 'react'
import { useDeviceStore } from '../store/devices'
import type { WSMessage } from '../types/websocket'
import toast from 'react-hot-toast'
import { notifyIfHidden } from '../utils/notifications'

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retriesRef = useRef(0)

  // Reads store actions via getState() rather than the useDeviceStore()
  // hook - action references are stable for the store's lifetime, but
  // subscribing here would re-render on every unrelated state change
  // (readings, stats ticks...) and tear down/reopen the socket each time.
  useEffect(() => {
    let stopped = false

    const connect = () => {
      if (stopped || wsRef.current?.readyState === WebSocket.OPEN) return

      useDeviceStore.getState().setWsStatus('connecting')
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        retriesRef.current = 0
        useDeviceStore.getState().setWsStatus('connected')
      }

      ws.onmessage = (e) => {
        try {
          const msg: WSMessage = JSON.parse(e.data)
          handleMessage(msg, useDeviceStore.getState())
        } catch {
          // ignore invalid JSON
        }
      }

      ws.onclose = () => {
        if (stopped) return
        useDeviceStore.getState().setWsStatus('disconnected')
        const delay = Math.min(1000 * 2 ** retriesRef.current, 30000)
        retriesRef.current++
        reconnectTimer.current = setTimeout(connect, delay)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [])
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
      const label = ev.severity === 'critical' ? 'Krytyczny' : ev.severity === 'warning' ? 'Ostrzeżenie' : 'Informacja'
      toast.error(`${label}: ${ev.rule_name} — ${ev.value}`, { duration: 8000 })
      notifyIfHidden(`Alarm: ${ev.rule_name}`, {
        body: `${label} — wartość ${ev.value}`,
        tag: `jawcold-alert-${ev.id}`,
      })
      break
    }
    case 'alert_resolved': {
      // Quieter than a new alarm - no toast. Alerts page/widgets pick up the
      // resolved state on their next fetch.
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

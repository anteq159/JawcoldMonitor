import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEventLogs } from '../api/logs'
import { useDeviceStore } from '../store/devices'
import { getDevices } from '../api/devices'
import { EmptyState } from '../components/UI/EmptyState'
import { PageSpinner } from '../components/UI/Spinner'
import { format } from 'date-fns'

import { EVENT_TYPES, TONE } from '../utils/eventTypes'

const PAGE = 100

const GROUPS: Array<{ label: string; types: string[] }> = [
  { label: 'Wszystkie', types: [] },
  { label: 'Alarmy', types: ['device_offline_alarm', 'hardware_alarm_triggered', 'hardware_alarm_resolved', 'device_offline_resolved', 'disk_alarm', 'sensor_offline'] },
  { label: 'Komunikacja', types: ['device_connected', 'device_disconnected', 'device_discovered', 'sensor_discovered', 'sensor_online', 'sensor_offline'] },
  { label: 'Zmiany nastaw', types: ['register_written'] },
  { label: 'System', types: ['settings_changed', 'power_action', 'update_applied', 'update_rolled_back', 'auto_backup', 'auto_backup_failed'] },
]

export default function Logs() {
  const devices = useDeviceStore((s) => s.devices)
  const setDevices = useDeviceStore((s) => s.setDevices)
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState(0)
  // ?urzadzenie=ID: opened from a device's "Historia zdarzeń".
  const [deviceId, setDeviceId] = useState(() => new URLSearchParams(window.location.search).get('urzadzenie') ?? '')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const params = () => ({
    limit: PAGE,
    event_type: GROUPS[group].types.join(',') || undefined,
    device_id: deviceId ? Number(deviceId) : undefined,
  })

  useEffect(() => {
    if (!devices.length) getDevices().then(setDevices).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    getEventLogs(params())
      .then((rows) => { setLogs(rows); setHasMore(rows.length === PAGE) })
      .finally(() => setLoading(false))
  }, [group, deviceId])

  const loadMore = async () => {
    if (!logs.length) return
    setLoadingMore(true)
    try {
      const rows = await getEventLogs({ ...params(), before: logs[logs.length - 1].timestamp })
      setLogs((prev) => [...prev, ...rows])
      setHasMore(rows.length === PAGE)
    } finally {
      setLoadingMore(false)
    }
  }

  const deviceName = (id: number) => devices.find((d) => d.id === id)?.name ?? `Urządzenie #${id}`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map((g, i) => (
          <button key={g.label} onClick={() => setGroup(i)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${group === i ? 'bg-accent border-accent text-white' : 'border-border text-ink-muted hover:text-ink'}`}>
            {g.label}
          </button>
        ))}
        <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="input !w-auto text-sm sm:ml-auto">
          <option value="">Wszystkie urządzenia</option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {loading ? <PageSpinner /> : (
        <div className="bg-surface border border-border rounded-xl shadow-panel divide-y divide-border">
          {logs.length === 0 && <EmptyState message="Brak wpisów dla wybranego filtra" />}
          {logs.map((l) => {
            const meta = EVENT_TYPES[l.event_type]
            return (
              <div key={l.id} className="flex items-start gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-medium ${TONE[meta?.tone ?? 'info']}`}>{meta?.label ?? l.event_type}</span>
                  <p className="text-sm text-ink-body mt-0.5 break-words">{l.message}</p>
                  {l.device_id && (
                    <Link to={`/devices/${l.device_id}`} className="text-xs text-accent hover:underline">{deviceName(l.device_id)}</Link>
                  )}
                </div>
                <p className="text-xs text-ink-muted whitespace-nowrap">{format(new Date(l.timestamp), 'dd.MM HH:mm:ss')}</p>
              </div>
            )
          })}
          {hasMore && (
            <div className="px-5 py-3 text-center">
              <button onClick={loadMore} disabled={loadingMore} className="text-sm text-accent hover:text-accent-strong disabled:opacity-50">
                {loadingMore ? 'Wczytywanie…' : 'Pokaż starsze'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

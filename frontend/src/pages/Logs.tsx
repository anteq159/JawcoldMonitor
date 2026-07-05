import { useEffect, useState } from 'react'
import { getEventLogs } from '../api/logs'
import { EmptyState } from '../components/UI/EmptyState'
import { PageSpinner } from '../components/UI/Spinner'
import { format } from 'date-fns'

export default function Logs() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { getEventLogs({ limit: 200 }).then(setLogs).finally(() => setLoading(false)) }, [])

  const typeColor = (t: string) => {
    if (t.includes('resolved')) return 'text-good'
    if (t.includes('connected') || t.includes('discovered')) return 'text-good'
    if (t.includes('disconnected')) return 'text-crit'
    if (t.includes('hardware_alarm_triggered')) return 'text-crit'
    if (t.includes('alert') || t.includes('alarm')) return 'text-warn'
    return 'text-ink-muted'
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">{logs.length} wpisów</p>
      <div className="bg-surface border border-border rounded-xl shadow-panel divide-y divide-border">
        {logs.length === 0 && <EmptyState message="Brak logów" />}
        {logs.map((l) => (
          <div key={l.id} className="flex items-start gap-4 px-5 py-3">
            <div className="flex-1">
              <span className={`text-xs font-medium ${typeColor(l.event_type)}`}>{l.event_type}</span>
              <p className="text-sm text-ink-body mt-0.5">{l.message}</p>
              {l.device_id && <p className="text-xs text-ink-muted">Urządzenie #{l.device_id}</p>}
            </div>
            <p className="text-xs text-ink-muted whitespace-nowrap">{format(new Date(l.timestamp), 'dd.MM HH:mm:ss')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Card } from '../UI/Card'
import { getEventLogs } from '../../api/logs'
import { EVENT_TYPES, TONE } from '../../utils/eventTypes'

const LIMIT = 10

// What happened to this one controller - alarms, setpoint changes (who,
// old -> new), lost communication - without filtering the global log.
export function DeviceEventsCard({ deviceId }: { deviceId: number }) {
  const [events, setEvents] = useState<any[] | null>(null)

  useEffect(() => {
    const load = () => getEventLogs({ device_id: deviceId, limit: LIMIT }).then(setEvents).catch(() => setEvents([]))
    load()
    const timer = setInterval(load, 30000)
    const onChange = (e: Event) => { if ((e as CustomEvent).detail === deviceId) load() }
    window.addEventListener('jawcold:device-events', onChange)
    return () => { clearInterval(timer); window.removeEventListener('jawcold:device-events', onChange) }
  }, [deviceId])

  return (
    <Card
      title="Historia zdarzeń"
      action={<Link to={`/logs?urzadzenie=${deviceId}`} className="text-xs text-accent hover:text-accent-strong">Wszystkie</Link>}
    >
      {events === null ? (
        <p className="px-5 py-4 text-sm text-ink-muted">Wczytywanie…</p>
      ) : events.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-muted">Brak zdarzeń dla tego sterownika.</p>
      ) : (
        <div className="divide-y divide-border">
          {events.map((e) => {
            const meta = EVENT_TYPES[e.event_type]
            return (
              <div key={e.id} className="flex items-start gap-4 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className={`text-xs font-medium ${TONE[meta?.tone ?? 'info']}`}>{meta?.label ?? e.event_type}</span>
                  <p className="text-sm text-ink-body break-words">{e.message}</p>
                </div>
                <span className="text-xs text-ink-muted whitespace-nowrap">{format(new Date(e.timestamp), 'dd.MM HH:mm')}</span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

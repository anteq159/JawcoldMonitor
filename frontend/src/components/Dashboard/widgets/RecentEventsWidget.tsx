import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import { Card } from '../../UI/Card'
import { getEventLogs } from '../../../api/logs'
import { useDeviceStore } from '../../../store/devices'
import { eventText, EVENT_TYPES, TONE } from '../../../utils/eventTypes'

const LIMIT = 8

// What happened recently on site - alarms, setpoint changes, controllers
// dropping off the bus - without opening Logi. Replaces "Szybkie akcje",
// whose buttons all duplicated links available one click away.
export function RecentEventsWidget() {
  const devices = useDeviceStore((s) => s.devices)
  const [events, setEvents] = useState<any[] | null>(null)

  useEffect(() => {
    const load = () => getEventLogs({ limit: LIMIT }).then(setEvents).catch(() => setEvents([]))
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [])

  const deviceName = (id: number) => devices.find((d) => d.id === id)?.name

  return (
    <Card title="Ostatnie zdarzenia" action={<Link to="/logs" className="text-xs text-accent hover:text-accent-strong">Wszystkie</Link>}>
      {events === null ? (
        <p className="px-5 py-4 text-xs text-ink-muted">Wczytywanie…</p>
      ) : events.length === 0 ? (
        <p className="px-5 py-4 text-xs text-ink-muted">Brak zdarzeń.</p>
      ) : (
        <div className="divide-y divide-border">
          {events.map((e) => {
            const meta = EVENT_TYPES[e.event_type]
            const name = e.device_id ? deviceName(e.device_id) : null
            return (
              <div key={e.id} className="px-5 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-xs font-medium ${TONE[meta?.tone ?? 'info']}`}>{meta?.label ?? e.event_type}</span>
                  <span className="text-[11px] text-ink-muted whitespace-nowrap" title={new Date(e.timestamp).toLocaleString('pl-PL')}>
                    {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true, locale: pl })}
                  </span>
                </div>
                <p className="text-xs text-ink-body line-clamp-2">{name ? eventText(e.message, name) : e.message}</p>
                {name && <p className="text-[11px] text-ink-muted">{name}</p>}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

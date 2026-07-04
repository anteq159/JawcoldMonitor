import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { format } from 'date-fns'
import { getAlertEvents } from '../../../api/alerts'
import { Badge } from '../../UI/Badge'
import { EmptyState } from '../../UI/EmptyState'
import { WidgetCard } from '../WidgetCard'
import type { AlertEvent } from '../../../types/alert'

const sevColor = (s: string) => ({ critical: 'red' as const, warning: 'yellow' as const, info: 'blue' as const }[s] ?? ('gray' as const))

export function AlarmHistoryWidget() {
  const [events, setEvents] = useState<AlertEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAlertEvents().then(setEvents).finally(() => setLoading(false))
  }, [])

  return (
    <WidgetCard
      title="Historia alarmów"
      action={
        <Link to="/alerts" className="text-xs text-accent hover:text-accent-strong shrink-0">
          Wszystkie
        </Link>
      }
    >
      {loading ? null : events.length === 0 ? (
        <EmptyState icon={<Bell size={28} />} message="Brak zdarzeń alarmowych." />
      ) : (
        <div className="divide-y divide-border">
          {events.slice(0, 15).map((ev) => (
            <div key={ev.id} className={`flex items-center justify-between gap-2 px-4 py-2 ${ev.acknowledged ? 'opacity-50' : ''}`}>
              <div className="min-w-0">
                <p className="text-xs text-ink truncate">{ev.message}</p>
                <p className="text-[10px] text-ink-muted">{format(new Date(ev.timestamp), 'dd.MM HH:mm:ss')}</p>
              </div>
              <Badge variant={sevColor(ev.severity)}>{ev.severity}</Badge>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}

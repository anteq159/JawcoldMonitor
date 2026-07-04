import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Upload, Download, CheckCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { getAlertEvents, acknowledgeEvent } from '../../../api/alerts'
import { WidgetCard } from '../WidgetCard'

const LINK_ACTIONS = [
  { label: 'Dodaj urządzenie', icon: Plus, to: '/devices?tab=add' },
  { label: 'Wgraj mapę', icon: Upload, to: '/map?upload=1' },
  { label: 'Eksportuj dane', icon: Download, to: '/settings' },
]

export function QuickActionsWidget() {
  const [acking, setAcking] = useState(false)

  const acknowledgeAll = async () => {
    setAcking(true)
    try {
      const events = await getAlertEvents(true)
      if (events.length === 0) {
        toast('Brak alarmów do potwierdzenia')
        return
      }
      await Promise.all(events.map((e) => acknowledgeEvent(e.id)))
      toast.success(`Potwierdzono ${events.length} alarm(ów)`)
    } catch {
      toast.error('Błąd potwierdzania alarmów')
    } finally {
      setAcking(false)
    }
  }

  return (
    <WidgetCard title="Szybkie akcje">
      <div className="p-3 grid grid-cols-2 gap-2 h-full content-start">
        {LINK_ACTIONS.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="flex flex-col items-center justify-center gap-1.5 text-center bg-surface-2 hover:bg-accent-soft border border-border rounded-lg py-3 px-2 transition-colors"
          >
            <a.icon size={18} className="text-accent" />
            <span className="text-xs text-ink-body">{a.label}</span>
          </Link>
        ))}
        <button
          onClick={acknowledgeAll}
          disabled={acking}
          className="flex flex-col items-center justify-center gap-1.5 text-center bg-surface-2 hover:bg-accent-soft border border-border rounded-lg py-3 px-2 transition-colors disabled:opacity-50"
        >
          <CheckCheck size={18} className="text-accent" />
          <span className="text-xs text-ink-body">{acking ? 'Potwierdzanie…' : 'Potwierdź alarmy'}</span>
        </button>
      </div>
    </WidgetCard>
  )
}

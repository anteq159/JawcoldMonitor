import { useEffect, useState } from 'react'
import { getEventLogs } from '../api/logs'
import { PageSpinner } from '../components/UI/Spinner'
import { format } from 'date-fns'

export default function Logs() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { getEventLogs({ limit: 200 }).then(setLogs).finally(() => setLoading(false)) }, [])

  const typeColor = (t: string) => {
    if (t.includes('connected') || t.includes('discovered')) return 'text-green-400'
    if (t.includes('disconnected')) return 'text-red-400'
    if (t.includes('alert')) return 'text-yellow-400'
    return 'text-gray-400'
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">{logs.length} wpisów</p>
      <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
        {logs.length === 0 && <p className="px-5 py-8 text-center text-gray-500 text-sm">Brak logów</p>}
        {logs.map((l) => (
          <div key={l.id} className="flex items-start gap-4 px-5 py-3">
            <div className="flex-1">
              <span className={`text-xs font-medium ${typeColor(l.event_type)}`}>{l.event_type}</span>
              <p className="text-sm text-gray-300 mt-0.5">{l.message}</p>
              {l.device_id && <p className="text-xs text-gray-600">Urządzenie #{l.device_id}</p>}
            </div>
            <p className="text-xs text-gray-500 whitespace-nowrap">{format(new Date(l.timestamp), 'dd.MM HH:mm:ss')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

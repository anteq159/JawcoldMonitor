import { useState } from 'react'
import { Card } from '../components/UI/Card'
import { Download } from 'lucide-react'

const FORMATS = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
  { value: 'xlsx', label: 'Excel (.xlsx)' },
  { value: 'pdf', label: 'PDF' },
]
const RANGES = ['1h', '6h', '24h', '7d', '30d']

export default function Settings() {
  const [readingsFmt, setReadingsFmt] = useState('csv')
  const [readingsRange, setReadingsRange] = useState('24h')
  const [alertsFmt, setAlertsFmt] = useState('csv')
  const [alertsRange, setAlertsRange] = useState('24h')

  return (
    <div className="space-y-6 max-w-2xl">
      <Card title="Eksport odczytów">
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-ink-muted mb-1.5">Format</label>
              <select value={readingsFmt} onChange={(e) => setReadingsFmt(e.target.value)} className="input">
                {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1.5">Zakres czasowy</label>
              <select value={readingsRange} onChange={(e) => setReadingsRange(e.target.value)} className="input">
                {RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <button
            onClick={() => window.open(`/api/v1/export/readings?format=${readingsFmt}&range=${readingsRange}`)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-strong text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <Download size={14} /> Pobierz {readingsFmt.toUpperCase()}
          </button>
        </div>
      </Card>

      <Card title="Eksport alarmów">
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-ink-muted mb-1.5">Format</label>
              <select value={alertsFmt} onChange={(e) => setAlertsFmt(e.target.value)} className="input">
                {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1.5">Zakres czasowy</label>
              <select value={alertsRange} onChange={(e) => setAlertsRange(e.target.value)} className="input">
                {RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <button
            onClick={() => window.open(`/api/v1/export/alerts?format=${alertsFmt}&range=${alertsRange}`)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-strong text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <Download size={14} /> Pobierz {alertsFmt.toUpperCase()}
          </button>
        </div>
      </Card>

      <Card title="Informacje o systemie">
        <div className="p-5 space-y-2 text-sm text-ink-muted">
          <p>Swagger API: <a href="/api/v1/docs" target="_blank" rel="noreferrer" className="text-accent hover:underline">/api/v1/docs</a></p>
          <p>Wersja: 1.0.0</p>
          <p>Stack: FastAPI + React + PostgreSQL + Redis</p>
        </div>
      </Card>
    </div>
  )
}

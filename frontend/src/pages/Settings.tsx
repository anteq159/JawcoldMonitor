import { useState } from 'react'
import { Card } from '../components/UI/Card'
import { Download } from 'lucide-react'

export default function Settings() {
  const [exportRange, setExportRange] = useState('24h')
  const [exportFmt, setExportFmt] = useState('csv')

  const downloadExport = () => {
    window.open(`/api/v1/export/readings?format=${exportFmt}&range=${exportRange}`)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card title="Eksport danych">
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-ink-muted mb-1.5">Format</label>
              <select value={exportFmt} onChange={(e) => setExportFmt(e.target.value)} className="input">
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1.5">Zakres czasowy</label>
              <select value={exportRange} onChange={(e) => setExportRange(e.target.value)} className="input">
                {['1h', '6h', '24h', '7d', '30d'].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <button onClick={downloadExport}
            className="flex items-center gap-2 bg-accent hover:bg-accent-strong text-white text-sm px-4 py-2 rounded-lg transition-colors">
            <Download size={14} /> Pobierz {exportFmt.toUpperCase()}
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

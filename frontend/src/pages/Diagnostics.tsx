import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { getServicesStatus, getDiagnostics, getSystemStats, type DiagnosticEntry } from '../api/system'
import { Card } from '../components/UI/Card'
import { EmptyState } from '../components/UI/EmptyState'
import { PageSpinner } from '../components/UI/Spinner'
import { format } from 'date-fns'
import type { ServiceStatus, SystemStats } from '../types/websocket'

const levelColor = (level: string) =>
  level === 'ERROR' || level === 'CRITICAL' ? 'text-crit' : level === 'WARNING' ? 'text-warn' : 'text-info'

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}min`
}

export default function Diagnostics() {
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [entries, setEntries] = useState<DiagnosticEntry[]>([])
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = () => {
      Promise.all([getServicesStatus(), getDiagnostics(), getSystemStats()])
        .then(([s, d, st]) => { setServices(s); setEntries(d); setStats(st) })
        .finally(() => setLoading(false))
    }
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-4">
        {services.map((svc) => (
          <div key={svc.name} className="bg-surface border border-border rounded-xl shadow-panel p-4 flex items-center gap-3">
            {svc.status === 'online' ? (
              <CheckCircle2 size={20} className="text-good shrink-0" />
            ) : (
              <XCircle size={20} className="text-crit shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm text-ink font-medium">{svc.name}</p>
              <p className="text-xs text-ink-muted truncate">{svc.status === 'online' ? 'Działa poprawnie' : (svc.detail || 'Brak odpowiedzi')}</p>
            </div>
          </div>
        ))}
      </div>

      {stats && (
        <Card title="Stan systemu">
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-ink-muted">Czas pracy</p>
              <p className="text-ink font-medium">{formatUptime(stats.uptime_seconds)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">CPU</p>
              <p className="text-ink font-medium">{stats.cpu_percent.toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">RAM</p>
              <p className="text-ink font-medium">{stats.ram_percent.toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Dysk</p>
              <p className="text-ink font-medium">{stats.disk_percent.toFixed(0)}%</p>
            </div>
          </div>
        </Card>
      )}

      <Card title="Ostatnie zdarzenia diagnostyczne">
        {entries.length === 0 ? (
          <EmptyState icon={<AlertTriangle size={28} />} message="Brak ostrzeżeń i błędów — system działa czysto." />
        ) : (
          <div className="divide-y divide-border max-h-[28rem] overflow-y-auto">
            {entries.map((e, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-2.5">
                <span className={`text-xs font-mono font-semibold shrink-0 w-16 ${levelColor(e.level)}`}>{e.level}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-body">{e.message}</p>
                  <p className="text-xs text-ink-muted font-mono truncate">{e.logger}</p>
                </div>
                <p className="text-xs text-ink-muted shrink-0">{format(new Date(e.timestamp), 'HH:mm:ss')}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

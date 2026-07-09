import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Bell, CheckCircle, Plus, Trash2, Download } from 'lucide-react'
import { getAlertRules, getAlertEvents, acknowledgeEvent, deleteAlertRule, createAlertRule } from '../api/alerts'
import { getHardwareAlarms, acknowledgeHardwareAlarm, type HardwareAlarmEvent } from '../api/hardwareAlarms'
import { downloadAlerts } from '../api/export'
import { getDevices } from '../api/devices'
import { useDeviceStore } from '../store/devices'
import { useAuthStore } from '../store/auth'
import { Badge } from '../components/UI/Badge'
import { Modal } from '../components/UI/Modal'
import { EmptyState } from '../components/UI/EmptyState'
import { PageSpinner } from '../components/UI/Spinner'
import { format } from 'date-fns'
import type { AlertRule, AlertEvent } from '../types/alert'
import { ALERT_CATEGORIES } from '../types/alert'
import type { Device } from '../types/device'

type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d'
const RANGES: { label: string; value: TimeRange }[] = [
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
]
const RANGE_MS: Record<TimeRange, number> = {
  '1h': 3600_000, '6h': 6 * 3600_000, '24h': 24 * 3600_000, '7d': 7 * 86400_000, '30d': 30 * 86400_000,
}

function formatDuration(start: string, end: string | null): string {
  const startMs = new Date(start).getTime()
  const endMs = end ? new Date(end).getTime() : Date.now()
  const totalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min ${s}s`
  return `${s}s`
}

export default function Alerts() {
  const canManage = useAuthStore((s) => s.can('alert:manage'))
  const canAcknowledge = useAuthStore((s) => s.can('alert:acknowledge'))
  const canExport = useAuthStore((s) => s.can('export:any'))
  const [rules, setRules] = useState<AlertRule[]>([])
  const [events, setEvents] = useState<AlertEvent[]>([])
  const [hwAlarms, setHwAlarms] = useState<HardwareAlarmEvent[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'events' | 'hardware' | 'rules'>('events')
  const [showAdd, setShowAdd] = useState(false)
  const [showExport, setShowExport] = useState(false)

  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterRange, setFilterRange] = useState<TimeRange>('24h')

  const load = async () => {
    const since = new Date(Date.now() - RANGE_MS[filterRange]).toISOString()
    const [r, e, hw, d] = await Promise.all([
      getAlertRules(),
      getAlertEvents({ severity: filterSeverity || undefined, category: filterCategory || undefined, since }),
      getHardwareAlarms(),
      getDevices(),
    ])
    setRules(r); setEvents(e); setHwAlarms(hw); setDevices(d)
  }

  useEffect(() => { load().finally(() => setLoading(false)) }, [])
  useEffect(() => { if (!loading) load() }, [filterSeverity, filterCategory, filterRange])

  const ack = async (id: number) => {
    await acknowledgeEvent(id)
    setEvents(ev => ev.map(e => e.id === id ? { ...e, acknowledged: true } : e))
  }

  const ackHw = async (id: number) => {
    await acknowledgeHardwareAlarm(id)
    setHwAlarms(hw => hw.map(a => a.id === id ? { ...a, acknowledged: true } : a))
  }

  const delRule = async (id: number) => {
    await deleteAlertRule(id)
    setRules(r => r.filter(ru => ru.id !== id))
  }

  const sevColor = (s: string) => ({ critical: 'red' as const, warning: 'yellow' as const, info: 'blue' as const }[s] ?? ('gray' as const))
  const sevIconColor = (s: string) => ({ critical: 'text-crit', warning: 'text-warn', info: 'text-info' }[s] ?? 'text-ink-muted')

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {(['events', 'hardware', 'rules'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === t ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'}`}>
              {t === 'events' ? `Zdarzenia (${events.filter(e => !e.acknowledged).length})`
                : t === 'hardware' ? `Alarmy sterowników (${hwAlarms.filter(a => a.active && !a.acknowledged).length})`
                : `Reguły (${rules.length})`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {tab === 'events' && canExport && (
            <button onClick={() => setShowExport(true)} className="flex items-center gap-2 text-ink-muted hover:text-ink border border-border text-sm px-3 py-2 rounded-lg transition-colors">
              <Download size={14} /> Eksportuj
            </button>
          )}
          {tab === 'rules' && canManage && (
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-accent hover:bg-accent-strong text-white text-sm px-4 py-2 rounded-lg">
              <Plus size={14} /> Dodaj regułę
            </button>
          )}
        </div>
      </div>

      {tab === 'events' && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} className="input !w-auto text-xs py-1.5">
            <option value="">Wszystkie ważności</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="input !w-auto text-xs py-1.5">
            <option value="">Wszystkie kategorie</option>
            {ALERT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex gap-1">
            {RANGES.map(r => (
              <button key={r.value} onClick={() => setFilterRange(r.value)}
                className={`text-xs px-2.5 py-1.5 rounded-md transition-colors ${filterRange === r.value ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink border border-border'}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'events' && (
        <div className="bg-surface border border-border rounded-xl shadow-panel divide-y divide-border">
          {events.length === 0 && <EmptyState message="Brak zdarzeń alertów w wybranym zakresie" />}
          {events.map(ev => (
            <div key={ev.id} className={`flex items-center justify-between gap-3 px-5 py-3 ${ev.acknowledged ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-3 min-w-0">
                <Bell size={14} className={`shrink-0 ${sevIconColor(ev.severity)}`} />
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{ev.message}</p>
                  <p className="text-xs text-ink-muted">
                    {format(new Date(ev.timestamp), 'dd.MM.yyyy HH:mm:ss')}
                    {' · '}
                    {ev.resolved_at ? `trwał ${formatDuration(ev.timestamp, ev.resolved_at)}` : `aktywny od ${formatDuration(ev.timestamp, null)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="gray">{ev.category}</Badge>
                <Badge variant={sevColor(ev.severity)}>{ev.severity}</Badge>
                {!ev.acknowledged && canAcknowledge && (
                  <button onClick={() => ack(ev.id)} className="text-ink-muted hover:text-good transition-colors" title="Potwierdź">
                    <CheckCircle size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'hardware' && (
        <div className="bg-surface border border-border rounded-xl shadow-panel divide-y divide-border">
          {hwAlarms.length === 0 && <EmptyState message="Brak alarmów zgłoszonych przez sterowniki" />}
          {hwAlarms.map(a => (
            <div key={a.id} className={`flex items-center justify-between gap-3 px-5 py-3 ${!a.active || a.acknowledged ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-3 min-w-0">
                <Bell size={14} className={`shrink-0 ${sevIconColor(a.severity)}`} />
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">
                    {devices.find(d => d.id === a.device_id)?.name ?? `Urządzenie #${a.device_id}`}: {a.name}
                    {a.description ? ` — ${a.description}` : ''}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {format(new Date(a.triggered_at), 'dd.MM.yyyy HH:mm:ss')}
                    {' · '}
                    {a.resolved_at ? `trwał ${formatDuration(a.triggered_at, a.resolved_at)}` : a.active ? `aktywny od ${formatDuration(a.triggered_at, null)}` : 'ustąpił'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={sevColor(a.severity)}>{a.severity}</Badge>
                {a.acknowledged ? (
                  <Badge variant="gray">potwierdzone</Badge>
                ) : canAcknowledge && (
                  <button onClick={() => ackHw(a.id)} className="text-ink-muted hover:text-good transition-colors" title="Potwierdź">
                    <CheckCircle size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'rules' && (
        <div className="bg-surface border border-border rounded-xl shadow-panel divide-y divide-border">
          {rules.length === 0 && <EmptyState message="Brak reguł alertów" />}
          {rules.map(r => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm text-ink">{r.name}</p>
                <p className="text-xs text-ink-muted">
                  {r.device_id ? (devices.find(d => d.id === r.device_id)?.name ?? `Urządzenie #${r.device_id}`) : `Czujnik #${r.sensor_id}`}
                  {' · '}{r.parameter_name}
                  {r.threshold_min != null ? ` · min ${r.threshold_min} / max ${r.threshold_max}` : r.threshold_value != null ? ` ${r.condition} ${r.threshold_value}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="gray">{r.category}</Badge>
                <Badge variant={sevColor(r.severity)}>{r.severity}</Badge>
                {canManage && (
                  <button onClick={() => delRule(r.id)} className="text-ink-muted hover:text-crit transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddRuleModal open={showAdd} onClose={() => setShowAdd(false)} devices={devices} onAdded={load} />
      <ExportAlertsModal open={showExport} onClose={() => setShowExport(false)} />
    </div>
  )
}

function ExportAlertsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [fmt, setFmt] = useState('csv')
  const [range, setRange] = useState<TimeRange>('24h')
  const [downloading, setDownloading] = useState(false)

  const download = async () => {
    setDownloading(true)
    try {
      await downloadAlerts(fmt, range)
      onClose()
    } catch {
      toast.error('Błąd pobierania pliku')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Eksportuj historię alarmów">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Format</label>
            <select value={fmt} onChange={e => setFmt(e.target.value)} className="input">
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="pdf">PDF</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Zakres czasowy</label>
            <select value={range} onChange={e => setRange(e.target.value as TimeRange)} className="input">
              {RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>
        <button
          onClick={download}
          disabled={downloading}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-strong disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors"
        >
          <Download size={14} /> {downloading ? 'Pobieranie…' : `Pobierz ${fmt.toUpperCase()}`}
        </button>
      </div>
    </Modal>
  )
}

function AddRuleModal({ open, onClose, devices, onAdded }: {
  open: boolean; onClose: () => void; devices: Device[]; onAdded: () => void
}) {
  const [deviceId, setDeviceId] = useState('')
  const [paramName, setParamName] = useState('')
  const [name, setName] = useState('')
  const [condition, setCondition] = useState('gt')
  const [threshold, setThreshold] = useState('')
  const [severity, setSeverity] = useState('warning')
  const [category, setCategory] = useState('Inne')
  const [notifyChannels, setNotifyChannels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const toggleChannel = (ch: string) =>
    setNotifyChannels((prev) => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch])

  const liveReadings = useDeviceStore((s) => s.liveReadings)
  const selectedDevice = devices.find(d => String(d.id) === deviceId)
  // Live readings (whatever the manufacturer driver reports), not the
  // separate device.parameters list - that's been empty for every
  // auto-discovered device since Stage 1.2, which meant this dropdown was
  // always empty too (silently falling back to a free-text field below).
  const parameters = selectedDevice ? Object.keys(liveReadings[selectedDevice.id] ?? {}) : []

  const handleDeviceChange = (id: string) => {
    setDeviceId(id)
    setParamName('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await createAlertRule({
        device_id: Number(deviceId) || undefined,
        parameter_name: paramName,
        name,
        condition,
        threshold_value: Number(threshold),
        severity: severity as 'info' | 'warning' | 'critical',
        category,
        notify_channels: notifyChannels,
      })
      onAdded(); onClose()
      setDeviceId(''); setParamName(''); setName(''); setThreshold(''); setCategory('Inne'); setNotifyChannels([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Dodaj regułę alertu">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs text-ink-muted mb-1">Urządzenie</label>
          <select value={deviceId} onChange={e => handleDeviceChange(e.target.value)} required
            className="input">
            <option value="">Wybierz urządzenie…</option>
            {devices.map(d => <option key={d.id} value={d.id}>{d.name} (adres {d.modbus_address})</option>)}
          </select>
        </div>

        {deviceId && (
          <div>
            <label className="block text-xs text-ink-muted mb-1">Parametr</label>
            {parameters.length > 0 ? (
              <select value={paramName} onChange={e => setParamName(e.target.value)} required className="input">
                <option value="">Wybierz parametr…</option>
                {parameters.map(name => {
                  const unit = selectedDevice ? liveReadings[selectedDevice.id]?.[name]?.unit : null
                  return <option key={name} value={name}>{name}{unit ? ` (${unit})` : ''}</option>
                })}
              </select>
            ) : (
              <input value={paramName} onChange={e => setParamName(e.target.value)} required
                placeholder="np. Temperature" className="input" />
            )}
          </div>
        )}

        <div>
          <label className="block text-xs text-ink-muted mb-1">Nazwa reguły</label>
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="np. Wysoka temperatura" className="input" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ink-muted mb-1">Warunek</label>
            <select value={condition} onChange={e => setCondition(e.target.value)} className="input">
              <option value="gt">&gt; (powyżej)</option>
              <option value="lt">&lt; (poniżej)</option>
              <option value="eq">= (równy)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">Wartość progowa</label>
            <input type="number" step="any" value={threshold} onChange={e => setThreshold(e.target.value)} required className="input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ink-muted mb-1">Ważność</label>
            <select value={severity} onChange={e => setSeverity(e.target.value)} className="input">
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">Kategoria</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="input">
              {ALERT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-ink-muted mb-1">Powiadomienia (wymaga konfiguracji SMTP/Telegram w .env)</label>
          <div className="flex gap-4">
            {[['email', 'E-mail'], ['telegram', 'Telegram']].map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 text-sm text-ink-body">
                <input
                  type="checkbox"
                  checked={notifyChannels.includes(value)}
                  onChange={() => toggleChannel(value)}
                  className="rounded border-border-strong bg-surface text-accent focus:ring-0"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading || !deviceId || !paramName}
            className="flex-1 bg-accent hover:bg-accent-strong disabled:opacity-40 text-white text-sm py-2 rounded-lg transition-colors">
            {loading ? 'Zapisywanie…' : 'Dodaj regułę'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-border rounded-lg">
            Anuluj
          </button>
        </div>
      </form>
    </Modal>
  )
}

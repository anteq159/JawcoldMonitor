import { useEffect, useState } from 'react'
import { Bell, CheckCircle, Plus, Trash2 } from 'lucide-react'
import { getAlertRules, getAlertEvents, acknowledgeEvent, deleteAlertRule, createAlertRule } from '../api/alerts'
import { getDevices } from '../api/devices'
import { Badge } from '../components/UI/Badge'
import { Modal } from '../components/UI/Modal'
import { EmptyState } from '../components/UI/EmptyState'
import { PageSpinner } from '../components/UI/Spinner'
import { format } from 'date-fns'
import type { AlertRule, AlertEvent } from '../types/alert'
import type { Device } from '../types/device'

export default function Alerts() {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [events, setEvents] = useState<AlertEvent[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'events' | 'rules'>('events')
  const [showAdd, setShowAdd] = useState(false)

  const load = async () => {
    const [r, e, d] = await Promise.all([getAlertRules(), getAlertEvents(), getDevices()])
    setRules(r); setEvents(e); setDevices(d)
  }

  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const ack = async (id: number) => {
    await acknowledgeEvent(id)
    setEvents(ev => ev.map(e => e.id === id ? { ...e, acknowledged: true } : e))
  }

  const delRule = async (id: number) => {
    await deleteAlertRule(id)
    setRules(r => r.filter(ru => ru.id !== id))
  }

  const sevColor = (s: string) => ({ critical: 'red' as const, warning: 'yellow' as const, info: 'blue' as const }[s] ?? 'gray' as const)
  const sevIconColor = (s: string) => ({ critical: 'text-crit', warning: 'text-warn', info: 'text-info' }[s] ?? 'text-ink-muted')

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {(['events', 'rules'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === t ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'}`}>
              {t === 'events' ? `Zdarzenia (${events.filter(e => !e.acknowledged).length})` : `Reguły (${rules.length})`}
            </button>
          ))}
        </div>
        {tab === 'rules' && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-accent hover:bg-accent-strong text-white text-sm px-4 py-2 rounded-lg">
            <Plus size={14} /> Dodaj regułę
          </button>
        )}
      </div>

      {tab === 'events' && (
        <div className="bg-surface border border-border rounded-xl shadow-panel divide-y divide-border">
          {events.length === 0 && <EmptyState message="Brak zdarzeń alertów" />}
          {events.map(ev => (
            <div key={ev.id} className={`flex items-center justify-between px-5 py-3 ${ev.acknowledged ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-3">
                <Bell size={14} className={sevIconColor(ev.severity)} />
                <div>
                  <p className="text-sm text-ink">{ev.message}</p>
                  <p className="text-xs text-ink-muted">{format(new Date(ev.timestamp), 'dd.MM.yyyy HH:mm:ss')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={sevColor(ev.severity)}>{ev.severity}</Badge>
                {!ev.acknowledged && (
                  <button onClick={() => ack(ev.id)} className="text-ink-muted hover:text-good transition-colors" title="Potwierdź">
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
                <Badge variant={sevColor(r.severity)}>{r.severity}</Badge>
                <button onClick={() => delRule(r.id)} className="text-ink-muted hover:text-crit transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddRuleModal open={showAdd} onClose={() => setShowAdd(false)} devices={devices} onAdded={load} />
    </div>
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
  const [loading, setLoading] = useState(false)

  const selectedDevice = devices.find(d => String(d.id) === deviceId)
  const parameters = selectedDevice?.parameters ?? []

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
      })
      onAdded(); onClose()
      setDeviceId(''); setParamName(''); setName(''); setThreshold('')
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
                {parameters.map(p => (
                  <option key={p.id} value={p.name}>{p.name}{p.unit ? ` (${p.unit})` : ''}</option>
                ))}
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

        <div>
          <label className="block text-xs text-ink-muted mb-1">Ważność</label>
          <select value={severity} onChange={e => setSeverity(e.target.value)} className="input">
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
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

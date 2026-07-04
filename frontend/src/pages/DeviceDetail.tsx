import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Pencil, Check, X } from 'lucide-react'
import { getDevice, updateDevice } from '../api/devices'
import { getDeviceReadings } from '../api/readings'
import { getDeviceProfile, type DeviceProfileDetail } from '../api/deviceProfiles'
import type { Device } from '../types/device'
import type { ParameterReadings } from '../types/reading'
import { ParameterGrid } from '../components/Devices/ParameterGrid'
import { TimeSeriesChart } from '../components/Charts/TimeSeriesChart'
import { DeviceStatusBadge } from '../components/Devices/DeviceStatusBadge'
import { FavoriteToggle } from '../components/Devices/FavoriteToggle'
import { ManufacturerBadge } from '../components/Devices/ManufacturerBadge'
import { Card } from '../components/UI/Card'
import { PageSpinner } from '../components/UI/Spinner'
import { useDeviceStore } from '../store/devices'
import toast from 'react-hot-toast'

type Range = '1h' | '6h' | '24h' | '7d' | '30d'
const RANGES: Range[] = ['1h', '6h', '24h', '7d', '30d']

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>()
  const deviceId = Number(id)
  const [device, setDevice] = useState<Device | null>(null)
  const [readings, setReadings] = useState<ParameterReadings[]>([])
  const [profile, setProfile] = useState<DeviceProfileDetail | null>(null)
  const [range, setRange] = useState<Range>('1h')
  const [loading, setLoading] = useState(true)

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)

  const updateDeviceInStore = useDeviceStore(s => s.updateDeviceStatus)

  useEffect(() => {
    getDevice(deviceId).then(d => {
      setDevice(d)
      setNameInput(d.name)
      if (d.profile) getDeviceProfile(d.profile.id).then(setProfile).catch(() => {})
    }).finally(() => setLoading(false))
  }, [deviceId])

  useEffect(() => {
    if (!deviceId) return
    getDeviceReadings(deviceId, range).then(setReadings)
  }, [deviceId, range])

  const startEdit = () => { setNameInput(device?.name ?? ''); setEditingName(true) }
  const cancelEdit = () => setEditingName(false)

  const saveName = async () => {
    if (!device || !nameInput.trim()) return
    setSavingName(true)
    try {
      const updated = await updateDevice(device.id, { name: nameInput.trim() })
      setDevice(updated)
      setEditingName(false)
      toast.success('Nazwa zaktualizowana')
    } catch {
      toast.error('Błąd zapisu nazwy')
    } finally {
      setSavingName(false)
    }
  }

  if (loading) return <PageSpinner />
  if (!device) return <p className="text-ink-muted">Urządzenie nie znalezione</p>

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/devices" className="text-ink-muted hover:text-ink shrink-0">
          <ChevronLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelEdit() }}
                autoFocus
                className="bg-surface-2 border border-accent rounded-lg px-3 py-1.5 text-ink text-lg font-bold focus:outline-none w-64"
              />
              <button onClick={saveName} disabled={savingName} className="text-good hover:text-good/80 transition-colors" title="Zapisz">
                <Check size={18} />
              </button>
              <button onClick={cancelEdit} className="text-ink-muted hover:text-ink transition-colors" title="Anuluj">
                <X size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-ink truncate">{device.name}</h2>
              <button onClick={startEdit} className="text-ink-muted hover:text-accent transition-colors shrink-0" title="Zmień nazwę">
                <Pencil size={14} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-ink-muted">Adres {device.modbus_address} · {device.port} · {device.baudrate} baud</p>
            <ManufacturerBadge profile={device.profile} />
          </div>
        </div>
        <FavoriteToggle deviceId={device.id} />
        <DeviceStatusBadge status={device.status} />
      </div>

      <Card title="Bieżące wartości parametrów">
        <div className="p-5">
          <ParameterGrid deviceId={device.id} />
        </div>
      </Card>

      <Card title="Wykresy historyczne">
        <div className="px-5 pt-3 pb-1 flex gap-2">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${range === r ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink hover:bg-surface-2'}`}>
              {r}
            </button>
          ))}
        </div>
        <div className="px-3 pb-4">
          <TimeSeriesChart data={readings} height={320} />
        </div>
      </Card>

      {device.parameters.length > 0 && (
        <Card title="Parametry urządzenia">
          <div className="divide-y divide-border">
            {device.parameters.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-ink">{p.name}</p>
                  <p className="text-xs text-ink-muted font-mono">Rejestr {p.register_address} · {p.data_type}</p>
                </div>
                <div className="text-right">
                  {p.unit && <span className="text-xs text-ink-muted">{p.unit}</span>}
                  {p.threshold_min != null && (
                    <p className="text-xs text-ink-muted">min {p.threshold_min} / max {p.threshold_max}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {profile && profile.registers.length > 0 && (
        <Card title={`Mapa rejestrów — profil ${profile.name}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-5 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Adres</th>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Nazwa</th>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Jednostka</th>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Typ danych</th>
                  <th className="px-5 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Skala</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {profile.registers.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2 font-mono text-ink-muted">{r.address}</td>
                    <td className="px-3 py-2 text-ink">{r.name}</td>
                    <td className="px-3 py-2 text-ink-muted">{r.unit || '—'}</td>
                    <td className="px-3 py-2 font-mono text-ink-muted">{r.data_type}</td>
                    <td className="px-5 py-2 font-mono text-ink-muted">{r.scale_factor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-xs text-ink-muted border-t border-border">
            Reprezentatywna mapa rejestrów producenta — zweryfikuj z oficjalną dokumentacją modelu przed użyciem z rzeczywistym urządzeniem.
          </p>
        </Card>
      )}
    </div>
  )
}

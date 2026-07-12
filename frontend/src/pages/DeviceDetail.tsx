import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Pencil, Check, X, Timer } from 'lucide-react'
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
import { RegisterControlPanel } from '../components/Devices/RegisterControlPanel'
import { UnrecognizedDeviceBanner } from '../components/Devices/UnrecognizedDeviceBanner'
import { Card } from '../components/UI/Card'
import { PageSpinner } from '../components/UI/Spinner'
import { useDeviceStore } from '../store/devices'
import { useAuthStore } from '../store/auth'
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
  const [editingInterval, setEditingInterval] = useState(false)
  const [intervalInput, setIntervalInput] = useState('')
  const [savingInterval, setSavingInterval] = useState(false)
  const [editingVisibility, setEditingVisibility] = useState(false)

  const updateDeviceInStore = useDeviceStore(s => s.updateDeviceStatus)
  const canWrite = useAuthStore((s) => s.can('device:write'))

  const loadDevice = () => {
    return getDevice(deviceId).then(d => {
      setDevice(d)
      setNameInput(d.name)
      if (d.profile) getDeviceProfile(d.profile.id).then(setProfile).catch(() => {})
      else setProfile(null)
    })
  }

  useEffect(() => {
    loadDevice().finally(() => setLoading(false))
  }, [deviceId])

  useEffect(() => {
    if (!deviceId) return
    getDeviceReadings(deviceId, range).then(setReadings)
  }, [deviceId, range])

  const startEdit = () => { setNameInput(device?.name ?? ''); setEditingName(true) }
  const cancelEdit = () => setEditingName(false)

  const startEditInterval = () => {
    setIntervalInput(device?.poll_interval_seconds != null ? String(device.poll_interval_seconds) : '')
    setEditingInterval(true)
  }
  const cancelEditInterval = () => setEditingInterval(false)

  const saveInterval = async () => {
    if (!device) return
    const parsed = intervalInput.trim() === '' ? null : Number(intervalInput)
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 1)) {
      toast.error('Nieprawidłowy interwał')
      return
    }
    setSavingInterval(true)
    try {
      const updated = await updateDevice(device.id, { poll_interval_seconds: parsed })
      setDevice(updated)
      setEditingInterval(false)
      toast.success('Interwał odpytywania zaktualizowany')
    } catch {
      toast.error('Błąd zapisu interwału')
    } finally {
      setSavingInterval(false)
    }
  }

  const toggleHiddenParameter = async (name: string) => {
    if (!device) return
    const hidden = device.hidden_parameters.includes(name)
      ? device.hidden_parameters.filter((n) => n !== name)
      : [...device.hidden_parameters, name]
    // Optimistic - the toggle is a small display preference, not worth a
    // loading state; revert on failure instead.
    const previous = device
    setDevice({ ...device, hidden_parameters: hidden })
    try {
      await updateDevice(device.id, { hidden_parameters: hidden })
    } catch {
      setDevice(previous)
      toast.error('Błąd zapisu widoczności')
    }
  }

  const renameParameter = async (realName: string, alias: string) => {
    if (!device) return
    const aliases = { ...device.parameter_aliases }
    if (alias) aliases[realName] = alias
    else delete aliases[realName]
    const previous = device
    setDevice({ ...device, parameter_aliases: aliases })
    try {
      await updateDevice(device.id, { parameter_aliases: aliases })
      toast.success(alias ? `Nazwa zmieniona na „${alias}” (tylko to urządzenie)` : 'Przywrócono oryginalną nazwę')
    } catch {
      setDevice(previous)
      toast.error('Błąd zapisu nazwy')
    }
  }

  // Unit override per variable (e.g. MPXPRO S6/S7 as pressure probe: °C→bar).
  // Empty unit = back to the profile's default. The scanner applies it at
  // the source, so history/exports/dashboard follow on the next cycle.
  const setParameterUnit = async (realName: string, unit: string) => {
    if (!device) return
    const units = { ...device.parameter_units }
    if (unit) units[realName] = unit
    else delete units[realName]
    const previous = device
    setDevice({ ...device, parameter_units: units })
    try {
      await updateDevice(device.id, { parameter_units: units })
      toast.success(unit ? `Jednostka zmieniona na „${unit}” (tylko to urządzenie)` : 'Przywrócono jednostkę z profilu')
    } catch {
      setDevice(previous)
      toast.error('Błąd zapisu jednostki')
    }
  }

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
              {canWrite && (
                <button onClick={startEdit} className="text-ink-muted hover:text-accent transition-colors shrink-0" title="Zmień nazwę">
                  <Pencil size={14} />
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-xs text-ink-muted">Adres {device.modbus_address} · {device.port} · {device.baudrate} baud</p>
            <ManufacturerBadge profile={device.profile} />
            {editingInterval ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  value={intervalInput}
                  onChange={(e) => setIntervalInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveInterval(); if (e.key === 'Escape') cancelEditInterval() }}
                  placeholder="domyślny"
                  autoFocus
                  className="w-20 bg-surface-2 border border-accent rounded px-1.5 py-0.5 text-xs text-ink focus:outline-none"
                />
                <span className="text-xs text-ink-muted">s</span>
                <button onClick={saveInterval} disabled={savingInterval} className="text-good hover:text-good/80"><Check size={13} /></button>
                <button onClick={cancelEditInterval} className="text-ink-muted hover:text-ink"><X size={13} /></button>
              </div>
            ) : (
              <button
                onClick={canWrite ? startEditInterval : undefined}
                className={`flex items-center gap-1 text-xs text-ink-muted transition-colors ${canWrite ? 'hover:text-accent' : 'cursor-default'}`}
                title={canWrite ? 'Zmień interwał odpytywania tego urządzenia' : undefined}
              >
                <Timer size={11} />
                {device.poll_interval_seconds != null ? `co ${device.poll_interval_seconds}s` : 'domyślny interwał'}
              </button>
            )}
          </div>
        </div>
        <FavoriteToggle deviceId={device.id} />
        <DeviceStatusBadge status={device.status} />
      </div>

      {device.recognition_status === 'unrecognized' && <UnrecognizedDeviceBanner device={device} onResolved={loadDevice} />}

      <Card title="Bieżące wartości parametrów">
        <div className="p-5">
          <ParameterGrid deviceId={device.id} hiddenNames={device.hidden_parameters} aliases={device.parameter_aliases} />
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
          <TimeSeriesChart
            data={readings
              .filter((r) => !device.hidden_parameters.includes(r.parameter_name))
              .map((r) => ({ ...r, parameter_name: device.parameter_aliases[r.parameter_name] ?? r.parameter_name }))}
            height={320}
          />
        </div>
      </Card>

      {profile && profile.registers.length > 0 && (
        <Card
          title="Zmienne sterownika"
          action={canWrite && (
            <button
              onClick={() => setEditingVisibility((v) => !v)}
              className={`flex items-center gap-1 text-xs transition-colors ${editingVisibility ? 'text-accent' : 'text-ink-muted hover:text-accent'}`}
              title={editingVisibility ? 'Zakończ edycję widoczności' : 'Edytuj widoczność zmiennych'}
            >
              {editingVisibility ? <Check size={15} /> : <Pencil size={15} />}
            </button>
          )}
        >
          <RegisterControlPanel
            deviceId={device.id}
            registers={profile.registers}
            profileName={profile.name}
            hiddenNames={device.hidden_parameters}
            aliases={device.parameter_aliases}
            units={device.parameter_units}
            editingVisibility={editingVisibility}
            onToggleHidden={toggleHiddenParameter}
            onRename={renameParameter}
            onSetUnit={setParameterUnit}
          />
        </Card>
      )}
    </div>
  )
}

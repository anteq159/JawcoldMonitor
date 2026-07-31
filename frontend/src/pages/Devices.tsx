import { memo, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCw, Plus, WifiOff, AlertTriangle, Trash2, Search, Cpu, Pencil, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getDevices, createDevice, updateDevice, deleteDevice, discoverDevices,
  MAX_CARD_PARAMS, type DiscoveredDevice,
} from '../api/devices'
import { ParamPickerPanel } from '../components/Map/ParamPickerPanel'
import { getSerialPorts } from '../api/system'
import { getDeviceProfiles, type DeviceProfileDetail } from '../api/deviceProfiles'
import { useDeviceStore } from '../store/devices'
import { useAuthStore } from '../store/auth'
import { DeviceStatusBadge } from '../components/Devices/DeviceStatusBadge'
import { FavoriteToggle } from '../components/Devices/FavoriteToggle'
import { ManufacturerBadge } from '../components/Devices/ManufacturerBadge'
import { Badge } from '../components/UI/Badge'
import { ConfirmDialog } from '../components/UI/ConfirmDialog'
import { EmptyState } from '../components/UI/EmptyState'
import { PageSpinner } from '../components/UI/Spinner'
import type { Device } from '../types/device'

type Tab = 'list' | 'add'

interface Prefill {
  name: string
  address: number
  profileId: number | null
}

export default function Devices() {
  // Field selectors, not the whole store: this page is mounted while
  // readings stream in, and subscribing to everything re-rendered the
  // entire device grid on every WebSocket message.
  const devices = useDeviceStore((s) => s.devices)
  const setDevices = useDeviceStore((s) => s.setDevices)
  const canWrite = useAuthStore((s) => s.can('device:write'))
  const [loading, setLoading] = useState(devices.length === 0)
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'add' && canWrite ? 'add' : 'list')
  const [prefill, setPrefill] = useState<Prefill | null>(null)
  const [editing, setEditing] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try { setDevices(await getDevices()) } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          <TabBtn active={tab === 'list'} onClick={() => setTab('list')}>
            Lista urządzeń ({devices.length})
          </TabBtn>
          {canWrite && (
            <TabBtn active={tab === 'add'} onClick={() => setTab('add')}>
              <Plus size={13} className="inline mr-1" />
              Dodaj urządzenie
            </TabBtn>
          )}
        </div>
        {tab === 'list' && (
          <div className="flex items-center gap-1">
            {canWrite && (
              <button
                onClick={() => setEditing((v) => !v)}
                className={`p-2 rounded-lg transition-colors ${editing ? 'text-accent bg-surface-2' : 'text-ink-muted hover:text-ink hover:bg-surface-2'}`}
                title={editing ? 'Zakończ wybór wartości na kafelkach' : 'Wybierz wartości pokazywane na kafelkach'}
              >
                {editing ? <Check size={16} /> : <Pencil size={16} />}
              </button>
            )}
            <button onClick={refresh} className="p-2 text-ink-muted hover:text-ink hover:bg-surface-2 rounded-lg transition-colors" title="Odśwież">
              <RefreshCw size={16} />
            </button>
          </div>
        )}
      </div>

      {tab === 'list' && editing && (
        <p className="text-xs text-ink-muted">
          Wybierz do {MAX_CARD_PARAMS} wartości pokazywanych na kafelku każdego sterownika.
          Ustawienie dotyczy tego sterownika i widzą je wszyscy użytkownicy.
        </p>
      )}

      {tab === 'list' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} onDeleted={refresh} editing={editing} />
          ))}
          {devices.length === 0 && (
            <div className="col-span-full bg-surface border border-border rounded-xl shadow-panel">
              <EmptyState
                icon={<WifiOff size={32} />}
                message='Brak urządzeń. Podłącz adapter RS485 lub przejdź do zakładki "Dodaj urządzenie".'
              />
            </div>
          )}
        </div>
      )}

      {tab === 'add' && canWrite && (
        <div className="space-y-4">
          <DiscoveredDevicesSection
            knownAddresses={devices.map((d) => d.modbus_address)}
            onPick={(candidate) => setPrefill({
              name: candidate.suggested_name,
              address: candidate.modbus_address,
              profileId: candidate.matched_profile_id,
            })}
          />
          <AddDeviceForm prefill={prefill} onAdded={() => { refresh(); setTab('list') }} />
        </div>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center px-4 py-1.5 text-sm rounded-md transition-colors ${active ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

const DeviceCard = memo(function DeviceCard(
  { device, onDeleted, editing }: { device: Device; onDeleted: () => void; editing: boolean },
) {
  const liveReadings = useDeviceStore((s) => s.liveReadings[device.id] || {})
  const patchDevice = useDeviceStore((s) => s.patchDevice)
  const canWrite = useAuthStore((s) => s.can('device:write'))
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Bumped on "Anuluj" to remount the picker with the saved selection.
  const [resetKey, setResetKey] = useState(0)

  // What the tile shows: the parameters picked for this device, minus any
  // hidden in its details, labelled with the same aliases used everywhere
  // else. With nothing picked, fall back to the first reading that arrived -
  // the behaviour every install had before this setting existed.
  const shown = device.card_parameters.length > 0
    ? device.card_parameters
        .filter((name) => !device.hidden_parameters.includes(name))
        .map((name) => [name, liveReadings[name]] as const)
        .filter(([, r]) => r)
    : Object.entries(liveReadings)
        .filter(([name]) => !device.hidden_parameters.includes(name))
        .slice(0, 1)

  // Registers the device could report, even if that value has not arrived
  // over the WebSocket yet - otherwise a freshly loaded page offers nothing
  // to pick from.
  const availableParams = Array.from(new Set([
    ...Object.keys(liveReadings),
    ...(device.profile?.registers?.map((r) => r.name) ?? []),
  ])).filter((name) => !device.hidden_parameters.includes(name))

  const saveCardParams = async (selected: string[]) => {
    const previous = device.card_parameters
    patchDevice(device.id, { card_parameters: selected })
    try {
      await updateDevice(device.id, { card_parameters: selected })
      toast.success(selected.length ? 'Zapisano wartości na kafelku' : 'Przywrócono domyślny odczyt')
    } catch (err: any) {
      patchDevice(device.id, { card_parameters: previous })
      toast.error(err.response?.data?.detail ?? 'Błąd zapisu wyboru wartości')
    }
  }

  const remove = async () => {
    setDeleting(true)
    try {
      await deleteDevice(device.id)
      toast.success(`Usunięto „${device.name}”`)
      onDeleted()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Błąd usuwania urządzenia')
    } finally {
      setDeleting(false)
    }
  }

  const body = (
    <>
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <h3 className="font-medium text-ink truncate">{device.name}</h3>
          <p className="text-xs text-ink-muted mt-0.5">Adres {device.modbus_address} · {device.port}</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <ManufacturerBadge profile={device.profile} />
            {device.recognition_status === 'unrecognized' && (
              <Badge variant="yellow"><AlertTriangle size={10} className="inline -mt-0.5 mr-0.5" />nierozpoznany</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <FavoriteToggle deviceId={device.id} />
          <DeviceStatusBadge status={device.status} />
        </div>
      </div>
      {shown.length > 0 ? (
        <div className={`mt-2 ${shown.length > 1 ? 'grid grid-cols-3 gap-2' : ''}`}>
          {shown.map(([name, r]) => (
            <div key={name} className="min-w-0">
              <div className="flex items-baseline gap-1">
                <span className={`font-bold text-accent ${shown.length > 1 ? 'text-base' : 'text-lg'}`}>
                  {r!.value.toFixed(2)}
                </span>
                <span className="text-xs text-ink-muted">{device.parameter_units[name] ?? r!.unit}</span>
              </div>
              <p className="text-xs text-ink-muted mt-0.5 truncate" title={name}>
                {device.parameter_aliases[name] ?? name}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-muted mt-2">Brak odczytów</p>
      )}
    </>
  )

  const cardClass = 'bg-surface border border-border rounded-xl shadow-panel p-5 block'

  if (editing) {
    return (
      <div className={`${cardClass} border-accent/40`}>
        {body}
        <div className="-mx-5 mt-3">
          <ParamPickerPanel
            key={resetKey}
            device={device}
            availableParams={availableParams}
            initialSelected={device.card_parameters}
            labels={device.parameter_aliases}
            title="Wartości na kafelku"
            max={MAX_CARD_PARAMS}
            onConfirm={saveCardParams}
            onCancel={() => setResetKey((k) => k + 1)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="relative group">
      <Link to={`/devices/${device.id}`} className={`${cardClass} hover:border-border-strong transition-colors`}>
        {body}
      </Link>
      {canWrite && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmOpen(true) }}
          disabled={deleting}
          title="Usuń urządzenie"
          className="absolute bottom-4 right-4 p-1 text-ink-muted/0 group-hover:text-ink-muted hover:!text-crit transition-colors disabled:opacity-50"
        >
          <Trash2 size={15} />
        </button>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="Usuń urządzenie"
        message={`Czy na pewno usunąć „${device.name}”? Historia odczytów i reguły alarmowe powiązane z tym urządzeniem również zostaną usunięte.`}
        confirmLabel="Usuń"
        danger
        onConfirm={remove}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  )
})

function AddDeviceForm({ prefill, onAdded }: { prefill: Prefill | null; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState(1)
  const [port, setPort] = useState('')
  const [customPort, setCustomPort] = useState('')
  const [baudrate, setBaudrate] = useState(9600)
  const [profileId, setProfileId] = useState('')
  const [ports, setPorts] = useState<string[]>([])
  const [profiles, setProfiles] = useState<DeviceProfileDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getSerialPorts().then(({ ports: p }) => {
      setPorts(p)
      if (p.length > 0) setPort(p[0])
    }).catch(() => {
      setPorts(['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyAMA0'])
      setPort('/dev/ttyUSB0')
    })
    getDeviceProfiles().then(setProfiles).catch(() => {})
  }, [])

  useEffect(() => {
    if (!prefill) return
    setName(prefill.name)
    setAddress(prefill.address)
    setProfileId(prefill.profileId != null ? String(prefill.profileId) : '')
  }, [prefill])

  const effectivePort = port === '__custom__' ? customPort : port

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await createDevice({
        name, modbus_address: address, port: effectivePort, baudrate,
        profile_id: profileId ? Number(profileId) : null,
      })
      setName(''); setAddress(1); setProfileId('')
      onAdded()
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Błąd dodawania urządzenia')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg">
      <div className="bg-surface border border-border rounded-xl shadow-panel p-6">
        <h3 className="text-base font-semibold text-ink mb-5">Nowe urządzenie RS485</h3>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nazwa urządzenia">
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="np. Sterownik temperatury"
              className="input" />
          </Field>
          <Field label="Konfiguracja (profil sterownika)">
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="input">
              <option value="">Wybierz później (nierozpoznany)</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.manufacturer ? ` — ${p.manufacturer}` : ''}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Adres Modbus (1–247)">
              <input type="number" value={address} onChange={(e) => setAddress(Number(e.target.value))} min={1} max={247} required className="input" />
            </Field>
            <Field label="Baudrate">
              <select value={baudrate} onChange={(e) => setBaudrate(Number(e.target.value))} className="input">
                {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Port szeregowy">
            <select value={port} onChange={(e) => setPort(e.target.value)} className="input">
              {ports.map(p => <option key={p} value={p}>{p}</option>)}
              <option value="__custom__">Inne...</option>
            </select>
            {port === '__custom__' && (
              <input value={customPort} onChange={(e) => setCustomPort(e.target.value)}
                placeholder="/dev/ttyUSB2" required className="input mt-2" />
            )}
          </Field>
          {error && <p className="text-sm text-crit">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-accent hover:bg-accent-strong disabled:opacity-50 text-white text-sm py-2.5 rounded-lg transition-colors">
            {loading ? 'Dodawanie…' : 'Dodaj urządzenie'}
          </button>
        </form>
      </div>
    </div>
  )
}

function DiscoveredDevicesSection({ knownAddresses, onPick }: {
  knownAddresses: number[]; onPick: (candidate: DiscoveredDevice) => void
}) {
  const [candidates, setCandidates] = useState<DiscoveredDevice[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)

  const scan = async () => {
    setScanning(true)
    try {
      setCandidates(await discoverDevices())
      setScanned(true)
    } catch {
      toast.error('Błąd skanowania magistrali')
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => { scan() }, [])

  // knownAddresses changes whenever a device is added/removed elsewhere -
  // a candidate just added should disappear from this list without
  // needing another bus round-trip.
  const visible = candidates.filter((c) => !knownAddresses.includes(c.modbus_address))

  return (
    <div className="max-w-lg bg-surface border border-border rounded-xl shadow-panel p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold text-ink">Nie dodane, rozpoznane urządzenia</h3>
        <button
          onClick={scan}
          disabled={scanning}
          className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink disabled:opacity-50 transition-colors"
          title="Skanuj magistralę ponownie"
        >
          <Search size={13} className={scanning ? 'animate-pulse' : ''} /> {scanning ? 'Skanowanie…' : 'Skanuj ponownie'}
        </button>
      </div>
      <p className="text-xs text-ink-muted mb-4">
        Urządzenia odpowiadające na magistrali RS485, których jeszcze nie ma na liście urządzeń.
      </p>

      {!scanning && scanned && visible.length === 0 && (
        <p className="text-sm text-ink-muted py-2">Brak nowych urządzeń na magistrali.</p>
      )}

      {visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((c) => (
            <li key={c.modbus_address} className="flex items-center justify-between gap-3 bg-surface-2 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 bg-accent-soft rounded-md shrink-0">
                  <Cpu size={14} className="text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{c.suggested_name}</p>
                  <p className="text-xs text-ink-muted">
                    Adres {c.modbus_address}
                    {c.matched_profile_name && <> · {c.matched_profile_name}</>}
                    {c.detected_manufacturer && !c.matched_profile_name && <> · {c.detected_manufacturer} (brak profilu)</>}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onPick(c)}
                className="shrink-0 text-xs bg-accent hover:bg-accent-strong text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Dodaj
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-ink-muted mb-1.5">{label}</label>
      {children}
    </div>
  )
}

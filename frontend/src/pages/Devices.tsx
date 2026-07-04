import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Plus, Wifi, WifiOff } from 'lucide-react'
import { getDevices, createDevice } from '../api/devices'
import { getSerialPorts } from '../api/system'
import { useDeviceStore } from '../store/devices'
import { DeviceStatusBadge } from '../components/Devices/DeviceStatusBadge'
import { Modal } from '../components/UI/Modal'
import { PageSpinner } from '../components/UI/Spinner'
import type { Device } from '../types/device'

type Tab = 'list' | 'add'

export default function Devices() {
  const { devices, setDevices } = useDeviceStore()
  const [loading, setLoading] = useState(devices.length === 0)
  const [tab, setTab] = useState<Tab>('list')

  const refresh = async () => {
    setLoading(true)
    try { setDevices(await getDevices()) } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          <TabBtn active={tab === 'list'} onClick={() => setTab('list')}>
            Lista urządzeń ({devices.length})
          </TabBtn>
          <TabBtn active={tab === 'add'} onClick={() => setTab('add')}>
            <Plus size={13} className="inline mr-1" />
            Dodaj urządzenie
          </TabBtn>
        </div>
        {tab === 'list' && (
          <button onClick={refresh} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" title="Odśwież">
            <RefreshCw size={16} />
          </button>
        )}
      </div>

      {tab === 'list' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((d) => <DeviceCard key={d.id} device={d} />)}
          {devices.length === 0 && (
            <div className="col-span-full bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <WifiOff size={32} className="text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Brak urządzeń. Podłącz adapter RS485 lub przejdź do zakładki "Dodaj urządzenie".</p>
            </div>
          )}
        </div>
      )}

      {tab === 'add' && <AddDeviceForm onAdded={() => { refresh(); setTab('list') }} />}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center px-4 py-1.5 text-sm rounded-md transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
    >
      {children}
    </button>
  )
}

function DeviceCard({ device }: { device: Device }) {
  const liveReadings = useDeviceStore((s) => s.liveReadings[device.id] || {})
  const firstReading = Object.entries(liveReadings)[0]

  return (
    <Link to={`/devices/${device.id}`} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors block">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <h3 className="font-medium text-white truncate">{device.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">Adres {device.modbus_address} · {device.port}</p>
        </div>
        <DeviceStatusBadge status={device.status} />
      </div>
      {firstReading ? (
        <div className="mt-2">
          <span className="text-lg font-bold text-blue-400">{firstReading[1].value.toFixed(2)}</span>
          <span className="text-sm text-gray-400 ml-1">{firstReading[1].unit}</span>
          <p className="text-xs text-gray-500 mt-0.5">{firstReading[0]}</p>
        </div>
      ) : (
        <p className="text-xs text-gray-600 mt-2">Brak odczytów</p>
      )}
    </Link>
  )
}

function AddDeviceForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState(1)
  const [port, setPort] = useState('')
  const [customPort, setCustomPort] = useState('')
  const [baudrate, setBaudrate] = useState(9600)
  const [ports, setPorts] = useState<string[]>([])
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
  }, [])

  const effectivePort = port === '__custom__' ? customPort : port

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await createDevice({ name, modbus_address: address, port: effectivePort, baudrate })
      setName(''); setAddress(1)
      onAdded()
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Błąd dodawania urządzenia')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-base font-semibold text-white mb-5">Nowe urządzenie RS485</h3>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nazwa urządzenia">
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="np. Sterownik temperatury"
              className="input" />
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
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm py-2.5 rounded-lg transition-colors">
            {loading ? 'Dodawanie…' : 'Dodaj urządzenie'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

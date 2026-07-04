import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Pencil, Check, X } from 'lucide-react'
import { getDevice, updateDevice } from '../api/devices'
import { getDeviceReadings } from '../api/readings'
import type { Device } from '../types/device'
import type { ParameterReadings } from '../types/reading'
import { ParameterGrid } from '../components/Devices/ParameterGrid'
import { TimeSeriesChart } from '../components/Charts/TimeSeriesChart'
import { DeviceStatusBadge } from '../components/Devices/DeviceStatusBadge'
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
  const [range, setRange] = useState<Range>('1h')
  const [loading, setLoading] = useState(true)

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)

  const updateDeviceInStore = useDeviceStore(s => s.updateDeviceStatus)

  useEffect(() => {
    getDevice(deviceId).then(d => { setDevice(d); setNameInput(d.name) }).finally(() => setLoading(false))
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
  if (!device) return <p className="text-gray-400">Urządzenie nie znalezione</p>

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/devices" className="text-gray-400 hover:text-white shrink-0">
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
                className="bg-gray-800 border border-blue-500 rounded-lg px-3 py-1.5 text-white text-lg font-bold focus:outline-none w-64"
              />
              <button onClick={saveName} disabled={savingName} className="text-green-400 hover:text-green-300 transition-colors" title="Zapisz">
                <Check size={18} />
              </button>
              <button onClick={cancelEdit} className="text-gray-400 hover:text-white transition-colors" title="Anuluj">
                <X size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white truncate">{device.name}</h2>
              <button onClick={startEdit} className="text-gray-500 hover:text-blue-400 transition-colors shrink-0" title="Zmień nazwę">
                <Pencil size={14} />
              </button>
            </div>
          )}
          <p className="text-xs text-gray-500">Adres {device.modbus_address} · {device.port} · {device.baudrate} baud</p>
        </div>
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
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${range === r ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
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
          <div className="divide-y divide-gray-800">
            {device.parameters.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-white">{p.name}</p>
                  <p className="text-xs text-gray-500">Rejestr {p.register_address} · {p.data_type}</p>
                </div>
                <div className="text-right">
                  {p.unit && <span className="text-xs text-gray-400">{p.unit}</span>}
                  {p.threshold_min != null && (
                    <p className="text-xs text-gray-500">min {p.threshold_min} / max {p.threshold_max}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

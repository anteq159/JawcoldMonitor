import { useEffect, useRef, useState } from 'react'
import { Thermometer, Pencil, Check, X } from 'lucide-react'
import { getSensors, updateSensor } from '../api/sensors'
import { getSensorReadings } from '../api/readings'
import { useDeviceStore } from '../store/devices'
import { DeviceStatusBadge } from '../components/Devices/DeviceStatusBadge'
import { TimeSeriesChart } from '../components/Charts/TimeSeriesChart'
import { PageSpinner } from '../components/UI/Spinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import type { Sensor } from '../types/sensor'
import type { ParameterReadings } from '../types/reading'

export default function Sensors() {
  const { sensors, setSensors, liveSensorTemps } = useDeviceStore()
  const [loading, setLoading] = useState(sensors.length === 0)
  const [selected, setSelected] = useState<Sensor | null>(null)
  const [chart, setChart] = useState<ParameterReadings[]>([])

  useEffect(() => {
    getSensors().then((s) => { setSensors(s); if (!selected && s.length) setSelected(s[0]) }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (selected) getSensorReadings(selected.id, '24h').then(setChart)
  }, [selected])

  const handleRename = async (sensor: Sensor, newName: string) => {
    await updateSensor(sensor.id, { name: newName })
    const updated = sensors.map(s => s.id === sensor.id ? { ...s, name: newName } : s)
    setSensors(updated)
    if (selected?.id === sensor.id) setSelected({ ...selected, name: newName })
    toast.success('Nazwa czujnika zaktualizowana')
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">{sensors.length} czujników Dallas DS18B20</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sensors.map((s) => {
          const live = liveSensorTemps[s.id]
          return (
            <SensorCard
              key={s.id}
              sensor={s}
              live={live}
              selected={selected?.id === s.id}
              onSelect={() => setSelected(s)}
              onRename={(name) => handleRename(s, name)}
            />
          )
        })}
        {!sensors.length && (
          <div className="col-span-full bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-400 text-sm">Brak czujników Dallas. Skan co 30 s...</p>
          </div>
        )}
      </div>

      {selected && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="font-semibold text-white text-sm">{selected.name} — ostatnie 24h</h3>
          </div>
          <div className="p-4">
            <TimeSeriesChart data={chart} height={280} />
          </div>
        </div>
      )}
    </div>
  )
}

function SensorCard({ sensor, live, selected, onSelect, onRename }: {
  sensor: Sensor
  live: { temp: number; ts: number } | undefined
  selected: boolean
  onSelect: () => void
  onRename: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(sensor.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setNameInput(sensor.name)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const confirmEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (nameInput.trim() && nameInput.trim() !== sensor.name) {
      onRename(nameInput.trim())
    }
    setEditing(false)
  }

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditing(false)
  }

  return (
    <button
      onClick={onSelect}
      className={`bg-gray-900 border rounded-xl p-5 text-left transition-colors w-full ${selected ? 'border-blue-500' : 'border-gray-800 hover:border-gray-700'}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Thermometer size={16} className="text-blue-400 shrink-0" />
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input
                  ref={inputRef}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmEdit(e as any); if (e.key === 'Escape') cancelEdit(e as any) }}
                  className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-sm text-white w-full focus:outline-none focus:border-blue-500"
                />
                <button onClick={confirmEdit} className="text-green-400 hover:text-green-300 p-0.5 shrink-0"><Check size={14} /></button>
                <button onClick={cancelEdit} className="text-gray-400 hover:text-white p-0.5 shrink-0"><X size={14} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group/name">
                <p className="text-sm font-medium text-white truncate">{sensor.name}</p>
                <button onClick={startEdit} className="opacity-0 group-hover/name:opacity-100 text-gray-500 hover:text-gray-300 transition-opacity shrink-0">
                  <Pencil size={12} />
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500">{sensor.rom_id}</p>
          </div>
        </div>
        <DeviceStatusBadge status={sensor.status} />
      </div>
      <div>
        <span className="text-2xl font-bold text-blue-400">
          {live ? live.temp.toFixed(1) : '—'}
        </span>
        <span className="text-gray-400 ml-1 text-sm">°C</span>
        {live && <p className="text-xs text-gray-600 mt-1">{format(live.ts, 'HH:mm:ss')}</p>}
      </div>
      {sensor.location && <p className="text-xs text-gray-500 mt-2">{sensor.location}</p>}
    </button>
  )
}

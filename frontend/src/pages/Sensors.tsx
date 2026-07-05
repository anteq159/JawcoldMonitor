import { useEffect, useRef, useState } from 'react'
import { Thermometer, Pencil, Check, X, SlidersHorizontal, Star } from 'lucide-react'
import { getSensors, updateSensor } from '../api/sensors'
import { getSensorReadings } from '../api/readings'
import { useDeviceStore } from '../store/devices'
import { useAuthStore } from '../store/auth'
import { useFavoriteParameters } from '../hooks/useFavoriteParameters'
import { DeviceStatusBadge } from '../components/Devices/DeviceStatusBadge'
import { TimeSeriesChart } from '../components/Charts/TimeSeriesChart'
import { CalibrationModal } from '../components/Devices/CalibrationModal'
import { EmptyState } from '../components/UI/EmptyState'
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
  const [calibrating, setCalibrating] = useState<Sensor | null>(null)
  const { isFavorite, toggleFavorite } = useFavoriteParameters()

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

  const handleCalibrated = (sensor: Sensor, offset: number) => {
    const updated = sensors.map(s => s.id === sensor.id ? { ...s, calibration_offset: offset } : s)
    setSensors(updated)
    if (selected?.id === sensor.id) setSelected({ ...selected, calibration_offset: offset })
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">{sensors.length} czujników Dallas DS18B20</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sensors.map((s) => {
          const live = liveSensorTemps[s.id]
          return (
            <SensorCard
              key={s.id}
              sensor={s}
              live={live}
              selected={selected?.id === s.id}
              favorite={isFavorite('sensor', s.id)}
              onSelect={() => setSelected(s)}
              onRename={(name) => handleRename(s, name)}
              onCalibrate={() => setCalibrating(s)}
              onToggleFavorite={() => toggleFavorite('sensor', s.id)}
            />
          )
        })}
        {!sensors.length && (
          <div className="col-span-full bg-surface border border-border rounded-xl shadow-panel">
            <EmptyState message="Brak czujników Dallas. Skan co 30 s..." />
          </div>
        )}
      </div>

      {selected && (
        <div className="bg-surface border border-border rounded-xl shadow-panel">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-ink text-sm">{selected.name} — ostatnie 24h</h3>
          </div>
          <div className="p-4">
            <TimeSeriesChart data={chart} height={280} />
          </div>
        </div>
      )}

      {calibrating && (
        <CalibrationModal
          sensor={calibrating}
          currentTemp={liveSensorTemps[calibrating.id]?.temp ?? null}
          onClose={() => setCalibrating(null)}
          onSaved={(offset) => handleCalibrated(calibrating, offset)}
        />
      )}
    </div>
  )
}

function SensorCard({ sensor, live, selected, favorite, onSelect, onRename, onCalibrate, onToggleFavorite }: {
  sensor: Sensor
  live: { temp: number; ts: number } | undefined
  selected: boolean
  favorite: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onCalibrate: () => void
  onToggleFavorite: () => void
}) {
  const canWrite = useAuthStore((s) => s.can('device:write'))
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
      className={`bg-surface border rounded-xl shadow-panel p-5 text-left transition-colors w-full ${selected ? 'border-accent' : 'border-border hover:border-border-strong'}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Thermometer size={16} className="text-accent shrink-0" />
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input
                  ref={inputRef}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmEdit(e as any); if (e.key === 'Escape') cancelEdit(e as any) }}
                  className="bg-surface-2 border border-border-strong rounded px-2 py-0.5 text-sm text-ink w-full focus:outline-none focus:border-accent"
                />
                <button onClick={confirmEdit} className="text-good hover:text-good/80 p-0.5 shrink-0"><Check size={14} /></button>
                <button onClick={cancelEdit} className="text-ink-muted hover:text-ink p-0.5 shrink-0"><X size={14} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group/name">
                <p className="text-sm font-medium text-ink truncate">{sensor.name}</p>
                {canWrite && (
                  <button onClick={startEdit} className="opacity-0 group-hover/name:opacity-100 text-ink-muted hover:text-ink-body transition-opacity shrink-0">
                    <Pencil size={12} />
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-ink-muted font-mono">{sensor.rom_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
            className={`transition-colors p-0.5 ${favorite ? 'text-warn hover:text-warn/80' : 'text-ink-muted hover:text-ink'}`}
            title={favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
          >
            <Star size={14} fill={favorite ? 'currentColor' : 'none'} />
          </button>
          {canWrite && (
            <button
              onClick={(e) => { e.stopPropagation(); onCalibrate() }}
              className="text-ink-muted hover:text-accent transition-colors p-0.5"
              title="Kalibracja"
            >
              <SlidersHorizontal size={14} />
            </button>
          )}
          <DeviceStatusBadge status={sensor.status} />
        </div>
      </div>
      <div>
        <span className="text-2xl font-bold text-accent">
          {live ? live.temp.toFixed(1) : '—'}
        </span>
        <span className="text-ink-muted ml-1 text-sm">°C</span>
        {live && <p className="text-xs text-ink-muted mt-1">{format(live.ts, 'HH:mm:ss')}</p>}
      </div>
      {sensor.calibration_offset !== 0 && (
        <p className="text-xs text-accent mt-1">
          Kalibracja: {sensor.calibration_offset > 0 ? '+' : ''}{sensor.calibration_offset.toFixed(1)}°C
        </p>
      )}
      {sensor.location && <p className="text-xs text-ink-muted mt-2">{sensor.location}</p>}
    </button>
  )
}

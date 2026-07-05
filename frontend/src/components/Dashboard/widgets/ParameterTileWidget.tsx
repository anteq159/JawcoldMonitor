import { useEffect, useState } from 'react'
import { Settings2, X } from 'lucide-react'
import { useDeviceStore } from '../../../store/devices'
import { getDeviceReadings, getSensorReadings } from '../../../api/readings'
import { Sparkline } from '../../Charts/Sparkline'
import { WidgetCard } from '../WidgetCard'
import type { ReadingPoint } from '../../../types/reading'

interface TileSource {
  type: 'device' | 'sensor'
  id: number
  paramName?: string
}

function loadSource(storageKey: string): TileSource | null {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

interface Props {
  instanceId: string
  onRemove?: () => void
}

// Compact tile: pick one source (any controller/device or a Dallas sensor)
// and see just that one value + a short trend. Scoped per instanceId so
// multiple copies of this widget can each track a different parameter -
// the full multi-device comparison experience lives on the Trendy page.
export function ParameterTileWidget({ instanceId, onRemove }: Props) {
  const storageKey = `jawcold-dashboard-tile-source::${instanceId}`
  const devices = useDeviceStore((s) => s.devices)
  const sensors = useDeviceStore((s) => s.sensors)
  const liveReadings = useDeviceStore((s) => s.liveReadings)
  const liveSensorTemps = useDeviceStore((s) => s.liveSensorTemps)

  const [source, setSource] = useState<TileSource | null>(() => loadSource(storageKey))
  const [picking, setPicking] = useState(() => loadSource(storageKey) === null)
  const [pickDeviceId, setPickDeviceId] = useState<number | null>(null)
  const [trend, setTrend] = useState<ReadingPoint[]>([])

  const saveSource = (s: TileSource | null) => {
    setSource(s)
    try {
      if (s) localStorage.setItem(storageKey, JSON.stringify(s))
      else localStorage.removeItem(storageKey)
    } catch {}
  }

  useEffect(() => {
    if (!source) { setTrend([]); return }
    const load = () => {
      if (source.type === 'device' && source.paramName) {
        getDeviceReadings(source.id, '1h', source.paramName)
          .then((data) => setTrend(data[0]?.readings ?? []))
          .catch(() => {})
      } else if (source.type === 'sensor') {
        getSensorReadings(source.id, '1h')
          .then((data) => setTrend(data[0]?.readings ?? []))
          .catch(() => {})
      }
    }
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [source?.type, source?.id, source?.paramName])

  const sourceDevice = source?.type === 'device' ? devices.find((d) => d.id === source.id) : undefined
  const sourceSensor = source?.type === 'sensor' ? sensors.find((s) => s.id === source.id) : undefined

  let currentValue: number | undefined
  let currentUnit: string | null | undefined
  if (source?.type === 'device' && source.paramName) {
    const r = liveReadings[source.id]?.[source.paramName]
    currentValue = r?.value
    currentUnit = r?.unit
  } else if (source?.type === 'sensor') {
    currentValue = liveSensorTemps[source.id]?.temp
    currentUnit = '°C'
  }

  const pickedDevice = pickDeviceId !== null ? devices.find((d) => d.id === pickDeviceId) : undefined
  const availableParams = pickedDevice ? Object.keys(liveReadings[pickedDevice.id] ?? {}) : []

  return (
    <WidgetCard
      title="Podgląd parametru"
      action={
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setPicking((p) => !p); setPickDeviceId(null) }}
            className="text-ink-muted hover:text-ink"
            title="Zmień źródło"
          >
            <Settings2 size={14} />
          </button>
          {onRemove && (
            <button onClick={onRemove} className="text-ink-muted hover:text-crit" title="Usuń kafelek">
              <X size={14} />
            </button>
          )}
        </div>
      }
    >
      <div className="p-3 h-full flex flex-col">
        {picking ? (
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
            <div>
              <p className="text-xs text-ink-muted mb-1.5">1. Sterowniki i inne urządzenia:</p>
              <div className="flex flex-wrap gap-1.5">
                {devices.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setPickDeviceId(d.id)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${pickDeviceId === d.id ? 'bg-accent border-accent text-white' : 'border-border text-ink-muted hover:text-ink'}`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
            {pickDeviceId !== null && (
              <div>
                <p className="text-xs text-ink-muted mb-1.5">2. Zmienna:</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableParams.length > 0 ? (
                    availableParams.map((name) => (
                      <button
                        key={name}
                        onClick={() => { saveSource({ type: 'device', id: pickDeviceId, paramName: name }); setPicking(false) }}
                        className="text-xs px-2.5 py-1 rounded-lg border border-border text-ink-body hover:text-ink hover:border-border-strong transition-colors"
                      >
                        {name}
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-ink-muted">Oczekiwanie na pierwsze odczyty tego urządzenia...</p>
                  )}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-ink-muted mb-1.5">Lub czujnik Dallas:</p>
              <div className="flex flex-wrap gap-1.5">
                {sensors.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { saveSource({ type: 'sensor', id: s.id }); setPicking(false) }}
                    className="text-xs px-2.5 py-1 rounded-lg border border-border text-ink-body hover:text-ink hover:border-border-strong transition-colors"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : source ? (
          <>
            <p className="text-xs text-ink-muted truncate mb-1">
              {sourceDevice?.name ?? sourceSensor?.name ?? 'Usunięte źródło'}
              {source.paramName ? ` · ${source.paramName}` : ''}
            </p>
            <p className="text-3xl font-bold text-ink mb-1">
              {currentValue !== undefined ? currentValue.toFixed(1) : '—'}
              {currentUnit && <span className="text-base font-normal text-ink-muted ml-1">{currentUnit}</span>}
            </p>
            <div className="flex-1 min-h-0">
              <Sparkline data={trend} unit={currentUnit} height={90} />
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-ink-muted text-center px-4">
            Kliknij ikonę ustawień, aby wybrać sterownik lub czujnik do podglądu
          </div>
        )}
      </div>
    </WidgetCard>
  )
}

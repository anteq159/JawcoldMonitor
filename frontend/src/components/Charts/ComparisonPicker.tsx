import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { TimeSeriesChart } from './TimeSeriesChart'
import { useDeviceStore } from '../../store/devices'
import type { Device } from '../../types/device'
import type { CompSeries } from '../../hooks/useComparisonSeries'
import type { TimeRange } from '../../api/readings'

interface Props {
  devices: Device[]
  series: CompSeries[]
  range: TimeRange
  ranges: { label: string; value: TimeRange }[]
  onRangeChange: (r: TimeRange) => void
  onAdd: (device: Device, paramName: string) => void
  onRemove: (index: number) => void
  height?: number
}

// Shared by the Dashboard comparison widget and the full-page Trendy view.
export function ComparisonPicker({ devices, series, range, ranges, onRangeChange, onAdd, onRemove, height = 220 }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [pickDevice, setPickDevice] = useState<number | null>(null)
  const liveReadings = useDeviceStore((s) => s.liveReadings)
  const merged = series.flatMap((s) => s.data)

  const handleAdd = (device: Device, paramName: string) => {
    onAdd(device, paramName)
    setShowAdd(false)
    setPickDevice(null)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-2 shrink-0 flex-wrap">
        {series.length > 0 && (
          <div className="flex gap-1">
            {ranges.map((r) => (
              <button
                key={r.value}
                onClick={() => onRangeChange(r.value)}
                className={`text-xs px-2 py-1 rounded-md transition-colors ${range === r.value ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink border border-border'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => { setShowAdd(true); setPickDevice(null) }}
          className="flex items-center gap-1 text-xs bg-accent hover:bg-accent-strong text-white px-2.5 py-1 rounded-lg transition-colors shrink-0 ml-auto"
        >
          <Plus size={12} /> Dodaj serię
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 space-y-2 shrink-0 bg-surface-2 border border-border rounded-lg p-3">
          <div>
            <p className="text-xs text-ink-muted mb-1.5">1. Wybierz urządzenie:</p>
            <div className="flex flex-wrap gap-1.5">
              {devices.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setPickDevice(d.id)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${pickDevice === d.id ? 'bg-accent border-accent text-white' : 'border-border text-ink-muted hover:text-ink'}`}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>
          {pickDevice !== null && (() => {
            const dev = devices.find((d) => d.id === pickDevice)
            if (!dev) return null
            // Available parameters come from live readings (whatever the
            // manufacturer driver actually reports), not device.parameters -
            // that curated list is a separate, usually-empty concept and
            // checking it here meant no parameters ever showed up to pick.
            const paramNames = Object.keys(liveReadings[dev.id] ?? {})
            return paramNames.length > 0 ? (
              <div>
                <p className="text-xs text-ink-muted mb-1.5">2. Wybierz parametr:</p>
                <div className="flex flex-wrap gap-1.5">
                  {paramNames.map((name) => (
                    <button
                      key={name}
                      onClick={() => handleAdd(dev, name)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-border text-ink-body hover:text-ink hover:border-border-strong transition-colors"
                    >
                      {name}{liveReadings[dev.id]?.[name]?.unit ? ` (${liveReadings[dev.id][name].unit})` : ''}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-muted">Oczekiwanie na pierwsze odczyty tego urządzenia...</p>
            )
          })()}
          <button onClick={() => { setShowAdd(false); setPickDevice(null) }} className="text-xs text-ink-muted hover:text-ink">Anuluj</button>
        </div>
      )}

      {series.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5 shrink-0">
          {series.map((s, i) => (
            <span key={i} className="flex items-center gap-1.5 text-xs bg-surface-2 border border-border rounded-full px-2.5 py-0.5">
              <span className="text-ink-body">{s.deviceName} · {s.paramName}</span>
              <button onClick={() => onRemove(i)} className="text-ink-muted hover:text-crit"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0">
        {merged.length > 0 ? (
          <TimeSeriesChart data={merged} height={height} />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-ink-muted text-center px-4">
            Kliknij "Dodaj serię" aby wybrać urządzenie i parametr do porównania
          </div>
        )}
      </div>
    </div>
  )
}

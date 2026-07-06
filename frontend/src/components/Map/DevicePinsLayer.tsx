import { MapPin, X } from 'lucide-react'
import { useDeviceStore } from '../../store/devices'
import type { Device } from '../../types/device'
import type { MapPosition } from '../../api/maps'

export interface PendingPosition extends MapPosition { deviceName: string }

// The live parameter tiles rendered over a map surface - extracted from
// pages/Map.tsx so image maps and drawn schematics share the exact same
// pins (percent-based absolute positioning inside a relative container).
export function DevicePinsLayer({ positions, devices, editMode, onEditParams, onRemove }: {
  positions: PendingPosition[]
  devices: Device[]
  editMode: boolean
  onEditParams?: (pos: PendingPosition) => void
  onRemove?: (deviceId: number) => void
}) {
  const liveReadings = useDeviceStore(s => s.liveReadings)

  return (
    <>
      {positions.map(pos => {
        const device = devices.find(d => d.id === pos.device_id)
        const readings = liveReadings[pos.device_id] ?? {}
        const shown = pos.selected_params.length > 0
          ? pos.selected_params.map(name => [name, readings[name]] as const).filter(([, v]) => v)
          : Object.entries(readings).slice(0, 1)

        return (
          <div key={pos.device_id}
            className="absolute -translate-x-1/2 -translate-y-full pointer-events-auto"
            style={{ left: `${pos.x_percent}%`, top: `${pos.y_percent}%` }}>
            <div className="bg-surface border border-border rounded-lg px-2 py-1 text-xs shadow-lg min-w-max">
              <div className="flex items-center gap-1.5">
                <MapPin size={10} className={device?.status === 'online' ? 'text-good' : 'text-ink-muted'} />
                {editMode && onEditParams ? (
                  <button onClick={(e) => { e.stopPropagation(); onEditParams(pos) }}
                    className="text-ink font-medium hover:text-accent transition-colors" title="Wybierz parametry do wyświetlenia">
                    {pos.deviceName}
                  </button>
                ) : (
                  <span className="text-ink font-medium">{pos.deviceName}</span>
                )}
                {editMode && onRemove && (
                  <button onClick={(e) => { e.stopPropagation(); onRemove(pos.device_id) }}
                    className="text-ink-muted hover:text-crit ml-1">
                    <X size={10} />
                  </button>
                )}
              </div>
              {shown.map(([name, reading]) => (
                <div key={name} className="text-accent font-bold mt-0.5">
                  {reading.value.toFixed(1)} {reading.unit} <span className="text-ink-muted font-normal">{name}</span>
                </div>
              ))}
            </div>
            <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border-strong mx-auto" />
          </div>
        )
      })}
    </>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Map as MapIcon } from 'lucide-react'
import { getMaps, type FloorMap } from '../../../api/maps'
import { useDeviceStore } from '../../../store/devices'
import { EmptyState } from '../../UI/EmptyState'
import { WidgetCard } from '../WidgetCard'

// Read-only preview (image + live device pins, no editing) - deliberately
// separate from Map.tsx's MapEditor so the working editable map page is
// never touched just to share this simpler view.
export function MapWidget() {
  const [maps, setMaps] = useState<FloorMap[]>([])
  const [loading, setLoading] = useState(true)
  const devices = useDeviceStore((s) => s.devices)
  const liveReadings = useDeviceStore((s) => s.liveReadings)

  useEffect(() => {
    getMaps().then(setMaps).finally(() => setLoading(false))
  }, [])

  const map = maps[0]

  return (
    <WidgetCard
      title="Mapa urządzeń"
      action={
        <Link to="/map" className="text-xs text-accent hover:text-accent-strong shrink-0">
          Pełna mapa
        </Link>
      }
    >
      {loading ? null : !map ? (
        <EmptyState icon={<MapIcon size={28} />} message="Brak wgranych map." />
      ) : (
        <div className="relative w-full h-full bg-surface-2">
          <img
            src={`/api/v1/maps/file/${map.filename}`}
            alt={map.name}
            className="w-full h-full object-contain"
            draggable={false}
          />
          {map.positions.map((pos) => {
            const device = devices.find((d) => d.id === pos.device_id)
            const readings = liveReadings[pos.device_id] ?? {}
            const firstReading = Object.entries(readings)[0]
            return (
              <div
                key={pos.device_id}
                className="absolute -translate-x-1/2 -translate-y-full"
                style={{ left: `${pos.x_percent}%`, top: `${pos.y_percent}%` }}
              >
                <div className="bg-surface border border-border rounded-md px-1.5 py-0.5 text-[10px] shadow-lg whitespace-nowrap flex items-center gap-1">
                  <MapPin size={9} className={device?.status === 'online' ? 'text-good' : 'text-ink-muted'} />
                  <span className="text-ink font-medium">{device?.name ?? `#${pos.device_id}`}</span>
                  {firstReading && <span className="text-accent font-semibold">{firstReading[1].value.toFixed(1)}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </WidgetCard>
  )
}

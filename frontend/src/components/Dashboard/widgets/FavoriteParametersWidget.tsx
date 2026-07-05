import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Star, X } from 'lucide-react'
import { useDeviceStore } from '../../../store/devices'
import { useFavoriteParameters, MAX_FAVORITE_PARAMETERS } from '../../../hooks/useFavoriteParameters'
import { EmptyState } from '../../UI/EmptyState'
import { WidgetCard } from '../WidgetCard'

const MIN_H = 4
const MAX_H = 20
const ROW_PX = 60 // rowHeight(44) + vertical margin(16), matching WidgetGrid's grid config

function heightForCount(count: number): number {
  const contentPx = 40 /* header */ + 16 /* padding */ + Math.max(count, 1) * 34
  return Math.min(MAX_H, Math.max(MIN_H, Math.ceil(contentPx / ROW_PX)))
}

interface Props {
  onHeightChange: (h: number) => void
}

// Restored favorites tile, but parameter-level (not whole-device) and sized
// to its content: more favorited variables makes the tile taller, up to a
// cap where it scrolls internally instead of dominating the dashboard.
export function FavoriteParametersWidget({ onHeightChange }: Props) {
  const devices = useDeviceStore((s) => s.devices)
  const sensors = useDeviceStore((s) => s.sensors)
  const liveReadings = useDeviceStore((s) => s.liveReadings)
  const liveSensorTemps = useDeviceStore((s) => s.liveSensorTemps)
  const { favorites, toggleFavorite } = useFavoriteParameters()

  useEffect(() => {
    onHeightChange(heightForCount(favorites.length))
  }, [favorites.length])

  return (
    <WidgetCard title={`Ulubione parametry (${favorites.length}/${MAX_FAVORITE_PARAMETERS})`}>
      {favorites.length === 0 ? (
        <EmptyState
          icon={<Star size={28} />}
          message='Brak ulubionych parametrów. Oznacz zmienną gwiazdką w "Zmiennych sterownika" lub na liście czujników.'
        />
      ) : (
        <div className="divide-y divide-border">
          {favorites.map((f) => {
            const device = f.type === 'device' ? devices.find((d) => d.id === f.sourceId) : undefined
            const sensor = f.type === 'sensor' ? sensors.find((s) => s.id === f.sourceId) : undefined
            const reading = f.type === 'device' && f.paramName ? liveReadings[f.sourceId]?.[f.paramName] : undefined
            const sensorTemp = f.type === 'sensor' ? liveSensorTemps[f.sourceId] : undefined
            const value = f.type === 'device' ? reading?.value : sensorTemp?.temp
            const unit = f.type === 'device' ? reading?.unit : '°C'
            const linkTo = f.type === 'device' ? `/devices/${f.sourceId}` : '/sensors'
            const name = device?.name ?? sensor?.name ?? 'Usunięte źródło'

            return (
              <div key={f.id} className="flex items-center justify-between px-4 py-2 gap-2">
                <Link to={linkTo} className="min-w-0 flex-1 hover:text-accent transition-colors">
                  <p className="text-sm text-ink truncate">{name}{f.paramName ? ` · ${f.paramName}` : ''}</p>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-accent">
                    {value !== undefined ? value.toFixed(1) : '—'} {unit}
                  </span>
                  <button
                    onClick={() => toggleFavorite(f.type, f.sourceId, f.paramName)}
                    className="text-ink-muted hover:text-crit transition-colors"
                    title="Usuń z ulubionych"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </WidgetCard>
  )
}

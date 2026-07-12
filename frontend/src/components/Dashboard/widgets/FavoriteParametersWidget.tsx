import { Link } from 'react-router-dom'
import { Star, X } from 'lucide-react'
import { useDeviceStore } from '../../../store/devices'
import { useFavoriteParameters, MAX_FAVORITE_PARAMETERS } from '../../../hooks/useFavoriteParameters'
import { EmptyState } from '../../UI/EmptyState'
import { Card } from '../../UI/Card'

// Favorites at the parameter level (not whole-device) - a device/sensor
// variable is starred from "Zmienne sterownika" or the sensor list. The
// list itself grows naturally with the card; only caps out with an
// internal scroll once it's already at the 32-item limit.
export function FavoriteParametersWidget() {
  const devices = useDeviceStore((s) => s.devices)
  const sensors = useDeviceStore((s) => s.sensors)
  const liveReadings = useDeviceStore((s) => s.liveReadings)
  const liveSensorTemps = useDeviceStore((s) => s.liveSensorTemps)
  const { favorites, toggleFavorite } = useFavoriteParameters()

  return (
    <Card title={`Ulubione parametry (${favorites.length}/${MAX_FAVORITE_PARAMETERS})`}>
      {favorites.length === 0 ? (
        <EmptyState
          icon={<Star size={28} />}
          message='Brak ulubionych parametrów. Oznacz zmienną gwiazdką w "Zmiennych sterownika" lub na liście czujników.'
        />
      ) : (
        <div className="divide-y divide-border max-h-96 overflow-y-auto">
          {favorites.map((f) => {
            const device = f.type === 'device' ? devices.find((d) => d.id === f.sourceId) : undefined
            const sensor = f.type === 'sensor' ? sensors.find((s) => s.id === f.sourceId) : undefined
            const reading = f.type === 'device' && f.paramName ? liveReadings[f.sourceId]?.[f.paramName] : undefined
            const sensorTemp = f.type === 'sensor' ? liveSensorTemps[f.sourceId] : undefined
            const value = f.type === 'device' ? reading?.value : sensorTemp?.temp
            const unit = f.type === 'device' ? reading?.unit : '°C'
            const linkTo = f.type === 'device' ? `/devices/${f.sourceId}` : '/sensors'
            const name = device?.name ?? sensor?.name ?? 'Usunięte źródło'
            // Per-device display alias - favorites store the real register
            // name, so readings still match; only the label changes.
            const paramLabel = f.paramName
              ? device?.parameter_aliases?.[f.paramName] ?? f.paramName
              : undefined

            return (
              <div key={f.id} className="flex items-center justify-between px-4 py-2 gap-2">
                <Link to={linkTo} className="min-w-0 flex-1 hover:text-accent transition-colors">
                  <p className="text-sm text-ink truncate">{name}{paramLabel ? ` · ${paramLabel}` : ''}</p>
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
    </Card>
  )
}

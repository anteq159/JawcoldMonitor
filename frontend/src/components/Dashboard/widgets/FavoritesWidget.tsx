import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import { useDeviceStore } from '../../../store/devices'
import { DeviceStatusBadge } from '../../Devices/DeviceStatusBadge'
import { EmptyState } from '../../UI/EmptyState'
import { WidgetCard } from '../WidgetCard'

export function FavoritesWidget() {
  const devices = useDeviceStore((s) => s.devices)
  const favoriteIds = useDeviceStore((s) => s.favoriteIds)
  const liveReadings = useDeviceStore((s) => s.liveReadings)

  const favorites = devices.filter((d) => favoriteIds.has(d.id))

  return (
    <WidgetCard title="Ulubione urządzenia">
      {favorites.length === 0 ? (
        <EmptyState icon={<Star size={28} />} message="Brak ulubionych. Oznacz urządzenie gwiazdką na liście Urządzeń." />
      ) : (
        <div className="divide-y divide-border">
          {favorites.map((d) => {
            const readings = liveReadings[d.id] ?? {}
            const firstReading = Object.entries(readings)[0]
            return (
              <Link key={d.id} to={`/devices/${d.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-2 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{d.name}</p>
                  <p className="text-xs text-ink-muted">Adres {d.modbus_address}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {firstReading && (
                    <span className="text-sm font-semibold text-accent">{firstReading[1].value.toFixed(1)} {firstReading[1].unit}</span>
                  )}
                  <DeviceStatusBadge status={d.status} />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </WidgetCard>
  )
}

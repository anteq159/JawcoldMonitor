import { Star } from 'lucide-react'
import { useDeviceStore } from '../../store/devices'
import { addFavorite, removeFavorite } from '../../api/favorites'

interface Props {
  deviceId: number
  className?: string
}

export function FavoriteToggle({ deviceId, className = '' }: Props) {
  const isFavorite = useDeviceStore((s) => s.favoriteIds.has(deviceId))
  const addFavoriteId = useDeviceStore((s) => s.addFavoriteId)
  const removeFavoriteId = useDeviceStore((s) => s.removeFavoriteId)

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isFavorite) {
      removeFavoriteId(deviceId)
      await removeFavorite(deviceId).catch(() => addFavoriteId(deviceId))
    } else {
      addFavoriteId(deviceId)
      await addFavorite(deviceId).catch(() => removeFavoriteId(deviceId))
    }
  }

  return (
    <button
      onClick={toggle}
      className={`transition-colors ${isFavorite ? 'text-warn' : 'text-ink-muted hover:text-warn'} ${className}`}
      title={isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
    >
      <Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
    </button>
  )
}

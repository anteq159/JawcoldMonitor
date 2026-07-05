import toast from 'react-hot-toast'
import { useDeviceStore } from '../store/devices'
import { addFavoriteParameter, removeFavoriteParameter } from '../api/favorites'

export const MAX_FAVORITE_PARAMETERS = 32

export type FavoriteParameter = ReturnType<typeof useDeviceStore.getState>['favoriteParameters'][number]

function makeId(type: 'device' | 'sensor', sourceId: number, paramName?: string): string {
  return `${type}:${sourceId}:${paramName ?? ''}`
}

// Account-persisted (backend favorite_parameters table) since 2026-07-05 -
// previously localStorage only, which meant favorites were tied to one
// browser instead of the account, and were shared across whichever users
// happened to use the same browser. AppLayout fetches these once on
// mount into useDeviceStore, same as device-level favorites.
export function useFavoriteParameters() {
  const favorites = useDeviceStore((s) => s.favoriteParameters)
  const addLocal = useDeviceStore((s) => s.addFavoriteParameter)
  const removeLocal = useDeviceStore((s) => s.removeFavoriteParameter)

  const isFavorite = (type: 'device' | 'sensor', sourceId: number, paramName?: string) =>
    favorites.some((f) => f.id === makeId(type, sourceId, paramName))

  const toggleFavorite = async (type: 'device' | 'sensor', sourceId: number, paramName?: string) => {
    const id = makeId(type, sourceId, paramName)
    const existing = favorites.some((f) => f.id === id)

    if (existing) {
      removeLocal(id)
      try {
        await removeFavoriteParameter(type, sourceId, paramName)
      } catch {
        addLocal({ id, type, sourceId, paramName })
        toast.error('Błąd usuwania ulubionego parametru')
      }
      return
    }

    if (favorites.length >= MAX_FAVORITE_PARAMETERS) {
      toast.error(`Można dodać maksymalnie ${MAX_FAVORITE_PARAMETERS} ulubionych parametrów`)
      return
    }
    addLocal({ id, type, sourceId, paramName })
    try {
      await addFavoriteParameter(type, sourceId, paramName)
    } catch {
      removeLocal(id)
      toast.error('Błąd dodawania ulubionego parametru')
    }
  }

  return { favorites, isFavorite, toggleFavorite }
}

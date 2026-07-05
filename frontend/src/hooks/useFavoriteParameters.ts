import { useState } from 'react'
import toast from 'react-hot-toast'

const STORAGE_KEY = 'jawcold-favorite-parameters'
export const MAX_FAVORITE_PARAMETERS = 32

export interface FavoriteParameter {
  id: string
  type: 'device' | 'sensor'
  sourceId: number
  paramName?: string // present for type 'device'; sensors have a single value
}

function makeId(f: Omit<FavoriteParameter, 'id'>): string {
  return `${f.type}:${f.sourceId}:${f.paramName ?? ''}`
}

function load(): FavoriteParameter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// Personal dashboard preference, same as widget layout/visibility elsewhere
// in this app - not backend-persisted (unlike device-level favorites, which
// are a cross-page concept tied to the account).
export function useFavoriteParameters() {
  const [favorites, setFavoritesState] = useState<FavoriteParameter[]>(load)

  const persist = (next: FavoriteParameter[]) => {
    setFavoritesState(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
  }

  const isFavorite = (type: 'device' | 'sensor', sourceId: number, paramName?: string) =>
    favorites.some((f) => f.id === makeId({ type, sourceId, paramName }))

  const toggleFavorite = (type: 'device' | 'sensor', sourceId: number, paramName?: string) => {
    const id = makeId({ type, sourceId, paramName })
    if (favorites.some((f) => f.id === id)) {
      persist(favorites.filter((f) => f.id !== id))
      return
    }
    if (favorites.length >= MAX_FAVORITE_PARAMETERS) {
      toast.error(`Można dodać maksymalnie ${MAX_FAVORITE_PARAMETERS} ulubionych parametrów`)
      return
    }
    persist([...favorites, { id, type, sourceId, paramName }])
  }

  return { favorites, isFavorite, toggleFavorite }
}

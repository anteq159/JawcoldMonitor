import api from './client'

export const getFavorites = (): Promise<{ device_id: number }[]> =>
  api.get('/favorites/').then((r) => r.data)

export const addFavorite = (deviceId: number) =>
  api.post(`/favorites/${deviceId}`).then((r) => r.data)

export const removeFavorite = (deviceId: number) =>
  api.delete(`/favorites/${deviceId}`)

export interface FavoriteParameterDTO {
  source_type: 'device' | 'sensor'
  source_id: number
  param_name: string | null
}

export const getFavoriteParameters = (): Promise<FavoriteParameterDTO[]> =>
  api.get('/favorites/parameters/').then((r) => r.data)

export const addFavoriteParameter = (source_type: 'device' | 'sensor', source_id: number, param_name?: string): Promise<FavoriteParameterDTO> =>
  api.post('/favorites/parameters/', { source_type, source_id, param_name: param_name ?? null }).then((r) => r.data)

export const removeFavoriteParameter = (source_type: 'device' | 'sensor', source_id: number, param_name?: string) =>
  api.delete('/favorites/parameters/', { params: { source_type, source_id, param_name: param_name ?? undefined } })

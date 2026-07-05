import api from './client'

export const getFavorites = (): Promise<{ device_id: number }[]> =>
  api.get('/favorites/').then((r) => r.data)

export const addFavorite = (deviceId: number) =>
  api.post(`/favorites/${deviceId}`).then((r) => r.data)

export const removeFavorite = (deviceId: number) =>
  api.delete(`/favorites/${deviceId}`)

import api from './client'

export interface MapPosition { device_id: number; x_percent: number; y_percent: number }
export interface MapPositionOut extends MapPosition { id: number }
export interface FloorMap { id: number; name: string; filename: string; width: number | null; height: number | null; positions: MapPositionOut[] }

export const getMaps = (): Promise<FloorMap[]> => api.get('/maps/').then(r => r.data)

export const uploadMap = (name: string, file: File): Promise<FloorMap> => {
  const fd = new FormData()
  fd.append('name', name)
  fd.append('file', file)
  return api.post('/maps/', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
}

export const savePositions = (mapId: number, positions: MapPosition[]): Promise<FloorMap> =>
  api.put(`/maps/${mapId}/positions`, positions).then(r => r.data)

export const deleteMap = (mapId: number) => api.delete(`/maps/${mapId}`)

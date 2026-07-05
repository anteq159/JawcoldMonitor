import api from './client'

export const MAX_MAP_PIN_PARAMS = 3

export interface MapPosition { device_id: number; x_percent: number; y_percent: number; selected_params: string[] }
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

// GET /maps/file/{filename} requires auth (get_current_user) - a plain
// <img src="..."> never carries the app's Authorization header (only the
// axios client's interceptor does that), so it always 401s. Fetch through
// the authenticated client and hand back an object URL to display inline
// instead. Caller is responsible for revoking it when done.
export const getMapFileBlobUrl = (filename: string): Promise<string> =>
  api.get(`/maps/file/${filename}`, { responseType: 'blob' }).then(r => URL.createObjectURL(r.data))

import api from './client'

export interface VisibilityEntry { device_id: number; parameter_name: string; visible: boolean }

export const getUserVisibility = (userId: number): Promise<VisibilityEntry[]> =>
  api.get(`/users/${userId}/visibility/`).then(r => r.data)

export const setUserVisibility = (userId: number, entries: VisibilityEntry[]) =>
  api.put(`/users/${userId}/visibility/`, entries)

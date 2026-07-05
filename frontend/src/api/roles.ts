import api from './client'
import type { Role, Permission } from '../types/user'

export const getRoles = (): Promise<Role[]> => api.get('/roles/').then((r) => r.data)
export const getPermissions = (): Promise<Permission[]> => api.get('/roles/permissions').then((r) => r.data)
export const createRole = (data: { name: string; description?: string; permission_ids?: number[] }) =>
  api.post('/roles/', data).then((r) => r.data)
export const updateRole = (id: number, data: Partial<{ description: string; permission_ids: number[] }>) =>
  api.put(`/roles/${id}`, data).then((r) => r.data)

import api from './client'
import type { User } from '../types/user'

export const getUsers = (): Promise<User[]> => api.get('/users/').then((r) => r.data)
export const createUser = (data: { username: string; password: string; email?: string; role_ids?: number[] }) =>
  api.post('/users/', data).then((r) => r.data)
export const updateUser = (id: number, data: Partial<{ email: string; is_active: boolean; role_ids: number[]; must_change_password: boolean }>) =>
  api.put(`/users/${id}`, data).then((r) => r.data)
export const deleteUser = (id: number) => api.delete(`/users/${id}`)

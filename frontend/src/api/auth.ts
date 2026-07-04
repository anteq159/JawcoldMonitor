import api from './client'

export const login = (username: string, password: string) =>
  api.post('/auth/login', { username, password }).then((r) => r.data)

export const refreshToken = (refresh_token: string) =>
  api.post('/auth/refresh', { refresh_token }).then((r) => r.data)

export const changePassword = (current_password: string, new_password: string) =>
  api.post('/auth/change-password', { current_password, new_password }).then((r) => r.data)

export const getMe = () => api.get('/auth/me').then((r) => r.data)

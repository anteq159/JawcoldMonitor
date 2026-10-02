import axios from 'axios'
import { useAuthStore } from '../store/auth'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// FastAPI validation errors (422) carry `detail` as a list of objects;
// every page shows err.response.data.detail in a toast, which then read
// "[object Object]". Flatten it into one readable Polish sentence here.
const FIELD_LABELS: Record<string, string> = {
  username: 'nazwa użytkownika', password: 'hasło', new_password: 'hasło', email: 'e-mail',
  name: 'nazwa', modbus_address: 'adres Modbus', threshold_value: 'próg', delay_seconds: 'opóźnienie',
}
function readableDetail(detail: unknown): unknown {
  if (!Array.isArray(detail)) return detail
  return detail.map((d: any) => {
    const field = Array.isArray(d?.loc) ? String(d.loc[d.loc.length - 1]) : ''
    const label = FIELD_LABELS[field] ?? field
    if (d?.type === 'string_too_short') return `${label}: za krótkie (min. ${d.ctx?.min_length} znaków)`
    if (d?.type === 'missing') return `${label}: pole wymagane`
    if (d?.type?.startsWith('greater_than') || d?.type?.startsWith('less_than')) return `${label}: wartość poza zakresem`
    return label ? `${label}: nieprawidłowa wartość` : 'Nieprawidłowe dane'
  }).join('; ')
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.data?.detail) {
      error.response.data.detail = readableDetail(error.response.data.detail)
    }
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = useAuthStore.getState().refreshToken
      if (refreshToken) {
        try {
          const { data } = await axios.post('/api/v1/auth/refresh', { refresh_token: refreshToken })
          useAuthStore.getState().setTokens(data.access_token, data.refresh_token)
          original.headers.Authorization = `Bearer ${data.access_token}`
          return api(original)
        } catch {
          useAuthStore.getState().logout()
          window.location.href = '/login'
        }
      } else {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api

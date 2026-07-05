import { useAuthStore } from '../store/auth'
import { useNavigate } from 'react-router-dom'
import { login as apiLogin, changePassword as apiChangePassword, getMe } from '../api/auth'
import toast from 'react-hot-toast'

export function useAuth() {
  const store = useAuthStore()
  const navigate = useNavigate()

  const login = async (username: string, password: string) => {
    const data = await apiLogin(username, password)
    store.setTokens(data.access_token, data.refresh_token)
    const user = await getMe()
    store.setAuth(user, data.access_token, data.refresh_token)
    if (data.must_change_password) {
      navigate('/change-password')
    } else {
      navigate('/')
    }
    return data
  }

  const logout = () => {
    store.logout()
    navigate('/login')
  }

  const changePassword = async (current: string, next: string) => {
    await apiChangePassword(current, next)
    if (store.user) {
      store.setUser({ ...store.user, must_change_password: false })
    }
    toast.success('Hasło zmienione')
    navigate('/')
  }

  return { user: store.user, isAdmin: store.isAdmin(), login, logout, changePassword }
}

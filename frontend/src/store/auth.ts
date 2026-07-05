import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types/user'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  setAuth: (user: User, access: string, refresh: string) => void
  setTokens: (access: string, refresh: string) => void
  setUser: (user: User) => void
  logout: () => void
  isAdmin: () => boolean
  can: (permission: string) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, access, refresh) => set({ user, accessToken: access, refreshToken: refresh }),
      setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),
      setUser: (user) => set({ user }),
      logout: () => set({ user: null, accessToken: null, refreshToken: null }),
      isAdmin: () => get().user?.roles.some((r) => r.name === 'Admin') ?? false,
      // UI-side mirror of the backend's require_permission: hides actions
      // the API would reject anyway. Admin passes everything, same as the
      // backend's has_role("Admin") shortcut. The backend remains the
      // security boundary - this is UX.
      can: (permission) => {
        const user = get().user
        if (!user) return false
        if (user.roles.some((r) => r.name === 'Admin')) return true
        return user.roles.some((r) => r.permissions?.some((p) => p.name === permission) ?? false)
      },
    }),
    { name: 'jawcold-auth' }
  )
)

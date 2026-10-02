export interface Permission {
  id: number
  name: string
  description: string | null
}

export interface Role {
  id: number
  name: string
  description: string | null
  is_custom: boolean
  permissions?: Permission[]
  // Roles page only: number of accounts with this role.
  user_count?: number | null
}

export interface User {
  id: number
  username: string
  email: string | null
  is_active: boolean
  must_change_password: boolean
  created_at: string
  last_login: string | null
  roles: Role[]
}

import { api } from './client'

export type Role = 'admin' | 'staff' | 'club' | 'viewer'

export interface SessionUser {
  id: number
  role: Role
  username: string
  name: string
  /** 社團名稱(role=club);社/會結尾,身份顯示詞由此推導 */
  club?: string
  clubId?: number
  isSuper: boolean
  permissions: string[]
  canViewEval: boolean
  mustChangePassword: boolean
}

interface UserOut {
  id: number
  role: Role
  username: string
  name: string
  email: string | null
  club_id: number | null
  club_name: string | null
  is_super: boolean
  permissions: string[]
  can_view_eval: boolean
  must_change_password: boolean
}

const toUser = (u: UserOut): SessionUser => ({
  id: u.id,
  role: u.role,
  username: u.username,
  name: u.name,
  club: u.club_name ?? undefined,
  clubId: u.club_id ?? undefined,
  isSuper: u.is_super,
  permissions: u.permissions,
  canViewEval: u.can_view_eval,
  mustChangePassword: u.must_change_password,
})

export const loginApi = (username: string, password: string): Promise<SessionUser> =>
  api<UserOut>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }).then(toUser)

export const meApi = (): Promise<SessionUser> => api<UserOut>('/auth/me').then(toUser)

export const logoutApi = (): Promise<null> => api<null>('/auth/logout', { method: 'POST' })

export const changePasswordApi = (oldPassword: string, newPassword: string): Promise<null> =>
  api<null>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  })

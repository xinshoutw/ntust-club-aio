import { api } from './client'

export type Role = 'admin' | 'staff' | 'club' | 'viewer'

export interface SessionUser {
  id: number
  role: Role
  username: string
  name: string
  /** 社團名稱(role=club) */
  club?: string
  /** 社團/學會(role=club);負責人顯示詞(社長/會長)由此推導 */
  clubKind?: string
  clubId?: number
  isSuper: boolean
  permissions: string[]
  canViewEval: boolean
  mustChangePassword: boolean
  /** 行政端頁面權限目錄(後端 core/permissions.ADMIN_PAGES);非 admin 為 undefined。
   *  側欄過濾、路由守衛與權限彈窗全部讀這一份,前端不得自行維護第二份鍵表 */
  adminPages?: AdminPage[]
  /** 節次目錄(後端 services/booking_service.PERIOD_TIMES);借用畫面的節次軸與
   *  起訖時刻全部讀這一份,前端不得自行維護第二份 */
  periods: Period[]
}

export interface Period {
  key: string
  /** HH:MM */
  start: string
  end: string
}

export interface AdminPage {
  key: string
  label: string
  /** 路由前綴;第一個為主要入口(報名管理有兩頁共用一把鍵) */
  paths: string[]
  /** 本頁另外開給哪些非頁面鍵(簽核關卡帳號要進得了審核頁) */
  also: string[]
}

interface UserOut {
  id: number
  role: Role
  username: string
  name: string
  email: string | null
  club_id: number | null
  club_name: string | null
  club_kind: string | null
  is_super: boolean
  permissions: string[]
  can_view_eval: boolean
  must_change_password: boolean
  admin_pages: AdminPage[] | null
  periods: Period[]
}

const toUser = (u: UserOut): SessionUser => ({
  id: u.id,
  role: u.role,
  username: u.username,
  name: u.name,
  club: u.club_name ?? undefined,
  clubKind: u.club_kind ?? undefined,
  clubId: u.club_id ?? undefined,
  isSuper: u.is_super,
  permissions: u.permissions,
  canViewEval: u.can_view_eval,
  mustChangePassword: u.must_change_password,
  adminPages: u.admin_pages ?? undefined,
  periods: u.periods,
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

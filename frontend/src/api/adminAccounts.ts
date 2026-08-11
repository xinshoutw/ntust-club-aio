// 行政端帳號管理 API 層(僅 super):管理員/工讀生/評審三類。
// 建立與重設密碼由後端產生一次性密碼(僅該次 response 回傳明文),前端交 OneTimePasswordModal 顯示。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiPaged, qs } from './client'

export type ManagedRole = 'admin' | 'staff' | 'viewer'

/** 帳號格式(與後端 _USERNAME_RE 對齊) */
export const USERNAME_RE = /^[a-zA-Z0-9._-]{3,50}$/
export const USERNAME_HINT = '帳號限 3–50 字的英數字與 . _ -'

export interface Account {
  id: number
  role: ManagedRole
  username: string
  name: string
  isSuper: boolean
  permissions: string[]
  active: boolean
}

interface AccountOut {
  id: number
  role: ManagedRole
  username: string
  name: string
  email: string | null
  is_super: boolean
  permissions: string[]
  can_view_eval: boolean
  is_active: boolean
}

interface AccountCreatedOut extends AccountOut {
  password: string
}

const toAccount = (a: AccountOut): Account => ({
  id: a.id,
  role: a.role,
  username: a.username,
  name: a.name,
  isSuper: a.is_super,
  permissions: a.permissions,
  active: a.is_active,
})

const keys = {
  all: ['adminAccounts'] as const,
  list: (role: string, page: number) => ['adminAccounts', 'list', role, page] as const,
}

export const ACCOUNTS_PAGE_SIZE = 20

/** 伺服器端分頁:一次一類角色(排序由後端固定為姓名升冪);role 未定時不發查詢 */
export function useAccounts(role: ManagedRole | undefined, page: number) {
  return useQuery({
    queryKey: keys.list(role ?? '', page),
    enabled: role != null,
    queryFn: () =>
      apiPaged<AccountOut[]>(
        `/admin/accounts${qs({ role, page, page_size: ACCOUNTS_PAGE_SIZE })}`,
      ).then(({ data, total }) => ({ rows: data.map(toAccount), total })),
  })
}

export interface AccountInput {
  role: ManagedRole
  name: string
  username: string
}

export function useAccountMutations() {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: keys.all })
  const create = useMutation({
    mutationFn: (b: AccountInput) =>
      api<AccountCreatedOut>('/admin/accounts', {
        method: 'POST',
        body: JSON.stringify({ role: b.role, name: b.name, username: b.username }),
      }).then((out) => ({ account: toAccount(out), password: out.password })),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: number) => api<null>(`/admin/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api<AccountOut>(`/admin/accounts/${id}/active`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: active }),
      }),
    onSuccess: invalidate,
  })
  const resetPassword = useMutation({
    mutationFn: (id: number) =>
      api<{ password: string }>(`/admin/accounts/${id}/reset-password`, { method: 'POST' }),
    onSuccess: invalidate,
  })
  const setPermissions = useMutation({
    mutationFn: ({ id, permissions }: { id: number; permissions: string[] }) =>
      api<AccountOut>(`/admin/accounts/${id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      }),
    onSuccess: invalidate,
  })
  return { create, remove, setActive, resetPassword, setPermissions }
}

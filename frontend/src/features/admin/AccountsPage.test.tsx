import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { render, screen } from '@testing-library/react'
import AccountsPage from './AccountsPage'
import type { Account } from '../../api/adminAccounts'

const ME = {
  id: 1,
  role: 'admin' as const,
  username: 'clerk',
  name: '王承辦',
  isSuper: false,
  permissions: ['aaccount'],
  canViewEval: false,
  mustChangePassword: false,
  periods: [],
  adminPages: [{ key: 'aaccount', label: '帳號管理', paths: ['/admin/accounts'], also: [] }],
  approvalStages: [],
}

const base = { role: 'admin' as const, active: true, isSuper: false }
const rows: Account[] = [
  { ...base, id: 1, username: 'clerk', name: '王承辦', permissions: ['aaccount'] }, // 自己
  { ...base, id: 2, username: 'boss', name: '林最高', permissions: [], isSuper: true },
  { ...base, id: 3, username: 'peer', name: '陳同儕', permissions: ['aaccount', 'asetting'] }, // 位階高於我
  { ...base, id: 4, username: 'mate', name: '李同事', permissions: ['aaccount'] }, // 可操作
]

vi.mock('../../app/auth', () => ({ useAuth: () => ({ user: ME }) }))
vi.mock('../../api/adminAccounts', async (orig) => ({
  ...(await orig<typeof import('../../api/adminAccounts')>()),
  useAccounts: () => ({ data: { rows, total: rows.length }, isPending: false, isError: false, error: null, refetch: vi.fn() }),
  useAccountMutations: () => ({
    create: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
    setActive: { mutate: vi.fn() },
    resetPassword: { mutate: vi.fn() },
    setPermissions: { mutate: vi.fn(), isPending: false },
  }),
}))
vi.mock('../../api/adminClubs', async (orig) => ({
  ...(await orig<typeof import('../../api/adminClubs')>()),
  useAdminClubs: () => ({ data: [], isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn() }),
  useAdminClubMutations: () => ({
    create: { mutate: vi.fn(), isPending: false },
    createAccount: { mutate: vi.fn(), isPending: false },
    remove: { mutate: vi.fn() },
    setActive: { mutate: vi.fn() },
    resetPassword: { mutate: vi.fn() },
  }),
}))

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLTableRowElement

describe('AccountsPage 的動作欄', () => {
  test('後端擋得下的三種對象都不畫鈕(自己、最高權限、位階高於我的同儕)', () => {
    render(
      <App>
        <AccountsPage />
      </App>,
    )
    for (const name of ['王承辦', '林最高', '陳同儕']) {
      expect(rowOf(name).querySelectorAll('button')).toHaveLength(0)
    }
    // 動得了的列照常四個鈕:權限、重設密碼、停用、刪除
    expect(rowOf('李同事').querySelectorAll('button')).toHaveLength(4)
  })
})

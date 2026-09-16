import { describe, expect, test, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'

vi.mock('../api/auth', async (orig) => ({
  ...(await orig<typeof import('../api/auth')>()),
  meApi: vi.fn(),
}))

import { meApi, type SessionUser } from '../api/auth'
import { ApiError, UNAUTHORIZED_EVENT } from '../api/client'
import { AuthProvider, useAuth } from './auth'

const someone: SessionUser = {
  id: 1,
  role: 'club',
  username: 'c001',
  name: '測試社',
  isSuper: false,
  permissions: [],
  canViewEval: false,
  mustChangePassword: false,
  periods: [],
}

function Who() {
  const { user, booting } = useAuth()
  return <div>{booting ? '開機中' : (user?.username ?? '匿名')}</div>
}

const mount = (qc: QueryClient) =>
  render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Who />
      </AuthProvider>
    </QueryClientProvider>,
  )

const fire = async () => {
  await act(async () => {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  })
}

describe('401 的快取清除', () => {
  // 匿名開 /clubs 時開機的 /auth/me 必定 401。照清的話會把同時間抓回來的公開社團
  // 一起清掉,而 qc.clear() 移走的查詢不會自己重抓 —— 導覽頁永遠停在骨架上
  test('沒登入過就沒有 session 可以過期:公開資料留著', async () => {
    vi.mocked(meApi).mockRejectedValue(new ApiError('未登入', 401))
    const qc = new QueryClient()
    qc.setQueryData(['publicClubs'], [{ id: 1 }])
    mount(qc)
    await screen.findByText('匿名')
    await fire()
    expect(qc.getQueryData(['publicClubs'])).toBeTruthy()
  })

  // 反向:真的過期時仍然要清,否則前一位使用者的資料會原封留給下一個看畫面的人
  test('登入中收到 401:登出並清掉快取', async () => {
    vi.mocked(meApi).mockResolvedValue(someone)
    const qc = new QueryClient()
    qc.setQueryData(['myBookings'], [{ id: 1 }])
    mount(qc)
    await screen.findByText('c001')
    await fire()
    expect(qc.getQueryData(['myBookings'])).toBeUndefined()
    await waitFor(() => expect(screen.getByText('匿名')).toBeTruthy())
  })
})

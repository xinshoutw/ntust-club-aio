import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { render, screen } from '@testing-library/react'
import ReviewPage from './ReviewPage'
import type { AdminActivity } from '../../api/adminActivities'

vi.mock('../../app/auth', () => ({
  useAuth: () => ({ user: { role: 'admin', isSuper: true, permissions: ['areview'] } }),
}))

vi.mock('../../api/adminClubs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/adminClubs')>()),
  useClubOptions: () => ({
    data: [{ id: 7, name: '吉他社', kind: '社團', attribute: '藝術', isActive: true }],
    isError: false,
  }),
}))

// 逾期鎖定的單:後端 status 仍是 approved,畫面顯示狀態是「已逾期」
const overdue: AdminActivity = {
  id: '1',
  activityId: 1,
  clubId: 7,
  club: '吉他社',
  name: '逾期未結案',
  type: '活動',
  date: '2026/01/10',
  endDate: '2026/01/10',
  submittedAt: '2026/01/01 10:00',
  requested: 0,
  selfFundTotal: 0,
  closeLocked: true,
  semester: '114-1',
  status: 'locked',
}

let sentStatuses: readonly string[] = []

vi.mock('../../api/adminActivities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/adminActivities')>()),
  useAdminActivities: () => ({ data: [], isLoading: false, isError: false }),
  useAdminActivitiesPaged: (p: { statuses?: string[] }) => {
    sentStatuses = p.statuses ?? []
    return {
      data: { rows: [overdue], clubRows: [], total: 1 },
      isPending: false,
      isError: false,
      isSuccess: true,
      isPlaceholderData: false,
    }
  },
  useAdminActivityDetail: () => ({ data: undefined, isPending: false }),
  useAdminActivityMutations: () => ({ approve: { mutateAsync: vi.fn() }, reject: { mutateAsync: vi.fn() } }),
}))

describe('最近審核涵蓋逾期鎖定的單', () => {
  test('查詢帶上推導狀態 locked,漏斗也列得出「已逾期」', () => {
    render(
      <App>
        <ReviewPage />
      </App>,
    )
    // 後端的 approved 已排除逾期鎖定件,不明列 locked 就是整批消失
    expect(sentStatuses).toContain('locked')
    expect(screen.getByText('逾期未結案')).toBeTruthy()
    expect(screen.getByText('已逾期')).toBeTruthy()
  })
})

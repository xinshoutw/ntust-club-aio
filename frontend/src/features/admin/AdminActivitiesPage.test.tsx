import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { fireEvent, render, screen } from '@testing-library/react'
import AdminActivitiesPage from './AdminActivitiesPage'
import type { AdminActivity, AdminActivityDetail } from '../../api/adminActivities'

vi.mock('../../app/auth', () => ({
  useAuth: () => ({ user: { role: 'admin', isSuper: true, permissions: ['approve_advisor'] } }),
}))

const base = {
  clubId: 7,
  club: '吉他社',
  type: '活動' as const,
  date: '2026/09/20',
  endDate: '2026/09/20',
  submittedAt: '2026/09/25 10:00',
  requested: 0,
  selfFundTotal: 0,
  closeLocked: false,
  semester: '115-1',
}
const pending: AdminActivity = { ...base, id: '1', activityId: 1, name: '迎新', status: 'pending_advisor' }
const closed: AdminActivity = { ...base, id: '2', activityId: 2, name: '成發', status: 'closed' }

const reviewDetail: AdminActivityDetail = {
  ...pending,
  detail: { attachments: [], budget: [] },
  photos: [],
  closeDocs: [],
}

// 已結案:完整內容都在同一支 admin 詳情裡(結案成果走彈窗的「結案」頁籤)
const closedDetail: AdminActivityDetail = {
  ...closed,
  detail: { attachments: [], budget: [] },
  photos: [],
  closeDocs: [],
  report: {
    memberCount: 20,
    nonMemberCount: 5,
    actualStart: '18:00',
    actualEnd: '21:00',
    actualLocation: '學生活動中心',
    highlights: '活動順利完成',
    goals: '達成',
    others: '',
    reviewMeeting: false,
    expense: 0,
    submittedAt: '2026/09/25 10:00',
    reflections: [{ name: '陳同學', dept: '資工系', text: '收穫很多' }],
    photosConfirmed: true,
    reportConfirmed: true,
    reflectionsConfirmed: true,
  },
}

vi.mock('../../api/adminClubs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/adminClubs')>()),
  useClubOptions: () => ({
    data: [{ id: 7, name: '吉他社', kind: '社團', attribute: '藝術', isActive: true }],
    isError: false,
  }),
}))

vi.mock('../../api/adminActivities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/adminActivities')>()),
  useAdminActivitySemesters: () => ({ data: ['115-1'], isPending: false, isError: false }),
  useAdminActivitiesPaged: () => ({
    data: { rows: [pending, closed], total: 2 },
    isPending: false,
    isError: false,
    isSuccess: true,
    isPlaceholderData: false,
    isFetching: false,
  }),
  // 一支詳情吃所有狀態:回該列自己的那一份
  useAdminActivityDetail: (id?: number) => ({
    data: id === 2 ? closedDetail : id ? reviewDetail : undefined,
    isPending: false,
  }),
  useAdminActivityMutations: () => ({ approve: { mutateAsync: vi.fn() }, reject: { mutateAsync: vi.fn() } }),
}))

// AntD 會在兩個中文字的按鈕中間補空白(autoInsertSpace),名稱一律用寬鬆比對
const APPROVE = /核\s*准/

const open = (name: string) => {
  render(
    <App>
      <AdminActivitiesPage />
    </App>,
  )
  fireEvent.click(screen.getByRole('button', { name: `開啟「${name}」詳細資訊` }))
}

describe('所有活動的詳情彈窗依狀態切換', () => {
  test('已結案開完整唯讀檢視:看得到結案成果,而且簽不了核', () => {
    open('成發')
    expect(screen.getByText('結案成果')).toBeTruthy()
    expect(screen.getByText('收穫很多')).toBeTruthy()
    expect(screen.queryByRole('button', { name: APPROVE })).toBeNull()
  })

  test('申請中開審核彈窗:待本關者按得到核准', () => {
    open('迎新')
    expect(screen.queryByText('結案成果')).toBeNull()
    expect(screen.getByRole('button', { name: APPROVE })).toBeTruthy()
  })
})

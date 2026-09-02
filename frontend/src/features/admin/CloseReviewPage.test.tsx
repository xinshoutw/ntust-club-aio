import { describe, expect, test, vi } from 'vitest'
import { Providers } from '../../test/providers'
import { fireEvent, render, screen } from '@testing-library/react'
import CloseReviewPage from './CloseReviewPage'
import type { AdminActivity, AdminActivityDetail } from '../../api/adminActivities'

let noPermission = false

vi.mock('../../app/auth', () => ({
  useAuth: () => ({
    user: noPermission
      ? { role: 'admin', isSuper: false, permissions: ['areview'] }
      : { role: 'admin', isSuper: true, permissions: ['aclose'] },
  }),
}))

const item: AdminActivity = {
  id: 'a-1',
  activityId: 1,
  clubId: 7,
  club: '吉他社',
  name: '迎新',
  type: '活動',
  date: '2026/09/20',
  endDate: '2026/09/20',
  submittedAt: '2026/09/25 10:00',
  requested: 0,
  selfFundTotal: 0,
  closeLocked: false,
  semester: '115-1',
  status: 'closing_pending_advisor',
}

// 遷移件:舊系統說報告表沒交,照片與心得的內容都沒搬進來(心得只有 1 篇,未達送出下限)
const detail: AdminActivityDetail = {
  ...item,
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
    reportConfirmed: false,
    reflectionsConfirmed: true,
  },
}

const approve = vi.fn()
const refetch = vi.fn()
let refetching = false
let refetchFailed = false

vi.mock('../../api/adminActivities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/adminActivities')>()),
  useAdminActivitiesPaged: (p: { overdue?: boolean }) => ({
    data: p.overdue ? { rows: [], total: 0 } : { rows: [item], total: 1 },
    isPending: false,
    isError: false,
    isSuccess: true,
  }),
  useAdminActivityDetail: () => ({
    data: detail,
    isPending: false,
    isError: refetchFailed,
    isFetching: refetching,
    refetch,
  }),
  useAdminActivityMutations: () => ({
    closeApprove: { mutateAsync: approve, isPending: false },
    closeReject: { mutateAsync: vi.fn(), isPending: false },
    unlock: { mutate: vi.fn(), isPending: false, variables: undefined },
  }),
}))

const openModal = async () => {
  approve.mockClear()
  refetch.mockClear()
  render(
    <Providers>
      <CloseReviewPage />
    </Providers>,
  )
  // AntD 會在兩字按鈕中間插一個空格
  fireEvent.click(screen.getByRole('button', { name: /^審\s*核$/ }))
  // Modal 是 portal,內容等它掛上來
  await screen.findByRole('button', { name: '核准結案' })
}

const box = (label: string) => screen.getByRole('checkbox', { name: label }) as HTMLInputElement

describe('結案審核的繳交確認', () => {
  test('預設勾選照推導走:舊庫說沒交的報告表、沒搬進來的照片都不勾', async () => {
    await openModal()

    expect(box('活動照片').checked).toBe(false) // 0 張且無影片
    expect(box('成果報告表').checked).toBe(false) // 舊庫旗標為 false
    expect(box('學習心得').checked).toBe(false) // 只有 1 篇,未達送出下限 3 篇
  })

  // 承辦勾回去是遷移件唯一的補救路徑:送出的必須是畫面上的值,不是推導值
  // 補件重送後手上的快取還是舊那份,推導出來的勾選會把新繳的算成沒繳
  test('詳情還在重抓時不給核准', async () => {
    refetching = true
    try {
      await openModal()
      const approveBtn = screen.getByRole('button', { name: '核准結案' }) as HTMLButtonElement
      expect(approveBtn.disabled).toBe(true)
    } finally {
      refetching = false
    }
  })

  test('重抓失敗但手上還有舊詳情時也不給核准', async () => {
    refetchFailed = true
    try {
      await openModal()
      const approveBtn = screen.getByRole('button', { name: '核准結案' }) as HTMLButtonElement
      expect(approveBtn.disabled).toBe(true)
      expect(screen.getByText(/結案內容更新失敗/)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: '重試' }))
      expect(refetch).toHaveBeenCalled()
    } finally {
      refetchFailed = false
    }
  })

  // 三個旗標在簽核前是欄位預設的 true 佔位值:沒有簽核權的人開同一張待審單,
  // 顯示落庫值等於替沒人看過的單背書。判準是「簽完了沒有」,不是「我能不能簽」
  test('無簽核權開待審單:仍走推導,不顯示落庫的預設 true', async () => {
    noPermission = true
    try {
      render(
        <Providers>
          <CloseReviewPage />
        </Providers>,
      )
      fireEvent.click(screen.getByRole('button', { name: /^審\s*核$/ }))
      await screen.findByText('結案成果')
      expect(box('活動照片').checked).toBe(false) // 落庫是 true,但 0 張且無影片
      expect(box('學習心得').checked).toBe(false) // 落庫是 true,但只有 1 篇
    } finally {
      noPermission = false
    }
  })

  test('承辦勾回的項目要真的送出去', async () => {
    await openModal()

    fireEvent.click(box('成果報告表'))
    fireEvent.click(screen.getByRole('button', { name: '核准結案' }))

    expect(approve).toHaveBeenCalledWith({
      id: 1,
      photosConfirmed: false,
      reportConfirmed: true,
      reflectionsConfirmed: false,
    })
  })
})

import type { ReactElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ActivityFormPage from './ActivityFormPage'
import ActivityClosePage from './ActivityClosePage'
import type { ClubActivityDetail } from '../../api/activities'

// 送出申請與送出結案都是不可逆的一步(送出後社團改不動,只能等退回),誤觸成本高 ——
// 兩頁各自一份實作,兩份都要有「確認送出 / 繼續編輯」擋在前面。
const base = {
  id: 7,
  name: '迎新宿營',
  type: '活動',
  isLarge: false,
  date: '2099/01/01',
  endDate: '2099/01/01',
  timeRange: '09:00–17:00',
  location: '精誠廣場',
  content: '迎新',
  participantsIn: 30,
  participantsOut: 0,
  works: [{ task: '場地', owner: '王小明' }],
  semester: '188-1',
  selfFundTotal: 0,
  requestedTotal: 0,
  closeLocked: false,
  canClose: true,
  hasCloseDraft: true,
  budget: [],
  photos: [],
  attachments: [],
  closeDocs: [],
}

const draftDetail = { ...base, status: 'draft' } as unknown as ClubActivityDetail

// 結案頁的必填欄位全由結案草稿與既有照片預填,測試才不必去戳 TimePicker 與上傳
const closeDetail = {
  ...base,
  status: 'approved',
  photos: Array.from({ length: 5 }, (_, i) => ({
    id: `p${i}`,
    name: `photo${i}.jpg`,
    type: 'image',
    size: 1024,
    url: '',
    uploadedAt: '2026-01-01',
  })),
  closeDraft: {
    memberCount: 30,
    nonMemberCount: 0,
    actualStart: '09:00',
    actualEnd: '17:00',
    actualLocation: '精誠廣場',
    highlights: '闖關',
    goals: '認識彼此',
    others: '無',
    reviewMeeting: false,
    expense: 0,
    reflections: Array.from({ length: 3 }, (_, i) => ({ name: `學生${i}`, dept: '資工三', text: '很有收穫' })),
  },
} as unknown as ClubActivityDetail

const { updateActivity, submitActivity, submitClose } = vi.hoisted(() => ({
  updateActivity: vi.fn(async (_id: number, _input: unknown) => ({ id: 7 })),
  submitActivity: vi.fn(async (_id: number) => {}),
  submitClose: vi.fn(async (_id: number, _body: unknown) => {}),
}))

let detail: ClubActivityDetail = draftDetail

vi.mock('../../api/activities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/activities')>()),
  useActivityDetail: () => ({ data: detail, isPending: false, isError: false }),
  useClosableActivities: () => ({ data: [closeDetail], isPending: false, isError: false }),
  useInvalidateActivities: () => () => {},
  updateActivity,
  submitActivity,
  submitClose,
}))

vi.mock('../../api/clubConfig', () => ({
  useClubConfig: () => ({
    data: {
      budgetCategories: [{ name: '膳費', hint: '' }],
      uploadLimits: {
        activityAttachmentBytes: 10 * 1024 * 1024,
        closePhotoBytes: 50 * 1024 * 1024,
        imgBytes: 5 * 1024 * 1024,
      },
    },
    isPending: false,
    isError: false,
  }),
}))

const renderAt = (path: string, element: ReactElement) => {
  updateActivity.mockClear()
  submitActivity.mockClear()
  submitClose.mockClear()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App>
          <Routes>
            <Route path="/activities/:id/edit" element={element} />
            <Route path="/activities/close" element={element} />
            <Route path="*" element={<div>離開表單</div>} />
          </Routes>
        </App>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const renderForm = () => {
  detail = draftDetail
  renderAt('/activities/7/edit', <ActivityFormPage />)
}

const renderClose = () => {
  detail = closeDetail
  renderAt('/activities/close?id=7', <ActivityClosePage />)
}

describe('活動申請的送出確認', () => {
  test('按下送出申請只跳確認,不直接送出', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: '送出申請' }))
    await screen.findByRole('button', { name: '確認送出' })
    expect(updateActivity).not.toHaveBeenCalled()
    expect(submitActivity).not.toHaveBeenCalled()
  })

  test('選繼續編輯:什麼都沒送,再送一次也只送出一份', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: '送出申請' }))
    fireEvent.click(await screen.findByRole('button', { name: '繼續編輯' }))
    expect(submitActivity).not.toHaveBeenCalled()
    // 「取消掉的那次沒有偷送」要有真的非同步可等才驗得到:再走一次完整流程,送出次數仍是 1。
    // at(-1):jsdom 不跑離場動畫,取消掉的彈窗節點還留在 DOM
    fireEvent.click(screen.getByRole('button', { name: '送出申請' }))
    fireEvent.click(screen.getAllByRole('button', { name: '確認送出' }).at(-1)!)
    await waitFor(() => expect(submitActivity).toHaveBeenCalledTimes(1))
  })

  test('選確認送出:才真的送出', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: '送出申請' }))
    fireEvent.click(await screen.findByRole('button', { name: '確認送出' }))
    await waitFor(() => expect(submitActivity).toHaveBeenCalledWith(7))
    expect(updateActivity).toHaveBeenCalledWith(7, expect.objectContaining({ name: '迎新宿營' }))
  })
})

describe('活動結案的送出確認', () => {
  test('按下送出結案只跳確認,不直接送出', async () => {
    renderClose()
    fireEvent.click(screen.getByRole('button', { name: '送出結案' }))
    await screen.findByRole('button', { name: '確認送出' })
    expect(submitClose).not.toHaveBeenCalled()
  })

  test('選繼續編輯:什麼都沒送,再送一次也只送出一份', async () => {
    renderClose()
    fireEvent.click(screen.getByRole('button', { name: '送出結案' }))
    fireEvent.click(await screen.findByRole('button', { name: '繼續編輯' }))
    expect(submitClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '送出結案' }))
    fireEvent.click(screen.getAllByRole('button', { name: '確認送出' }).at(-1)!)
    await waitFor(() => expect(submitClose).toHaveBeenCalledTimes(1))
  })

  test('選確認送出:才真的送出', async () => {
    renderClose()
    fireEvent.click(screen.getByRole('button', { name: '送出結案' }))
    fireEvent.click(await screen.findByRole('button', { name: '確認送出' }))
    await waitFor(() =>
      expect(submitClose).toHaveBeenCalledWith(7, expect.objectContaining({ actualLocation: '精誠廣場' })),
    )
  })
})

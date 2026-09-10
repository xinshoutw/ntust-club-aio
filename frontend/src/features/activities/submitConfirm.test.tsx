import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ActivityFormPage from './ActivityFormPage'
import type { ClubActivityDetail } from '../../api/activities'

// 活動申請的「送出申請」是不可逆的一步(送出後社團改不動,只能等退回),
// 誤觸成本高 —— 必須先確認才真的送出。結案頁的「送出結案」同一套寫法。
const draft = {
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
  status: 'draft',
  semester: '188-1',
  selfFundTotal: 0,
  requestedTotal: 0,
  closeLocked: false,
  canClose: false,
  hasCloseDraft: false,
  budget: [],
  photos: [],
  attachments: [],
  closeDocs: [],
} as unknown as ClubActivityDetail

const updateActivity = vi.fn(async () => ({ id: 7 }))
const submitActivity = vi.fn(async () => {})

vi.mock('../../api/activities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/activities')>()),
  useActivityDetail: () => ({ data: draft, isPending: false, isError: false }),
  useInvalidateActivities: () => () => {},
  updateActivity: () => updateActivity(),
  submitActivity: () => submitActivity(),
}))

vi.mock('../../api/clubConfig', () => ({
  useClubConfig: () => ({
    data: {
      budgetCategories: [{ name: '膳費', hint: '' }],
      uploadLimits: { activityAttachmentBytes: 10 * 1024 * 1024 },
    },
    isPending: false,
    isError: false,
  }),
}))

const renderPage = () => {
  updateActivity.mockClear()
  submitActivity.mockClear()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/activities/7/edit']}>
        <App>
          <Routes>
            <Route path="/activities/:id/edit" element={<ActivityFormPage />} />
            <Route path="*" element={<div>離開表單</div>} />
          </Routes>
        </App>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const clickInDialog = (name: string) =>
  fireEvent.click(
    [...document.querySelectorAll('.ant-modal-confirm-btns button')].find(
      (b) => b.textContent === name,
    )!,
  )

describe('活動申請的送出確認', () => {
  test('按下送出申請只跳確認,不直接送出', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '送出申請' }))
    await screen.findAllByText('確認送出申請') // 彈窗標題在 title 與 confirm-title 各一份
    expect(updateActivity).not.toHaveBeenCalled()
    expect(submitActivity).not.toHaveBeenCalled()
  })

  test('選繼續編輯:留在原地,什麼都沒送', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '送出申請' }))
    await screen.findAllByText('確認送出申請') // 彈窗標題在 title 與 confirm-title 各一份
    clickInDialog('繼續編輯')
    // 關閉動畫在 jsdom 不會跑完,彈窗節點仍在 —— 驗的是「沒送出、人還在表單上」
    await new Promise((r) => setTimeout(r, 50))
    expect(updateActivity).not.toHaveBeenCalled()
    expect(submitActivity).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '送出申請' })).toBeTruthy()
  })

  test('選確認送出:才真的送出', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '送出申請' }))
    await screen.findAllByText('確認送出申請') // 彈窗標題在 title 與 confirm-title 各一份
    clickInDialog('確認送出')
    await waitFor(() => expect(submitActivity).toHaveBeenCalled())
    expect(updateActivity).toHaveBeenCalled()
  })
})


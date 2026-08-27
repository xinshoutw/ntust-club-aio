import { describe, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { fireEvent, render, screen } from '@testing-library/react'
import MyReviewsPage from './MyReviewsPage'
import type { ViewerAssignment } from '../../api/viewer'

const navigate = vi.fn()
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}))

const assignment: ViewerAssignment = {
  awardId: 'best',
  awardName: '最佳社團獎',
  hasPresentation: false,
  groupId: 3,
  groupName: 'A 組',
  year: 115,
  items: [],
  clubs: [],
}

let assignments: ViewerAssignment[] = []
vi.mock('../../api/viewer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/viewer')>()),
  useViewerAssignments: () => ({ data: assignments, isPending: false, isError: false }),
}))

const show = (path: string, rows: ViewerAssignment[]) => {
  assignments = rows
  navigate.mockClear()
  render(
    <MemoryRouter initialEntries={[path]}>
      <MyReviewsPage />
    </MemoryRouter>,
  )
}

const clickCard = (path: string) => {
  show(path, [assignment])
  fireEvent.click(screen.getByText('最佳社團獎'))
}

// 這三頁在行政端以 /admin/viewer 前綴整組再掛了一次(權限鍵 aviewer),
// 卡片的目的地必須跟著所在前綴走 —— 寫死 /viewer/score 會把管理員彈出行政端外殼
describe('我負責的評分:卡片的目的地跟著前綴走', () => {
  test('評審端', () => {
    clickCard('/viewer')
    expect(navigate).toHaveBeenCalledWith('/viewer/score?group=3')
  })

  test('行政端', () => {
    clickCard('/admin/viewer')
    expect(navigate).toHaveBeenCalledWith('/admin/viewer/score?group=3')
  })
})

// 管理員身上沒有評審指派(指派沒有寫入 API,GAP-01),這一組頁面因此必定是空的。
// 「尚未被指派評分」對承辦讀起來像權限沒生效或系統壞了,要說得出為什麼是空的
describe('我負責的評分:空狀態', () => {
  test('評審端', () => {
    show('/viewer', [])
    expect(screen.getByText('尚未被指派評分')).toBeDefined()
  })

  test('行政端說明這個帳號不是評審', () => {
    show('/admin/viewer', [])
    expect(screen.getByText('此帳號尚未被指派為評審，因此沒有可評分的項目')).toBeDefined()
  })
})

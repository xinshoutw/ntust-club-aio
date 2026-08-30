import { afterEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { render } from '@testing-library/react'
import OverviewPage from './OverviewPage'

let pending = false
const q = <T,>(data: T) => ({
  data,
  isPending: pending,
  isError: false,
  isSuccess: !pending,
  error: null,
  refetch: vi.fn(),
})

vi.mock('../../api/announcements', () => ({
  ANNOUNCEMENT_PAGE_SIZE: 5,
  useAnnouncements: () => q({ announcements: [{ id: 1, title: '公告一', content: '', scope: '全體', date: '2026/08/01', unread: false }], total: 1 }),
  useMarkAnnouncementsRead: () => ({ mutate: vi.fn() }),
}))
vi.mock('../../api/overview', () => ({
  useOverviewActivities: () =>
    q({ todos: [{ id: 1, kind: 'closing_due', name: '迎新', deadline: '2026/09/10', daysLeft: 3, path: '/activities' }], tracked: [] }),
}))
vi.mock('../../api/bookings', () => ({
  useActiveRoomBookings: () => q([]),
  useActiveVenueBookings: () => q([]),
  useActiveEquipmentLoans: () => q([]),
}))
vi.mock('../../api/applications', () => ({
  useMaintenanceList: () => q({ records: [] }),
  usePostalList: () => q({ records: [] }),
  useCertificates: () => q({ records: [] }),
}))

const pagers = () => {
  render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  )
  return document.querySelectorAll('[data-pager]')
}

describe('OverviewPage', () => {
  afterEach(() => {
    pending = false
  })

  test('三張卡的分頁列只有一頁也顯示(design-guide.md §6)', () => {
    // 待辦 1 筆、公告 1 筆、進行中申請 0 筆 —— 三者都不足一頁
    expect(pagers()).toHaveLength(3)
  })

  test('載入中也在:分頁列留在 LoadingBlock 外面,資料到位不會整塊往下跳', () => {
    pending = true
    expect(pagers()).toHaveLength(3)
  })
})

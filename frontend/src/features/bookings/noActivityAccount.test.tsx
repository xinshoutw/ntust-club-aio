import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import VenueBookingPage from './VenueBookingPage'
import EquipmentPage from './EquipmentPage'

// 802 國際事務處借場地與器材都免綁活動(D-36);
// 後端同一份判定在 api/v1/bookings._skips_activity
let account = { username: '802', club: '國際事務處' }
const mutate = vi.fn()

vi.mock('../../app/auth', () => ({
  useAuth: () => ({
    user: {
      role: 'club',
      name: '國際事務處',
      ...account,
      periods: [{ key: '3', start: '10:20', end: '11:10' }],
    },
  }),
}))

vi.mock('../../api/clubProfile', () => ({
  useClubSuspension: () => ({ suspended: false, until: '', reason: '', failed: false }),
}))

vi.mock('../../api/clubConfig', () => ({
  useClubConfig: () => ({ data: { equipmentLoanMaxDays: 14 } }),
}))

vi.mock('../../api/activities', () => ({
  useApprovedActivities: () => ({ data: [{ id: 1, name: '迎新宿營' }], isPending: false }),
}))

const idle = { isPending: false, isError: false, isPlaceholderData: false }

vi.mock('../../api/bookings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/bookings')>()),
  useVenues: () => ({ data: [{ id: 9, name: '精誠廣場', allowTemp: true }], ...idle }),
  useActiveVenueBookings: () => ({ data: [], ...idle }),
  useRecentVenueBookings: () => ({ data: { rows: [], total: 0 }, ...idle }),
  useEquipmentList: () => ({
    data: [{ id: 5, name: '帳篷', available: 3, maxLeaseCount: null }],
    ...idle,
  }),
  useActiveEquipmentLoans: () => ({ data: [], ...idle }),
  useRecentEquipmentLoans: () => ({ data: { rows: [], total: 0 }, ...idle }),
  useBookingMutations: () => ({
    createVenueBooking: { mutate, isPending: false },
    cancelVenueBooking: { mutate: vi.fn() },
    createEquipmentLoan: { mutate, isPending: false },
    cancelEquipmentLoan: { mutate: vi.fn() },
  }),
}))

const activityInput = () => screen.getByLabelText('關聯活動') as HTMLInputElement

// 場地/器材/日期走借用總覽的帶入路徑,測試只需再填其餘必填欄位
const renderPage = (page: 'venue' | 'equipment') => {
  mutate.mockClear()
  const query =
    page === 'venue' ? 'venue=9&date=2099/01/01&period=3' : 'equipment=5&date=2099/01/01'
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/bookings/${page}?${query}`]}>
        <App>{page === 'venue' ? <VenueBookingPage /> : <EquipmentPage />}</App>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** 填滿活動以外的必填欄位並送出 */
const submitWithoutActivity = (page: 'venue' | 'equipment') => {
  if (page === 'equipment') {
    fireEvent.change(screen.getByLabelText('數量'), { target: { value: '1' } })
  }
  fireEvent.change(screen.getByLabelText('用途'), { target: { value: '國際生說明會' } })
  fireEvent.change(screen.getByLabelText('聯絡電話'), { target: { value: '0912345678' } })
  fireEvent.click(screen.getByRole('button', { name: '送出申請' }))
}

describe.each([
  ['臨時場地借用', 'venue' as const],
  ['器材借用', 'equipment' as const],
])('%s 的關聯活動', (_label, page) => {
  test('802 國際事務處:不可選、placeholder 改為無需填寫', () => {
    account = { username: '802', club: '國際事務處' }
    renderPage(page)
    expect(activityInput().disabled).toBe(true)
    expect(screen.getByText('無需填寫')).toBeTruthy()
  })

  test('802 國際事務處:不選活動也送得出去,activityId 送 null', async () => {
    account = { username: '802', club: '國際事務處' }
    renderPage(page)
    submitWithoutActivity(page)
    await waitFor(() => expect(mutate).toHaveBeenCalled())
    expect(mutate.mock.calls[0][0].activityId).toBeNull()
  })

  test('一般社團:照常可選,活動未填擋在必填規則', async () => {
    account = { username: 'club01', club: '熱舞社' }
    renderPage(page)
    expect(activityInput().disabled).toBe(false)
    expect(screen.getByText('請選擇活動')).toBeTruthy() // Select 的 placeholder
    submitWithoutActivity(page)
    // 驗證訊息要抓 explain-error 那顆節點:「請選擇活動」同時是 placeholder,
    // 用 getByText 會被 placeholder 搶先命中,錯誤訊息根本沒出現也照樣綠
    await waitFor(() =>
      expect(document.querySelector('.ant-form-item-explain-error')?.textContent).toBe('請選擇活動'),
    )
    expect(mutate).not.toHaveBeenCalled()
  })

  test('代碼 802 但社團改名:不吃這條例外', () => {
    account = { username: '802', club: '國際事務中心' }
    renderPage(page)
    expect(activityInput().disabled).toBe(false)
  })

  test('名稱對但代碼不是 802:不吃這條例外', () => {
    account = { username: '803', club: '國際事務處' }
    renderPage(page)
    expect(activityInput().disabled).toBe(false)
  })
})

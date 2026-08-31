import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import VenueBookingPage from './VenueBookingPage'

// 802 國際事務處免綁活動(D-36);後端同一份判定在 api/v1/bookings._skips_activity
let account = { username: '802', club: '國際事務處' }
const mutate = vi.fn()

vi.mock('../../app/auth', () => ({
  useAuth: () => ({
    user: { role: 'club', name: '國際事務處', ...account, periods: [{ key: '3', start: '10:20', end: '11:10' }] },
  }),
}))

vi.mock('../../api/clubProfile', () => ({
  useClubSuspension: () => ({ suspended: false, until: '', reason: '', failed: false }),
}))

vi.mock('../../api/activities', () => ({
  useApprovedActivities: () => ({ data: [{ id: 1, name: '迎新宿營' }], isPending: false }),
}))

vi.mock('../../api/bookings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/bookings')>()),
  useVenues: () => ({ data: [{ id: 9, name: '精誠廣場', allowTemp: true }], isPending: false }),
  useActiveVenueBookings: () => ({ data: [], isPending: false, isError: false }),
  useRecentVenueBookings: () => ({ data: { rows: [], total: 0 }, isPending: false, isError: false }),
  useBookingMutations: () => ({
    createVenueBooking: { mutate, isPending: false },
    cancelVenueBooking: { mutate: vi.fn() },
  }),
}))

const activityInput = () => screen.getByLabelText('關聯活動') as HTMLInputElement

// 場地/日期/節次走借用總覽的帶入路徑,測試只需再填用途與電話
const renderPage = () => {
  mutate.mockClear()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/bookings/venue?venue=9&date=2099/01/01&period=3']}>
        <App>
          <VenueBookingPage />
        </App>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** 填滿活動以外的必填欄位並送出 */
const submitWithoutActivity = () => {
  fireEvent.change(screen.getByLabelText('用途'), { target: { value: '國際生說明會' } })
  fireEvent.change(screen.getByLabelText('聯絡電話'), { target: { value: '0912345678' } })
  fireEvent.click(screen.getByRole('button', { name: '送出申請' }))
}

describe('關聯活動', () => {
  test('802 國際事務處:不可選、placeholder 改為無需填寫', () => {
    account = { username: '802', club: '國際事務處' }
    renderPage()
    expect(activityInput().disabled).toBe(true)
    expect(screen.getByText('無需填寫')).toBeTruthy()
  })

  test('802 國際事務處:不選活動也送得出去,activityId 送 null', async () => {
    account = { username: '802', club: '國際事務處' }
    renderPage()
    submitWithoutActivity()
    await waitFor(() => expect(mutate).toHaveBeenCalled())
    expect(mutate.mock.calls[0][0].activityId).toBeNull()
  })

  test('一般社團:照常可選,活動未填擋在必填規則', async () => {
    account = { username: 'club01', club: '熱舞社' }
    renderPage()
    expect(activityInput().disabled).toBe(false)
    expect(screen.getByText('請選擇活動')).toBeTruthy()
    submitWithoutActivity()
    await waitFor(() => expect(screen.getByText('請選擇活動')).toBeTruthy())
    expect(mutate).not.toHaveBeenCalled()
  })

  test('代碼 802 但社團改名:不吃這條例外', () => {
    account = { username: '802', club: '國際事務中心' }
    renderPage()
    expect(activityInput().disabled).toBe(false)
  })

  test('名稱對但代碼不是 802:不吃這條例外', () => {
    account = { username: '803', club: '國際事務處' }
    renderPage()
    expect(activityInput().disabled).toBe(false)
  })
})

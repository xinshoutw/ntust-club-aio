import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import VenueBookingPage from './VenueBookingPage'
import type { VenueBookingInput } from '../../api/bookings'

// 一次送多個時段(D-43):每一筆右側「+」「−」,送出時一筆一張單
const mutate = vi.fn()

vi.mock('../../app/auth', () => ({
  useAuth: () => ({
    user: {
      role: 'club',
      // 802 免綁活動(D-36):這裡測的是時段列,省掉活動下拉的操作
      username: '802',
      club: '國際事務處',
      name: '國際事務處',
      periods: [
        { key: '3', start: '10:20', end: '11:10' },
        { key: '4', start: '11:20', end: '12:10' },
      ],
    },
  }),
}))

vi.mock('../../api/clubProfile', () => ({
  useClubSuspension: () => ({ suspended: false, until: '', reason: '', failed: false }),
}))

vi.mock('../../api/activities', () => ({
  useApprovedActivities: () => ({ data: [], isPending: false }),
}))

const idle = { isPending: false, isError: false, isPlaceholderData: false }

vi.mock('../../api/bookings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/bookings')>()),
  useVenues: () => ({ data: [{ id: 9, name: '精誠廣場', allowTemp: true }], ...idle }),
  useActiveVenueBookings: () => ({ data: [], ...idle }),
  useRecentVenueBookings: () => ({ data: { rows: [], total: 0 }, ...idle }),
  useBookingMutations: () => ({
    createVenueBooking: { mutate, isPending: false },
    cancelVenueBooking: { mutate: vi.fn() },
  }),
}))

// 場地、第一筆的日期與節次走借用總覽的帶入路徑
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

const rows = () => [...document.querySelectorAll<HTMLElement>('.slot-row')]
const addAfter = (n: number) =>
  fireEvent.click(screen.getByRole('button', { name: `在第 ${n} 筆下方新增時段` }))

/** AntD DatePicker:打字再按 Enter 才會提交 */
const pickDate = (row: HTMLElement, value: string) => {
  const input = within(row).getByPlaceholderText('日期')
  fireEvent.mouseDown(input)
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
}
const pickPeriod = (row: HTMLElement, p: string) =>
  fireEvent.click(within(row).getByRole('button', { name: p }))

const submit = () => {
  fireEvent.change(screen.getByLabelText('用途'), { target: { value: '國際生說明會' } })
  fireEvent.change(screen.getByLabelText('聯絡電話'), { target: { value: '0912345678' } })
  fireEvent.click(screen.getByRole('button', { name: '送出申請' }))
}

const slotsSent = () =>
  (mutate.mock.calls[0][0] as VenueBookingInput).slots.map((s) => [
    s.date.format('YYYY/MM/DD'),
    s.periods,
  ])

describe('臨時場地借用的時段列', () => {
  test('「+」在該筆正下方插一筆空白的，「−」移除該筆，只剩一筆時不能再移除', () => {
    renderPage()
    expect(rows()).toHaveLength(1)
    expect(screen.getByRole('button', { name: '移除第 1 筆時段' })).toHaveProperty('disabled', true)

    addAfter(1)
    pickDate(rows()[1], '2099/01/03')
    // 從第一筆按「+」:新的一筆插在第一筆與原本的第二筆之間,不是接在最後
    addAfter(1)
    const dates = () =>
      rows().map((r) => (within(r).getByPlaceholderText('日期') as HTMLInputElement).value)
    expect(dates()).toEqual(['2099/01/01', '', '2099/01/03'])

    fireEvent.click(screen.getByRole('button', { name: '移除第 2 筆時段' }))
    expect(dates()).toEqual(['2099/01/01', '2099/01/03'])
    expect(screen.getByRole('button', { name: '移除第 1 筆時段' })).toHaveProperty('disabled', false)
  })

  // 後端同一個上限(schemas/bookings.MAX_VENUE_SLOTS),超過整批 422
  test('至多 10 筆，滿了「+」全部停用', () => {
    renderPage()
    for (let n = 1; n < 10; n += 1) addAfter(n)
    expect(rows()).toHaveLength(10)
    for (const plus of screen.getAllByRole('button', { name: /下方新增時段$/ })) {
      expect(plus).toHaveProperty('disabled', true)
    }
  })

  test('送出時每一筆各帶自己的日期與節次', async () => {
    renderPage()
    addAfter(1)
    pickDate(rows()[1], '2099/01/02')
    pickPeriod(rows()[1], '4')
    submit()
    await waitFor(() => expect(mutate).toHaveBeenCalled())
    expect(slotsSent()).toEqual([
      ['2099/01/01', ['3']],
      ['2099/01/02', ['4']],
    ])
  })

  test('有一筆沒選日期或節次就不送，紅框標在那一筆上', async () => {
    renderPage()
    addAfter(1)
    submit()
    expect(await screen.findByText('請為每一筆選擇日期與時段')).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
    const [first, second] = rows()
    expect(first.classList.contains('area-error')).toBe(false)
    expect(second.classList.contains('area-error')).toBe(true)
    expect(second.querySelector('.ant-picker-status-error')).not.toBeNull()

    // 修改該欄即解除(design-guide §6)
    pickPeriod(second, '4')
    expect(second.classList.contains('area-error')).toBe(false)
  })

  // 同一天節次重疊的兩筆送出去就是重複申請(後端 `_no_overlap` 同一條);
  // 同一天、節次不重疊的兩筆是兩張單,照送
  test('同一天節次重疊擋在前端，不重疊照送', async () => {
    renderPage()
    addAfter(1)
    pickDate(rows()[1], '2099/01/01')
    pickPeriod(rows()[1], '3')
    submit()
    expect(await screen.findByText('2099/01/01 的時段重複')).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
    expect(rows()[1].classList.contains('area-error')).toBe(true)

    pickPeriod(rows()[1], '3') // 取消第 3 節
    pickPeriod(rows()[1], '4')
    fireEvent.click(screen.getByRole('button', { name: '送出申請' }))
    await waitFor(() => expect(mutate).toHaveBeenCalled())
    expect(slotsSent()).toEqual([
      ['2099/01/01', ['3']],
      ['2099/01/01', ['4']],
    ])
  })
})

// 日期欄打完字按 Enter 是在確認日期:瀏覽器的隱式送出會把還沒填完的整批先送出去。
// jsdom 不做隱式送出,驗的是 Enter 的預設動作被擋下、而日期照樣收進去
test('日期欄按 Enter 只確認日期，不送出表單', () => {
  renderPage()
  addAfter(1)
  const input = within(rows()[1]).getByPlaceholderText('日期')
  fireEvent.mouseDown(input)
  fireEvent.change(input, { target: { value: '2099/01/02' } })
  expect(fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })).toBe(false)
  expect((input as HTMLInputElement).value).toBe('2099/01/02')
  expect(mutate).not.toHaveBeenCalled()
})

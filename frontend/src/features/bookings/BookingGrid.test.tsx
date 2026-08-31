import { expect, test, vi } from 'vitest'
import dayjs from 'dayjs'
import { fireEvent, render, screen } from '@testing-library/react'
import BookingGrid from './BookingGrid'

// 三種呼叫端的差別只在「格子點不點得動」:社團端與行政端給得出借用入口,
// 未登入首頁沒有;行政端另外放行過去日期(補登)。其餘畫面完全同一份。
const YESTERDAY = dayjs().subtract(1, 'day')

vi.mock('../../app/auth', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('../../lib/periods', async (orig) => ({
  ...(await orig<typeof import('../../lib/periods')>()),
  usePeriods: () => [{ key: '3', start: '10:20', end: '11:10' }],
}))
vi.mock('../../api/bookings', () => ({
  useVenues: () => ({ data: [{ id: 7, name: '精誠廣場', capacity: 50, allowFixed: false, allowTemp: true }], isPending: false, isError: false }),
  useAvailability: () => ({ data: {}, isPending: false, isError: false }),
  useAvailabilityDays: () => ({ isPending: false, isError: false, byDate: {}, refetchErrored: () => {} }),
  useEquipmentUsage: () => ({ data: undefined, isPending: false, isError: false, isLoadingError: false }),
  venueLabel: (v: { name: string }) => v.name,
}))

const cells = () => screen.queryAllByRole('button', { name: /點擊前往借用/ })

test('未給借用入口(未登入首頁):可借格只是色塊,點不動', () => {
  render(<BookingGrid />)
  expect(cells()).toHaveLength(0)
  expect(screen.getByRole('img', { name: /精誠廣場 第3節:可借/ })).toBeTruthy()
})

test('給了入口:可借格可點,帶場地、日期與節次回呼', () => {
  const onBookVenue = vi.fn()
  render(<BookingGrid onBookVenue={onBookVenue} />)
  const [cell] = cells()
  fireEvent.click(cell)
  expect(onBookVenue).toHaveBeenCalledTimes(1)
  const [venueId, date, period] = onBookVenue.mock.calls[0]
  expect([venueId, period]).toEqual([7, '3'])
  expect(dayjs.isDayjs(date)).toBe(true)
})

test('過去日期預設點不動;allowPast(行政補登)才放行', () => {
  const onBookVenue = vi.fn()
  const past = render(<BookingGrid onBookVenue={onBookVenue} />)
  fireDate(YESTERDAY)
  expect(cells()).toHaveLength(0)
  past.unmount()

  const admin = render(<BookingGrid allowPast onBookVenue={onBookVenue} />)
  fireDate(YESTERDAY)
  expect(cells()).toHaveLength(1)
  admin.unmount()

  // 今天(未翻頁)兩邊都點得動:確認上面兩條差在 allowPast,不是日期切換本身壞了
  render(<BookingGrid onBookVenue={onBookVenue} />)
  expect(cells()).toHaveLength(1)
})

/** 把格圖切到指定日期:DatePicker 在 jsdom 開不了面板,改按「前一天」鈕 */
function fireDate(target: dayjs.Dayjs) {
  const steps = dayjs().startOf('day').diff(target.startOf('day'), 'day')
  for (let i = 0; i < steps; i++) {
    fireEvent.click(screen.getByRole('button', { name: '前一天' }))
  }
}

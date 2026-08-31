import { beforeEach, expect, test, vi } from 'vitest'
import dayjs from 'dayjs'
import { fireEvent, render, screen } from '@testing-library/react'
import BookingGrid from './BookingGrid'
import type { Period } from '../../api/auth'

// 三個呼叫端的差別只有三件事:格子點不點得動、過去日期放不放行、圖例列不列「我的借用」。
// 其餘畫面完全同一份,所以這裡只釘那三件事與拿不到節次目錄時的失敗態。
const P3: Period = { key: '3', start: '10:20', end: '11:10' }
const EVERY_DAY = { start: '0000-01-01', end: '9999-12-31' } // usageKnown 一律成立

let user: { role: string } | null = null
let catalogue: {
  periods: Period[]
  isPending: boolean
  isLoadingError: boolean
  error?: Error
  refetch: () => void
}
let usage: { start: string; end: string; items: unknown[] } | undefined

vi.mock('../../app/auth', () => ({ useAuth: () => ({ user }) }))
vi.mock('../../lib/periods', async (orig) => ({
  ...(await orig<typeof import('../../lib/periods')>()),
  usePeriodCatalogue: () => catalogue,
}))
vi.mock('../../api/bookings', () => ({
  useVenues: () => ({
    data: [{ id: 7, name: '精誠廣場', capacity: 50, allowFixed: false, allowTemp: true }],
    isPending: false,
    isError: false,
  }),
  useAvailability: () => ({ data: {}, isPending: false, isError: false }),
  useAvailabilityDays: () => ({ isPending: false, isError: false, byDate: {}, refetchErrored: () => {} }),
  useEquipmentUsage: () => ({ data: usage, isPending: false, isError: false, isLoadingError: false }),
  venueLabel: (v: { name: string }) => v.name,
}))

beforeEach(() => {
  user = null
  catalogue = { periods: [P3], isPending: false, isLoadingError: false, refetch: vi.fn() }
  usage = undefined
})

const cells = (label = /點擊前往借用申請/) => screen.queryAllByRole('button', { name: label })
const prevDay = () => fireEvent.click(screen.getByRole('button', { name: '前一天' }))
const equipmentView = () => {
  usage = { ...EVERY_DAY, items: [{ id: 4, name: '無線麥克風', totalQty: 4, used: {} }] }
  fireEvent.click(screen.getByRole('radio', { name: '器材' }))
}

test('未給借用入口(未登入首頁):可借格只是色塊,點不動', () => {
  render(<BookingGrid />)
  expect(cells()).toHaveLength(0)
  expect(screen.getByRole('img', { name: /精誠廣場 第3節:可借/ })).toBeTruthy()
})

test('給了入口:可借格可點,帶場地、日期與節次回呼', () => {
  const onBookVenue = vi.fn()
  render(<BookingGrid onBookVenue={onBookVenue} />)
  fireEvent.click(cells()[0])
  expect(onBookVenue).toHaveBeenCalledTimes(1)
  const [venueId, date, period] = onBookVenue.mock.calls[0]
  expect([venueId, period]).toEqual([7, '3'])
  expect(dayjs.isDayjs(date)).toBe(true)
})

test('器材格同一條規則:未給入口點不動,給了才回呼品項與日期', () => {
  const preview = render(<BookingGrid />)
  equipmentView()
  expect(cells()).toHaveLength(0)
  expect(screen.getAllByRole('img', { name: '0 / 4' }).length).toBeGreaterThan(0)
  preview.unmount()

  const onBookEquipment = vi.fn()
  render(<BookingGrid onBookEquipment={onBookEquipment} />)
  equipmentView()
  fireEvent.click(cells()[0])
  const [equipmentId, date] = onBookEquipment.mock.calls[0]
  expect(equipmentId).toBe(4)
  expect(dayjs.isDayjs(date)).toBe(true)
})

test('過去日期預設點不動;allowPast(行政補登)才放行', () => {
  const onBookVenue = vi.fn()
  const club = render(<BookingGrid onBookVenue={onBookVenue} />)
  expect(cells()).toHaveLength(1) // 開頁停在今天:先確認日期切換本身沒壞
  prevDay()
  expect(cells()).toHaveLength(0)
  club.unmount()

  render(<BookingGrid allowPast onBookVenue={onBookVenue} bookLabel="手動借用" />)
  prevDay()
  expect(cells(/點擊前往手動借用/)).toHaveLength(1)
})

test('圖例的「我的借用」只給社團帳號:行政端與未登入首頁不列', () => {
  const anon = render(<BookingGrid />)
  expect(screen.queryByText('我的借用')).toBeNull()
  anon.unmount()

  user = { role: 'club' }
  render(<BookingGrid />)
  expect(screen.getByText('我的借用')).toBeTruthy()
})

test('節次目錄載不到:換錯誤畫面,不畫一張沒有節次欄的空表', () => {
  catalogue = {
    periods: [],
    isPending: false,
    isLoadingError: true,
    error: new Error('連線失敗'),
    refetch: vi.fn(),
  }
  render(<BookingGrid />)
  expect(screen.getByText('連線失敗')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
})

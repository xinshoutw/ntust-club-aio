import { beforeEach, expect, test, vi } from 'vitest'
import dayjs from 'dayjs'
import { fireEvent, render, screen } from '@testing-library/react'
import BookingGrid from './BookingGrid'
import { taipeiToday } from '../../lib/today'
import type { Period } from '../../api/auth'

// 三個呼叫端的差別只有四件事:格子點不點得動、過去日期放不放行、圖例列不列「我的借用」、
// 有沒有待審單可以就地審。其餘畫面完全同一份,所以這裡只釘那四件事與拿不到節次目錄的失敗態。
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
let grid: Record<string, Record<string, unknown>> = {}
let range: Record<string, Record<string, Record<string, unknown>>> = {}

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
  useAvailability: () => ({ data: grid, isPending: false, isError: false }),
  useAvailabilityDays: () => ({ isPending: false, isError: false, byDate: range, refetchErrored: () => {} }),
  useEquipmentUsage: () => ({ data: usage, isPending: false, isError: false, isLoadingError: false }),
  venueLabel: (v: { name: string }) => v.name,
}))

beforeEach(() => {
  user = null
  catalogue = { periods: [P3], isPending: false, isLoadingError: false, refetch: vi.fn() }
  usage = undefined
  grid = {}
  range = {}
})

/** 已核准的格子(粉色)底下壓著兩張待審單 —— 只有審核端拿得到 pending */
const coveredCell = (pending: { id: number | null; club: string; kind: 'temp' | 'fixed' }[]) => {
  grid = { 7: { 3: { status: 'temp', club: '吉他社', pending } } }
}

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

test('待審單:格色被已核准蓋掉,底下的申請仍點得開,並在說明裡列出來', () => {
  const onOpenPending = vi.fn()
  coveredCell([{ id: 11, club: '熱舞社', kind: 'temp' }])
  render(<BookingGrid onOpenPending={onOpenPending} />)
  const cell = screen.getByRole('button', { name: /點擊開啟審核/ })
  expect(cell.getAttribute('aria-label')).toContain('待審:熱舞社')
  // 格色不是「審核中」時要描橘框,否則被蓋掉的那顆可點格在畫面上根本不存在
  expect(cell.style.boxShadow).toContain('inset')
  fireEvent.click(cell)
  expect(onOpenPending).toHaveBeenCalledTimes(1)
  expect(onOpenPending).toHaveBeenCalledWith({ id: 11, club: '熱舞社', kind: 'temp' })
})

test('待審單:整格只有固定借用時看得到也標得到,但點不了', () => {
  const onOpenPending = vi.fn()
  grid = { 7: { 3: { status: 'pending', club: '弓道社', pending: [{ id: null, club: '弓道社', kind: 'fixed' }] } } }
  render(<BookingGrid onOpenPending={onOpenPending} />)
  expect(screen.queryByRole('button', { name: /審核/ })).toBeNull()
  const cell = screen.getByRole('img', { name: /待審/ })
  expect(cell.getAttribute('aria-label')).toContain('弓道社(固定借用)')
  // 審核中格的社名已經在「待審:」裡,不再括號重覆一次
  expect(cell.getAttribute('aria-label')).not.toContain('(弓道社)')
})

test('待審單:單一場地 15 天檢視也吃同一份判定', () => {
  const onOpenPending = vi.fn()
  const iso = taipeiToday().format('YYYY-MM-DD')
  range = { [iso]: { 7: { 3: { status: 'temp', club: '吉他社', pending: [{ id: 11, club: '熱舞社', kind: 'temp' }] } } } }
  render(<BookingGrid onOpenPending={onOpenPending} />)
  fireEvent.click(screen.getByRole('button', { name: /檢視 精誠廣場/ }))
  fireEvent.click(screen.getByRole('button', { name: /點擊開啟審核/ }))
  expect(onOpenPending).toHaveBeenCalledWith({ id: 11, club: '熱舞社', kind: 'temp' })
})

test('待審單:沒給審核入口(社團端與未登入首頁)就只是一格色塊', () => {
  coveredCell([{ id: 11, club: '熱舞社', kind: 'temp' }])
  render(<BookingGrid />)
  expect(screen.queryByRole('button', { name: /點擊開啟審核/ })).toBeNull()
})

test('待審單:同一格多筆要每筆都點得到,固定借用標示得到但點不了', () => {
  const onOpenPending = vi.fn()
  coveredCell([
    { id: 11, club: '熱舞社', kind: 'temp' },
    { id: 12, club: '吉他社', kind: 'temp' },
    { id: null, club: '弓道社', kind: 'fixed' },
  ])
  render(<BookingGrid onOpenPending={onOpenPending} />)
  const cell = screen.getByRole('button', { name: /點擊選擇要審核的申請/ })
  expect(cell.getAttribute('aria-haspopup')).toBe('menu')
  expect(cell.getAttribute('aria-label')).toContain('弓道社(固定借用)')
  // 多筆時格子本身不直接開彈窗,點下去只出選單
  fireEvent.click(cell)
  expect(onOpenPending).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('審核 吉他社 的申請'))
  expect(onOpenPending).toHaveBeenCalledTimes(1)
  expect(onOpenPending).toHaveBeenCalledWith({ id: 12, club: '吉他社', kind: 'temp' })
  // 固定借用沒有申請 id,選單裡不該出現
  expect(screen.queryByText('審核 弓道社 的申請')).toBeNull()
})

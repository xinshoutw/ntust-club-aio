import dayjs, { type Dayjs } from 'dayjs'
import type { StatusKey } from '../../lib/status'

// 節次:第 1–10 節與 A–D 節(晚間)
export const PERIODS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'A', 'B', 'C', 'D']

// 固定借用開放窗(system_settings:管理員可調):預設每年 6 月、1 月受理
export const FIXED_BOOKING_WINDOW = {
  openMonths: [6, 1],
  // demo:管理員手動加開,讓 7 月也能檢視表單;正式由後台切換
  adminOpenNow: true,
}
export const isFixedBookingOpenByMonth = (now = dayjs()): boolean =>
  FIXED_BOOKING_WINDOW.openMonths.includes(now.month() + 1)
export const isFixedBookingOpen = (now = dayjs()): boolean =>
  FIXED_BOOKING_WINDOW.adminOpenNow || isFixedBookingOpenByMonth(now)

export interface Venue {
  name: string
  category: '教室' | '練習空間' | '廣場/戶外' | '宿舍區'
  capacity: number
  allowFixed: boolean
  allowTemp: boolean
}

// 場地主檔(2026-07-15 需求方定案 19 處;之後由管理員後台維護,數量/容納人數可調)
export const VENUES: Venue[] = [
  { name: 'S204 共享食堂', category: '教室', capacity: 60, allowFixed: true, allowTemp: true },
  { name: 'S207', category: '教室', capacity: 60, allowFixed: true, allowTemp: true },
  { name: 'S209', category: '教室', capacity: 60, allowFixed: true, allowTemp: true },
  { name: 'S301', category: '教室', capacity: 50, allowFixed: true, allowTemp: true },
  { name: 'S302/S303', category: '教室', capacity: 90, allowFixed: true, allowTemp: true },
  { name: 'S304 音樂教室', category: '教室', capacity: 50, allowFixed: true, allowTemp: true },
  { name: 'S311', category: '教室', capacity: 50, allowFixed: true, allowTemp: true },
  { name: 'S312/S313', category: '教室', capacity: 90, allowFixed: true, allowTemp: true },
  { name: 'S314', category: '教室', capacity: 50, allowFixed: true, allowTemp: true },
  { name: '練團室', category: '練習空間', capacity: 15, allowFixed: true, allowTemp: true },
  { name: 'T4 舞蹈區', category: '練習空間', capacity: 15, allowFixed: true, allowTemp: true },
  { name: '3F 戶外廣場', category: '廣場/戶外', capacity: 200, allowFixed: false, allowTemp: true },
  { name: '戶外精誠廣場 1', category: '廣場/戶外', capacity: 150, allowFixed: false, allowTemp: true },
  { name: '戶外精誠廣場 2', category: '廣場/戶外', capacity: 150, allowFixed: false, allowTemp: true },
  { name: '戶外精誠廣場 3', category: '廣場/戶外', capacity: 150, allowFixed: false, allowTemp: true },
  { name: '戶外精誠廣場 4', category: '廣場/戶外', capacity: 150, allowFixed: false, allowTemp: true },
  { name: '戶外精誠廣場 5', category: '廣場/戶外', capacity: 150, allowFixed: false, allowTemp: true },
  { name: '一宿 B2 樓梯', category: '宿舍區', capacity: 120, allowFixed: false, allowTemp: true },
  { name: '一宿 B2 白板', category: '宿舍區', capacity: 120, allowFixed: false, allowTemp: true },
]

export interface Equipment {
  name: string
  category: '一般' | '電子設備' | '投影布幕' | '帳篷'
  total: number
  needsSerial: boolean
}

export const EQUIPMENT: Equipment[] = [
  { name: '帳篷', category: '帳篷', total: 6, needsSerial: true },
  { name: '摺疊桌', category: '一般', total: 25, needsSerial: false },
  { name: '椅子', category: '一般', total: 80, needsSerial: false },
  { name: '紅龍', category: '一般', total: 6, needsSerial: false },
  { name: '電腦單槍投影機', category: '電子設備', total: 5, needsSerial: true },
  { name: '麥克風架', category: '一般', total: 6, needsSerial: false },
  { name: '擴音機 MA101', category: '電子設備', total: 2, needsSerial: true },
  { name: '投影銀幕', category: '投影布幕', total: 5, needsSerial: true },
  { name: '延長線 5M', category: '一般', total: 5, needsSerial: false },
  { name: '推車', category: '一般', total: 4, needsSerial: false },
]

// 可借數為動態推導:總數 − 指定區間內(未歸還且未退回)借用單的重疊數量
// 須先知道借用區間(由關聯活動起訖推導)才能計算
// 逾期未還=器材仍在外,無論原借用區間是否已過,一律視為佔用
export function availableInWindow(name: string, start: string, end: string, excludeId?: string): number {
  const eq = EQUIPMENT.find((e) => e.name === name)
  if (!eq) return 0
  const s = dayjs(start, 'YYYY/MM/DD')
  const en = dayjs(end, 'YYYY/MM/DD')
  const used = EQUIPMENT_LOANS.filter(
    (l) =>
      l.equipment === name &&
      l.id !== excludeId &&
      l.status !== 'returned' &&
      l.status !== 'rejected' &&
      (l.status === 'overdue' ||
        (!dayjs(l.endDate, 'YYYY/MM/DD').isBefore(s, 'day') && !dayjs(l.startDate, 'YYYY/MM/DD').isAfter(en, 'day'))),
  ).reduce((sum, l) => sum + l.qty, 0)
  return Math.max(0, eq.total - used)
}

// 固定借用=整學期每週固定時段,以星期表示(1=週一 … 7=週日)
export const DOW_TEXT = ['', '一', '二', '三', '四', '五', '六', '日']

export interface RoomRequest {
  id: string
  club: string
  room: string
  entries: { dow: number; periods: string[] }[] // dow: 1=週一 … 7=週日
  note: string
  status: StatusKey
}

export const roomEntryText = (e: RoomRequest['entries'][number]): string =>
  `週${DOW_TEXT[e.dow]} 第${e.periods.join('、')}節`

export const ROOM_REQUESTS: RoomRequest[] = [
  {
    id: 'ROOM-114-0301',
    club: '資工系學會',
    room: 'S304 音樂教室',
    entries: [{ dow: 2, periods: ['3', '4'] }],
    note: '社課練習',
    status: 'pending',
  },
  {
    id: 'ROOM-114-0302',
    club: '電機系學會',
    room: 'S304 音樂教室',
    entries: [{ dow: 2, periods: ['3'] }],
    note: '電機週排練',
    status: 'pending',
  },
]

export interface VenueBooking {
  id: string
  club: string
  venue: string
  date: string
  periods: string[]
  purpose: string
  status: StatusKey
}

// 近日日期以今天為基準,讓場況圖常保有內容
const rel = (n: number) => dayjs().add(n, 'day').format('YYYY/MM/DD')

export const VENUE_BOOKINGS: VenueBooking[] = [
  { id: 'VEN-114-0091', club: '資工系學會', venue: 'S304 音樂教室', date: '2026/06/20', periods: ['3', '4'], purpose: '社課', status: 'pending' },
  { id: 'VEN-114-0088', club: '資工系學會', venue: '戶外精誠廣場 1', date: '2026/06/05', periods: ['5', '6', '7'], purpose: '社團博覽會攤位', status: 'approved' },
  { id: 'VEN-114-0101', club: '吉他社', venue: 'S209', date: rel(0), periods: ['3', '4'], purpose: '社課', status: 'approved' },
  { id: 'VEN-114-0102', club: '電機系學會', venue: 'S304 音樂教室', date: rel(0), periods: ['5'], purpose: '練習', status: 'pending' },
  { id: 'VEN-114-0103', club: '機器人研究社', venue: 'S312/S313', date: rel(1), periods: ['A', 'B'], purpose: '組裝測試', status: 'approved' },
  { id: 'VEN-114-0104', club: '熱舞社', venue: '3F 戶外廣場', date: rel(2), periods: ['5', '6', '7'], purpose: '成發彩排', status: 'pending' },
  { id: 'VEN-114-0105', club: '資工系學會', venue: 'S204 共享食堂', date: rel(3), periods: ['5', '6'], purpose: '期初大會', status: 'approved' },
  { id: 'VEN-114-0106', club: '登山社', venue: '戶外精誠廣場 2', date: rel(4), periods: ['8', '9', '10'], purpose: '裝備檢整', status: 'approved' },
]

// ---- 場況圖共用(社團端借用總覽/行政端空間審核) ----

// 固定借用(已核准):學期內每週同一時段;審核中的固定借用不顯示於場況圖
export const FIXED_WEEKLY: { venue: string; dow: number; periods: string[]; club: string }[] = [
  { venue: 'S207', dow: 2, periods: ['6', '7'], club: '美術社' },
  { venue: 'S304 音樂教室', dow: 3, periods: ['3', '4'], club: '電機系學會' },
  { venue: '練團室', dow: 1, periods: ['C', 'D'], club: '熱音社' },
  { venue: 'S302/S303', dow: 4, periods: ['A', 'B', 'C'], club: '資工系學會' },
]

export type CellState = 'free' | 'closed' | 'reviewing' | 'temp' | 'fixed' | 'mine'

// 場地格配色(2026-07-15 需求方):不開放不畫方框也不列圖例;固定借用深灰
export const CELL: Record<CellState, { label: string; bg: string }> = {
  free: { label: '可借', bg: '#EEF0F3' },
  closed: { label: '不開放', bg: 'transparent' },
  reviewing: { label: '審核中', bg: '#F5A623' },
  temp: { label: '臨時借用', bg: '#F0A899' },
  fixed: { label: '固定借用', bg: '#9AA1AC' },
  mine: { label: '我的借用', bg: '#2E7D57' },
}

export interface CellInfo {
  state: CellState
  club?: string
  booking?: VenueBooking // 臨時借用/審核中對應的申請單(行政端點格開審核用)
}

export function cellInfo(venue: string, date: Dayjs, period: string, myClub?: string): CellInfo {
  if (venue === '練團室' && ['1', '2'].includes(period)) return { state: 'closed' } // 保養時段示意
  const fixed = FIXED_WEEKLY.find((f) => f.venue === venue && f.dow === date.day() && f.periods.includes(period))
  if (fixed) return fixed.club === myClub ? { state: 'mine', club: myClub } : { state: 'fixed', club: fixed.club }
  const d = date.format('YYYY/MM/DD')
  const t = VENUE_BOOKINGS.find(
    (x) => (x.status === 'pending' || x.status === 'approved') && x.venue === venue && x.date === d && x.periods.includes(period),
  )
  if (t) {
    if (t.status === 'pending') return { state: 'reviewing', club: t.club, booking: t }
    return t.club === myClub ? { state: 'mine', club: t.club, booking: t } : { state: 'temp', club: t.club, booking: t }
  }
  return { state: 'free' }
}

export interface EquipmentLoan {
  id: string
  club: string
  equipment: string
  qty: number
  activity?: string // 綁定之審核通過活動(借用區間由活動起訖推導)
  startDate: string // 推導:活動開始日 −2 個工作天
  endDate: string // 推導:活動結束日 +1 個工作天
  purpose: string
  status: StatusKey
  serials?: string[]
  checkoutBy?: string
  returnDue?: string
  borrower?: string // 借用人(借出點交時登記)
  returnedBy?: string // 歸還人(歸還點交時登記)
}

export const EQUIPMENT_LOANS: EquipmentLoan[] = [
  { id: 'EQP-114-0092', club: '資工系學會', equipment: '摺疊桌', qty: 10, activity: '迎新宿營', startDate: '2026/06/12', endDate: '2026/06/15', purpose: '迎新擺攤', status: 'checked_out', checkoutBy: '李工讀', returnDue: '2026/06/16 10:30', borrower: '陳予恩' },
  { id: 'EQP-114-0093', club: '資工系學會', equipment: '電腦單槍投影機', qty: 1, activity: '期末迎新籌備工作坊', startDate: '2026/06/01', endDate: '2026/06/03', purpose: '展演', status: 'returned', serials: ['PJ-003'], borrower: '陳予恩', returnedBy: '林詠晴' },
  { id: 'EQP-114-0095', club: '電機系學會', equipment: '擴音機 MA101', qty: 1, startDate: '2026/06/02', endDate: '2026/06/04', purpose: '晚會彩排', status: 'overdue', checkoutBy: '李工讀', returnDue: '2026/06/05 10:30', borrower: '張書豪' },
  { id: 'EQP-114-0096', club: '資工系學會', equipment: '帳篷', qty: 2, activity: '新生迎新博覽會', startDate: '2026/07/23', endDate: '2026/07/27', purpose: '園遊會', status: 'pending' },
]

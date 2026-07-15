import dayjs from 'dayjs'
import type { StatusKey } from '../../lib/status'

export const VIOL_ITEMS = [
  '社辦電燈未關',
  '社辦電扇未關',
  '社辦冷氣未關',
  '公共教室電燈未關',
  '公共教室電扇未關',
  '公共教室冷氣未關',
  '公共教室留有垃圾',
]

export interface Violation {
  id: string
  club: string
  date: string
  location: string
  items: string[]
  filler: string
  status: StatusKey
  note?: string
}

// 銷案期限:開立日 +1 個月;逾期即截止,不再受理銷案(推導不儲存)
export const resolveDeadline = (v: Violation): string =>
  dayjs(v.date, 'YYYY/MM/DD').add(1, 'month').format('YYYY/MM/DD')

export const resolveExpired = (v: Violation, now = dayjs()): boolean =>
  v.status === 'violation_open' && now.isAfter(dayjs(resolveDeadline(v), 'YYYY/MM/DD'), 'day')

export const VIOLATIONS: Violation[] = [
  {
    id: 'VIO-114-0501',
    club: '電機系學會',
    date: '2026/06/05',
    location: '社辦 S312',
    items: ['社辦冷氣未關', '社辦電燈未關'],
    filler: '李工讀',
    status: 'violation_open',
  },
  {
    id: 'VIO-114-0502',
    club: '資工系學會',
    date: '2026/05/28',
    location: '公共教室 RB101',
    items: ['公共教室留有垃圾'],
    filler: '陳工讀',
    status: 'violation_resolved',
    note: '已完成愛校服務 2 小時,已銷案',
  },
  {
    id: 'VIO-114-0503',
    club: '資工系學會',
    date: '2026/06/22',
    location: '社辦 S315',
    items: ['社辦電燈未關'],
    filler: '李工讀',
    status: 'violation_open',
  },
]

import type { StatusKey } from '../../lib/status'

// 節次:第 1–10 節與 A–D 節(晚間)
export const PERIODS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'A', 'B', 'C', 'D']

export interface Venue {
  name: string
  category: '教室' | '練習空間' | '廣場/戶外'
  capacity: number
  allowFixed: boolean
  allowTemp: boolean
}

export const VENUES: Venue[] = [
  { name: 'S204 共享食堂', category: '教室', capacity: 60, allowFixed: true, allowTemp: true },
  { name: 'S207', category: '教室', capacity: 60, allowFixed: true, allowTemp: true },
  { name: 'S301', category: '教室', capacity: 50, allowFixed: true, allowTemp: true },
  { name: 'S304 音樂教室', category: '教室', capacity: 50, allowFixed: true, allowTemp: true },
  { name: 'S312/S313', category: '教室', capacity: 90, allowFixed: true, allowTemp: true },
  { name: 'TR 練團室', category: '練習空間', capacity: 15, allowFixed: true, allowTemp: true },
  { name: 'T4 舞蹈區', category: '練習空間', capacity: 30, allowFixed: true, allowTemp: true },
  { name: '3F 廣場', category: '廣場/戶外', capacity: 200, allowFixed: false, allowTemp: true },
  { name: '精誠廣場 1', category: '廣場/戶外', capacity: 150, allowFixed: false, allowTemp: true },
  { name: '一舍 B2', category: '廣場/戶外', capacity: 120, allowFixed: false, allowTemp: true },
]

export interface Equipment {
  name: string
  category: '一般' | '電子設備' | '投影布幕' | '帳篷'
  total: number
  available: number
  needsSerial: boolean
}

export const EQUIPMENT: Equipment[] = [
  { name: '帳篷', category: '帳篷', total: 6, available: 6, needsSerial: true },
  { name: '摺疊桌', category: '一般', total: 25, available: 25, needsSerial: false },
  { name: '椅子', category: '一般', total: 80, available: 72, needsSerial: false },
  { name: '紅龍', category: '一般', total: 6, available: 6, needsSerial: false },
  { name: '電腦單槍投影機', category: '電子設備', total: 5, available: 2, needsSerial: true },
  { name: '麥克風架', category: '一般', total: 6, available: 6, needsSerial: false },
  { name: '擴音機 MA101', category: '電子設備', total: 2, available: 1, needsSerial: true },
  { name: '投影銀幕', category: '投影布幕', total: 5, available: 5, needsSerial: true },
  { name: '延長線 5M', category: '一般', total: 5, available: 5, needsSerial: false },
  { name: '推車', category: '一般', total: 4, available: 3, needsSerial: false },
]

export interface RoomRequest {
  id: string
  club: string
  room: string
  entries: { date: string; period: string }[]
  note: string
  status: StatusKey
}

export const ROOM_REQUESTS: RoomRequest[] = [
  {
    id: 'ROOM-114-0301',
    club: '資工系學會',
    room: 'S304 音樂教室',
    entries: [
      { date: '2026/09/15', period: '3' },
      { date: '2026/09/22', period: '3' },
    ],
    note: '社課練習',
    status: 'pending',
  },
  {
    id: 'ROOM-114-0302',
    club: '電機系學會',
    room: 'S304 音樂教室',
    entries: [{ date: '2026/09/15', period: '3' }],
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

export const VENUE_BOOKINGS: VenueBooking[] = [
  { id: 'VEN-114-0091', club: '資工系學會', venue: 'S304 音樂教室', date: '2026/06/20', periods: ['3', '4'], purpose: '社課', status: 'pending' },
  { id: 'VEN-114-0088', club: '資工系學會', venue: '精誠廣場 1', date: '2026/06/05', periods: ['5', '6', '7'], purpose: '社團博覽會攤位', status: 'approved' },
]

export interface EquipmentLoan {
  id: string
  club: string
  equipment: string
  qty: number
  startDate: string
  endDate: string
  purpose: string
  status: StatusKey
  serials?: string[]
  checkoutBy?: string
  returnDue?: string
}

export const EQUIPMENT_LOANS: EquipmentLoan[] = [
  { id: 'EQP-114-0092', club: '資工系學會', equipment: '摺疊桌', qty: 10, startDate: '2026/06/12', endDate: '2026/06/15', purpose: '迎新擺攤', status: 'checked_out', checkoutBy: '李工讀', returnDue: '2026/06/16 10:30' },
  { id: 'EQP-114-0093', club: '資工系學會', equipment: '電腦單槍投影機', qty: 1, startDate: '2026/06/01', endDate: '2026/06/03', purpose: '展演', status: 'returned', serials: ['PJ-003'] },
  { id: 'EQP-114-0095', club: '電機系學會', equipment: '擴音機 MA101', qty: 1, startDate: '2026/06/02', endDate: '2026/06/04', purpose: '晚會彩排', status: 'overdue', checkoutBy: '李工讀', returnDue: '2026/06/05 10:30' },
  { id: 'EQP-114-0096', club: '資工系學會', equipment: '帳篷', qty: 2, startDate: '2026/09/20', endDate: '2026/09/21', purpose: '園遊會', status: 'pending' },
]

// 工讀生端基礎原型 mock(2026-07-17):接後端時整檔移除。
// 違規項目目錄實際來自 system_settings、器材/借用來自 bookings API。

export const CLUBS = [
  '資工系學會',
  '熱舞社',
  '吉他社',
  '攝影社',
  '登山社',
  '網球社',
  '康輔社',
  '合唱團',
]

export const VIOLATION_ITEMS = [
  '未關閉電源或冷氣',
  '場地未復原',
  '噪音超時',
  '未經申請使用場地',
  '器材未歸位',
  '環境髒亂',
]

export interface PtViolation {
  id: number
  date: string // 發生日 YYYY/MM/DD
  club: string
  location: string
  items: string[]
  filler: string // 填寫人(工讀生)
  deadline: string // 銷案期限=開立日 +1 個月(推導)
  status: 'violation_open' | 'violation_resolved'
}

export const VIOLATIONS: PtViolation[] = [
  {
    id: 1, date: '2026/07/02', club: '熱舞社', location: '學生活動中心 B1',
    items: ['噪音超時', '場地未復原'], filler: '張工讀', deadline: '2026/08/02',
    status: 'violation_open',
  },
  {
    id: 2, date: '2026/06/28', club: '吉他社', location: '社辦走廊',
    items: ['環境髒亂'], filler: '張工讀', deadline: '2026/07/28',
    status: 'violation_open',
  },
  {
    id: 3, date: '2026/06/15', club: '攝影社', location: '共同教室 201',
    items: ['未關閉電源或冷氣'], filler: '李工讀', deadline: '2026/07/15',
    status: 'violation_resolved',
  },
  {
    id: 4, date: '2026/05/30', club: '登山社', location: '器材室',
    items: ['器材未歸位'], filler: '李工讀', deadline: '2026/06/30',
    status: 'violation_resolved',
  },
]

export interface PtLoan {
  id: number
  club: string
  equipment: string
  qty: number
  needsSerial: boolean // 依序點交:逐件登記序號
  start: string
  end: string
  borrower?: string // 借出點交時登記
}

// 已核准、待借出點交
export const APPROVED_LOANS: PtLoan[] = [
  { id: 11, club: '資工系學會', equipment: '帳篷', qty: 2, needsSerial: false, start: '2026/07/18', end: '2026/07/22' },
  { id: 12, club: '康輔社', equipment: '無線麥克風', qty: 4, needsSerial: true, start: '2026/07/19', end: '2026/07/21' },
  { id: 13, club: '合唱團', equipment: '延長線', qty: 6, needsSerial: false, start: '2026/07/20', end: '2026/07/24' },
]

// 借出中、待歸還點交
export const CHECKED_OUT_LOANS: PtLoan[] = [
  { id: 21, club: '熱舞社', equipment: '行動音響', qty: 1, needsSerial: true, start: '2026/07/10', end: '2026/07/17', borrower: '陳小舞' },
  { id: 22, club: '登山社', equipment: '摺疊桌', qty: 3, needsSerial: false, start: '2026/07/12', end: '2026/07/18', borrower: '林山友' },
]

export interface OverdueRow {
  id: number
  club: string
  equipment: string
  qty: number
  due: string // 應歸還時限(結束日隔天上班日 10:30)
  daysLate: number
  borrower: string
}

export const OVERDUE_ROWS: OverdueRow[] = [
  { id: 31, club: '網球社', equipment: '遮陽棚', qty: 1, due: '2026/07/13 10:30', daysLate: 4, borrower: '王網球' },
  { id: 32, club: '吉他社', equipment: '譜架', qty: 5, due: '2026/07/15 10:30', daysLate: 2, borrower: '吳吉他' },
]

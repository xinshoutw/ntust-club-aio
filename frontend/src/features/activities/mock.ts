import type { Activity } from './types'

// ponytail: 靜態假資料;後端 API 完成後改為 TanStack Query 取用
export const CLUB_ACTIVITIES: Activity[] = [
  {
    id: 'ACT-114-0009',
    name: '期初社員大會',
    club: '資工系學會',
    type: '社課',
    date: '2026/09/18',
    status: 'draft',
    budget: [],
  },
  {
    id: 'ACT-114-0020',
    name: '資訊週',
    club: '資工系學會',
    type: '活動',
    isLarge: true,
    date: '2026/09/15',
    status: 'pending_dean',
    budget: [
      { id: 1, category: '演講/裁判費', description: '技術講座講師費 ×3 場', selfFund: 6000, requestedSubsidy: 18000 },
      { id: 2, category: '印刷費', description: '宣傳海報、活動手冊', selfFund: 9000, requestedSubsidy: 12000 },
      { id: 3, category: '其他', description: '競賽獎品與場地布置', selfFund: 20000, requestedSubsidy: 18000 },
    ],
  },
  {
    id: 'ACT-114-0019',
    name: '電競友誼賽',
    club: '資工系學會',
    type: '活動',
    date: '2026/05/30',
    status: 'rejected',
    budget: [
      { id: 1, category: '比賽獎勵品', description: '獎品', selfFund: 3000, requestedSubsidy: 8000 },
    ],
    rejectReason: {
      by: '組長 林淑芬',
      date: '2026/06/02',
      text: '經費明細第 3 項「其他」未附估價單;參加人數與場地容量不符,請修正後重送。',
    },
  },
  {
    id: 'ACT-114-0018',
    name: '迎新宿營',
    club: '資工系學會',
    type: '活動',
    date: '2026/06/28',
    status: 'approved',
    budget: [
      { id: 1, category: '交通費', description: '遊覽車', selfFund: 18000, requestedSubsidy: 25000 },
    ],
    closeDeadline: '2026/07/28',
    closeDaysLeft: 15,
  },
  {
    id: 'ACT-114-0012',
    name: '程式設計工作坊',
    club: '資工系學會',
    type: '社課',
    date: '2026/04/12',
    status: 'locked',
    budget: [
      { id: 1, category: '印刷費', description: 'Python 教材講義', selfFund: 1000, requestedSubsidy: 4000 },
    ],
    closeDeadline: '2026/05/12',
  },
  {
    id: 'ACT-114-0011',
    name: '新生迎新茶會',
    club: '資工系學會',
    type: '活動',
    date: '2026/03/05',
    status: 'closed',
    budget: [
      { id: 1, category: '印刷費', description: '迎新海報與手冊', selfFund: 2000, requestedSubsidy: 6000 },
    ],
  },
]

export interface Announcement {
  id: string
  title: string
  content: string
  date: string
  scope: string
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'an1',
    title: '114-2 社團評鑑報名開始',
    content: '請各社團於 9/10 前完成「社團競賽(評鑑)」報名,並依時程準備評鑑資料。',
    date: '2026/06/18',
    scope: '全校',
  },
  {
    id: 'an2',
    title: '場地核准通知',
    content: '您申請的 S304 教室(節次 3、4)已核准,請依核定時段使用。',
    date: '2026/06/16',
    scope: '本社團',
  },
]

export interface TrackedApplication {
  id: string
  name: string
  category: '活動' | '借用' | '線上申請'
  status: import('../../lib/status').StatusKey
  path: string
}

export const TRACKED: TrackedApplication[] = [
  { id: 'ACT-114-0012', name: '程式設計工作坊', category: '活動', status: 'approved', path: '/activities' },
  { id: 'ACT-114-0018', name: '迎新宿營', category: '活動', status: 'closing_due', path: '/activities' },
  { id: 'ACT-114-0020', name: '資訊週', category: '活動', status: 'pending_dean', path: '/activities' },
  { id: 'ROOM-114-0301', name: '教室固定借用 S304', category: '借用', status: 'pending', path: '/bookings/fixed' },
  { id: 'MNT-114-0023', name: '社團空間維修 S304', category: '線上申請', status: 'in_progress', path: '/maintenance' },
  { id: 'OFC-114-0021', name: '幹部證明', category: '線上申請', status: 'pending', path: '/certificates' },
]

// 暫存草稿寫入列表(mock;後端完成後改 API)
export function addDraft(draft: Activity): void {
  CLUB_ACTIVITIES.unshift(draft)
}

export function nextActivityId(): string {
  return `ACT-114-${String(40 + CLUB_ACTIVITIES.length).padStart(4, '0')}`
}

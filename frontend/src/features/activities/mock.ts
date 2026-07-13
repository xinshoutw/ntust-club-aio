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
    id: 'ACT-115-0003',
    name: '新生迎新博覽會',
    club: '資工系學會',
    type: '活動',
    date: '2026/09/08',
    timeRange: '10:00–16:00',
    location: '學生活動中心前廣場',
    status: 'approved',
    budget: [
      { id: 1, category: '印刷費', description: '攤位布置與宣傳物', selfFund: 3000, requestedSubsidy: 5000 },
    ],
    closeDeadline: '2026/10/08',
    closeDaysLeft: 26,
  },
  {
    id: 'ACT-115-0002',
    name: '秋季社課(一)Git 入門',
    club: '資工系學會',
    type: '社課',
    date: '2026/09/12',
    timeRange: '19:00–21:00',
    location: 'TR-311',
    status: 'approved',
    budget: [],
    closeDeadline: '2026/10/12',
    closeDaysLeft: 30,
    // 已暫存結案草稿(照片不隨草稿保存):示範重開預填
    closeDraft: {
      attendExpected: 40,
      attendRegistered: 35,
      attendShould: 35,
      attendActual: 31,
      highlights: 'Git 基本操作與協作流程實作',
      reviewMeeting: true,
      expense: 800,
      reflections: [
        { name: '林芷萱', dept: '資工一甲', text: '第一次用版本控制,收穫很多。' },
        { name: '周育丞', dept: '電機二乙', text: '分組演練很實用。' },
      ],
    },
  },
  {
    id: 'ACT-115-0001',
    name: '開學迎新工作坊',
    club: '資工系學會',
    type: '活動',
    date: '2026/09/05',
    timeRange: '13:00–17:00',
    location: '國際大樓 IB-202',
    status: 'closing_pending_advisor',
    budget: [
      { id: 1, category: '膳食費', description: '茶點', selfFund: 1500, requestedSubsidy: 2000 },
    ],
    report: {
      attendExpected: 60, attendRegistered: 58, attendShould: 58, attendActual: 55, attendLeave: 3,
      highlights: '新生分組任務與社團介紹', goals: '協助新生快速融入', others: '',
      reviewMeeting: true, reviewDate: '2026/09/07', expense: 3300, submittedAt: '2026/09/08',
      reflections: [
        { name: '簡妤安', dept: '資工一乙', text: '活動節奏安排得很好。' },
        { name: '郭承翰', dept: '工管一甲', text: '認識了很多跨系朋友。' },
        { name: '蔡沛穎', dept: '設計一甲', text: '分組任務很有趣。' },
      ],
    },
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
    report: {
      attendExpected: 120, attendRegistered: 115, attendShould: 115, attendActual: 110, attendLeave: 5,
      highlights: '迎新破冰、社團介紹', goals: '凝聚新生向心力', others: '順利完成',
      reviewMeeting: true, reviewDate: '2026/03/08', expense: 7800, submittedAt: '2026/03/09',
      reflections: [
        { name: '江安博', dept: '資工一甲', text: '認識很多新朋友,收穫滿滿。' },
        { name: '廖士鋐', dept: '資工一乙', text: '學長姐很親切,活動安排很用心。' },
        { name: '楊伯文', dept: '資工一丙', text: '破冰遊戲很有趣,融入得很快。' },
      ],
    },
  },
  {
    id: 'ACT-114-0010',
    name: 'Python 入門系列(一)',
    club: '資工系學會',
    type: '社課',
    date: '2026/04/09',
    status: 'closed',
    budget: [],
    report: {
      attendExpected: 40, attendRegistered: 36, attendShould: 36, attendActual: 33, attendLeave: 3,
      highlights: 'Python 基礎語法與實作練習', goals: '建立社員程式基礎', others: '',
      reviewMeeting: true, reviewDate: '2026/04/12', expense: 1200, submittedAt: '2026/04/13',
      reflections: [
        { name: '許庭瑄', dept: '企管二甲', text: '第一次寫程式,講解很清楚。' },
        { name: '高梓睿', dept: '機械一乙', text: '實作範例實用,期待下一堂。' },
        { name: '沈可欣', dept: '材料一甲', text: '助教協助很到位。' },
      ],
    },
  },
  {
    id: 'ACT-114-0008',
    name: '校際程式競賽',
    club: '資工系學會',
    type: '活動',
    isLarge: true,
    largeApproved: true,
    date: '2026/05/16',
    status: 'closed',
    budget: [
      { id: 1, category: '比賽獎勵品', description: '獎盃與獎品', selfFund: 12000, requestedSubsidy: 30000 },
    ],
    report: {
      attendExpected: 150, attendRegistered: 168, attendShould: 168, attendActual: 154, attendLeave: 14,
      highlights: '六校聯合競賽、企業參訪攤位', goals: '提升校際交流與實戰經驗', others: '媒體報導兩則',
      reviewMeeting: true, reviewDate: '2026/05/22', videoLink: 'https://youtu.be/mock-contest-2026',
      expense: 41200, submittedAt: '2026/05/23',
      reflections: [
        { name: '曾威宇', dept: '資工三甲', text: '第一次辦跨校活動,學到流程控管。' },
        { name: '鄭以樂', dept: '資工二乙', text: '出題與評測系統維運經驗寶貴。' },
        { name: '范植羽', dept: '電機二甲', text: '接待他校選手讓我更有自信。' },
        { name: '吳沛璇', dept: '工管三乙', text: '贊助洽談的經驗對未來很有幫助。' },
      ],
    },
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

// 編輯草稿/退回件後整筆置換(id 不變)
export function replaceActivity(next: Activity): void {
  const i = CLUB_ACTIVITIES.findIndex((a) => a.id === next.id)
  if (i >= 0) CLUB_ACTIVITIES[i] = next
  else CLUB_ACTIVITIES.unshift(next)
}

export function nextActivityId(): string {
  return `ACT-114-${String(40 + CLUB_ACTIVITIES.length).padStart(4, '0')}`
}

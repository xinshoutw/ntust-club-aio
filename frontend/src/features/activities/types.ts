import type { StatusKey } from '../../lib/status'
import type { EvalFile } from '../eval/types'

export interface BudgetItem {
  id: number
  category: string
  description: string
  selfFund: number
  requestedSubsidy: number
  approvedSubsidy?: number | null
}

export interface WorkItem {
  task: string
  owner: string
}

export interface Reflection {
  name: string
  dept: string
  text: string
}

// 活動成果調查(結案表單;除影片連結外全必填,心得 ≥3 筆)
export interface ActivityReport {
  memberCount: number // 實際社員人數(預期值=申請的社員人數)
  nonMemberCount: number // 實際非社員人數(預期值=申請的非社員人數)
  actualStart: string // 實際開始時間 HH:mm(預填申請的預估時間)
  actualEnd: string
  actualLocation: string // 實際地點(預填申請地點)
  highlights: string
  goals: string
  others: string
  reviewMeeting: boolean
  reviewDate?: string // 檢討會=是 時必填
  reviewAttendees?: number // 與會人數(檢討會=是 時必填)
  reviewTopics?: string // 討論事項(檢討會=是 時必填)
  reviewConclusion?: string // 內容決議(檢討會=是 時必填)
  videoLink?: string // 唯一選填欄位
  expense: number
  reflections: Reflection[]
  submittedAt?: string
}

export interface Activity {
  id: string
  name: string
  club: string
  type: '社課或會議' | '活動'
  isLarge?: boolean // 社團申請大型活動
  largeApproved?: boolean // 管理員認可後行政分才享大型 ×3 加權
  date: string // 開始日期
  endDate?: string // 結束日期;未跨日可省略(視同 date)
  timeRange?: string // '開始時間–結束時間'(跨日時分屬 date/endDate 兩天)
  location?: string
  participantsIn?: number
  participantsOut?: number
  content?: string
  works?: WorkItem[]
  status: StatusKey
  budget: BudgetItem[]
  report?: ActivityReport // 已送結案後存在
  closeDraft?: Partial<ActivityReport> // 結案草稿(不含照片檔)
  rejectReason?: { by: string; date: string; text: string }
  closeDeadline?: string
  closeDaysLeft?: number
  submittedAt?: string
  submittedBy?: string
  attachments?: EvalFile[] // 申請附件(企劃書、估價單等,可預覽/下載)
}

// 經費科目與提示已移至後端 system_settings(2026-07-17);由 /club/config 供給,
// 前端不再維護硬編碼清單(見 api/clubConfig.ts)

export function budgetTotals(items: BudgetItem[]): { self: number; requested: number } {
  return items.reduce(
    (acc, item) => ({
      self: acc.self + (item.selfFund || 0),
      requested: acc.requested + (item.requestedSubsidy || 0),
    }),
    { self: 0, requested: 0 },
  )
}

export const fmtMoney = (n: number): string => `$${n.toLocaleString('en-US')}`

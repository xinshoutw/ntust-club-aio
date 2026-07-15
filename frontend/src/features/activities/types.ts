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
  memberCount: number // 實際社員人數(預期值=申請的校內人數)
  nonMemberCount: number // 實際非社員人數(預期值=申請的校外人數)
  actualStart: string // 實際開始時間 HH:mm(預填申請的預估時間)
  actualEnd: string
  actualLocation: string // 實際地點(預填申請地點)
  highlights: string
  goals: string
  others: string
  reviewMeeting: boolean
  reviewDate?: string // 檢討會=是 時必填
  videoLink?: string // 唯一選填欄位
  expense: number
  reflections: Reflection[]
  submittedAt?: string
}

export interface Activity {
  id: string
  name: string
  club: string
  type: '社課' | '活動' | '會議'
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

export const BUDGET_CATEGORIES = [
  '指導老師/教練費',
  '保險費',
  '交通費',
  '膳食費',
  '印刷費',
  '比賽獎勵品',
  '雜支',
  '其他',
  '活動收入',
]

// 選定科目時顯示於該列下方的提示
export const BUDGET_HINTS: Record<string, string> = {
  '指導老師/教練費': '請在下方加註講師相關專業工作背景',
  保險費: '保額上限為新台幣 100 萬元,申請學校補助要保人為國立臺灣科技大學',
  交通費: '若租賃遊覽車請於結案時上傳行照、駕照及租賃契約',
  雜支: '請在下方註明細項內容',
  其他: '請在下方註明細項內容',
  活動收入: '請在下方註明活動預計收入總金額',
}

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

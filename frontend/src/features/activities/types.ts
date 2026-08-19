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

/** staff_text → 工作分配。後端只存文字,格式是前端約定的「每行 項目:負責人」;
 *  舊系統的項目常是「職稱:工作內容」的長句,故只切**最後**一個半形冒號。 */
export const staffTextToWorks = (text: string): WorkItem[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.lastIndexOf(':')
      return i >= 0 ? { task: line.slice(0, i), owner: line.slice(i + 1) } : { task: line, owner: '' }
    })

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

// 經費科目與提示已移至後端 system_settings;由 /club/config 供給,
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

/** 工作分配的項目欄對齊寬度(全形字數≈em)。
 *
 * 以「非離群」的最長項目為準:與最短相差超過 3 字的項目不參與對齊。舊系統的項目是
 * 「職稱:工作內容」的長句(可到 23 字),讓它決定寬度的話,其餘「文化指揮」這類短項目
 * 後面會空掉一大截;長項目就讓它自己撐開,只是不再拖著所有列一起縮排。
 */
export const taskAlignEm = (tasks: readonly string[]): number => {
  const lens = tasks.map((t) => [...t].length).filter((n) => n > 0).sort((x, y) => x - y)
  if (!lens.length) return 0
  const within = lens.filter((n) => n - lens[0] <= 3)
  return within[within.length - 1]
}

/** 表格數字欄寬:以最寬的一個數字為準(1ch=一個數字寬,逗號更窄所以一定夠),另加內距。
 *  下限 4ch 是給欄名(「自籌」這類兩個全形字)留的,否則整欄都是 0 時標題會被擠。 */
export const numColWidth = (values: readonly number[], padPx: number): string => {
  const chars = Math.max(4, ...values.map((v) => v.toLocaleString().length))
  return `calc(${chars}ch + ${padPx}px)`
}

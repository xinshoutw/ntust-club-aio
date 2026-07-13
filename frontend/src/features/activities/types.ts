import type { StatusKey } from '../../lib/status'

export interface BudgetItem {
  id: number
  category: string
  description: string
  selfFund: number
  requestedSubsidy: number
  approvedSubsidy?: number | null
}

export interface Activity {
  id: string
  name: string
  club: string
  type: '社課' | '活動' | '會議'
  date: string
  timeRange?: string
  location?: string
  participantsIn?: number
  participantsOut?: number
  status: StatusKey
  budget: BudgetItem[]
  rejectReason?: { by: string; date: string; text: string }
  closeDeadline?: string
  closeDaysLeft?: number
  submittedAt?: string
  submittedBy?: string
  attachments?: string[]
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

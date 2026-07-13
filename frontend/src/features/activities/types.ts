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
  type: '一般活動' | '社課' | '大型活動'
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
  '演講/裁判費',
  '指導老師/教練費',
  '保險費',
  '交通費',
  '印刷費',
  '比賽獎勵品',
  '其他',
]

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

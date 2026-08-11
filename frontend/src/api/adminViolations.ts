// 行政端違規勸導管理 API 層(權限鍵 aviol)。
// 伺服器端分頁:漏斗的多選值直接送後端(status/item/filler_id 皆收多值,item 多值=命中任一項),
// 篩選選項走 /admin/violations/options —— 取自實際開立過的紀錄,不是當前這一頁。
// 銷案期限/逾期截止皆為後端推導欄位(resolve_deadline / resolve_expired),前端不再自行推導。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'

export type ViolationStatusKey = 'violation_open' | 'violation_resolved'
export type ViolationStatus = 'open' | 'resolved'

export interface AdminViolation {
  id: number
  club: string
  date: string // 開立日 YYYY/MM/DD
  location: string
  items: string[]
  other?: string // 其他項目說明
  filler: string // 填寫人姓名
  status: ViolationStatusKey
  resolveNote?: string
  deadline: string // 銷案期限 YYYY/MM/DD(開立日 +1 個月;後端推導)
  expired: boolean // 已逾銷案期限(後端推導;逾期停用銷案)
}

interface AdminViolationOut {
  id: number
  club_name: string
  occurred_on: string
  location: string
  items: string[]
  other: string | null
  filler_name: string
  status: ViolationStatus
  resolve_note: string | null
  resolve_deadline: string | null
  resolve_expired: boolean
}

const toViolation = (v: AdminViolationOut): AdminViolation => ({
  id: v.id,
  club: v.club_name,
  date: dayjs(v.occurred_on).format('YYYY/MM/DD'),
  location: v.location,
  items: v.items,
  other: v.other ?? undefined,
  filler: v.filler_name,
  status: v.status === 'open' ? 'violation_open' : 'violation_resolved',
  resolveNote: v.resolve_note ?? undefined,
  deadline: v.resolve_deadline ? dayjs(v.resolve_deadline).format('YYYY/MM/DD') : '',
  expired: v.resolve_expired,
})

export interface AdminViolationListParams {
  items?: string[]
  fillerIds?: number[]
  statuses?: ViolationStatus[]
  /** 逾期篩選(後端僅對未銷案生效):true=已截止、false=未逾期 */
  expired?: boolean
  /** 排序白名單:date/location/items/filler/deadline/status;前綴 - 為降冪 */
  sort?: string
  page: number
  pageSize: number
}

export interface ViolationOptions {
  items: string[]
  fillers: { id: number; name: string }[]
}

export const ALL_VIOLATION_STATUSES: ViolationStatus[] = ['open', 'resolved']
export const VIOLATION_STATUS_LABEL: Record<ViolationStatus, string> = {
  open: '未銷案',
  resolved: '已銷案',
}
export const DEADLINE_LABELS = ['未逾期', '已截止']

/**
 * 兩個漏斗(狀態、銷案期限)的選取值 → 查詢參數。
 *
 * 期限漏斗只對未銷案有意義(已銷案該欄顯示「—」,兩個選項都不吻合):只選一邊 →
 * expired 布林(後端一併限未銷案);兩邊都選 → 等於「僅未銷案」。兩個漏斗取交集,
 * 交集為空(如「已銷案」+ 期限兩項全選)是合法選擇,結果就是沒有列 —— 呼叫端據此不發查詢,
 * 不可退回「不帶 status」的全部。填寫人同理:選了名字卻對不到 id 一律強制空集。
 */
export function violationFilterParams(sel: {
  statusLabels: string[]
  deadlineLabels: string[]
  fillerNames: string[]
  fillers: { id: number; name: string }[]
}): { statuses: ViolationStatus[]; expired?: boolean; fillerIds?: number[] } {
  const byStatus = sel.statusLabels.length
    ? ALL_VIOLATION_STATUSES.filter((s) => sel.statusLabels.includes(VIOLATION_STATUS_LABEL[s]))
    : ALL_VIOLATION_STATUSES
  const byDeadline: ViolationStatus[] =
    sel.deadlineLabels.length === 2 ? ['open'] : ALL_VIOLATION_STATUSES
  const fillerIds = sel.fillerNames.length
    ? sel.fillers.filter((f) => sel.fillerNames.includes(f.name)).map((f) => f.id)
    : undefined
  return {
    statuses: byStatus.filter((s) => byDeadline.includes(s)),
    expired: sel.deadlineLabels.length === 1 ? sel.deadlineLabels[0] === '已截止' : undefined,
    fillerIds: fillerIds && fillerIds.length === 0 ? [-1] : fillerIds,
  }
}

const keys = {
  all: ['adminViolations'] as const,
  list: (p: AdminViolationListParams) => ['adminViolations', 'list', p] as const,
  options: ['adminViolations', 'options'] as const,
}

export function useAdminViolations(p: AdminViolationListParams, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.list(p),
    enabled: opts.enabled ?? true,
    queryFn: () =>
      apiPaged<AdminViolationOut[]>(
        `/admin/violations${qs({
          status: p.statuses,
          item: p.items,
          filler_id: p.fillerIds?.map(String),
          expired: p.expired,
          sort: p.sort,
          page: p.page,
          page_size: p.pageSize,
        })}`,
      ).then(({ data, total }) => ({ rows: data.map(toViolation), total })),
    // 不留上一份:query key 含篩選條件,沿用舊資料等於把別的篩選結果當成這次的
  })
}

export function useViolationOptions() {
  return useQuery({
    queryKey: keys.options,
    queryFn: () => api<ViolationOptions>('/admin/violations/options'),
  })
}

export function useResolveViolation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      api<AdminViolationOut>(`/admin/violations/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.all })
      void qc.invalidateQueries({ queryKey: ['adminOverview'] }) // 未銷案違規數字卡
    },
  })
}

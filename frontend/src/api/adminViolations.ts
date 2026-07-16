// 行政端違規勸導管理 API 層(權限鍵 aviol)。
// 後端排序/篩選為單值參數(sort、status、item、filler_id…),與 UI 的多選漏斗不合,
// 故一次抓全量(違規量級小)後沿用前端排序/篩選;預設排序=後端預設(未銷案在前、時間升冪)。
// 銷案期限/逾期截止皆為後端推導欄位(resolve_deadline / resolve_expired),前端不再自行推導。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api } from './client'
import { fetchAllPages } from './fetchAll'

export type ViolationStatusKey = 'violation_open' | 'violation_resolved'

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
  status: 'open' | 'resolved'
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

const keys = {
  all: ['adminViolations'] as const,
  list: ['adminViolations', 'list'] as const,
}

export function useAdminViolations() {
  return useQuery({
    queryKey: keys.list,
    queryFn: () =>
      fetchAllPages<AdminViolationOut>('/admin/violations').then((rows) => rows.map(toViolation)),
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
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.all }),
  })
}

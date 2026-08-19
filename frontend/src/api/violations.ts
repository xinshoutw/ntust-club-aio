// 違規勸導 API 層:銷案期限/逾期由後端推導,前端僅顯示
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiPaged, qs } from './client'
import type { StatusKey } from '../lib/status'

export interface Violation {
  id: number
  date: string
  location: string
  items: string[]
  note?: string
  status: StatusKey
  /** 銷案期限(未銷案才有);逾期即截止,不再受理銷案 */
  deadline?: string
  expired: boolean
}

interface ViolationOut {
  id: number
  occurred_on: string
  location: string
  items: string[]
  other: string | null
  status: 'open' | 'resolved'
  resolve_note: string | null
  created_at: string
  resolve_deadline: string | null
  resolve_expired: boolean
}

const toViolation = (v: ViolationOut): Violation => ({
  id: v.id,
  date: dayjs(v.occurred_on).format('YYYY/MM/DD'),
  location: v.location,
  items: v.other ? [...v.items, v.other] : v.items,
  note: v.resolve_note ?? undefined,
  status: v.status === 'resolved' ? 'violation_resolved' : 'violation_open',
  deadline: v.resolve_deadline ? dayjs(v.resolve_deadline).format('YYYY/MM/DD') : undefined,
  expired: v.resolve_expired,
})

export function useViolations(p: { page: number; pageSize: number }) {
  return useQuery({
    queryKey: ['violations', 'list', p],
    queryFn: () =>
      apiPaged<ViolationOut[]>(`/club/violations${qs({ page: p.page, page_size: p.pageSize })}`).then(
        ({ data, total }) => ({ violations: data.map(toViolation), total }),
      ),
    placeholderData: keepPreviousData,
  })
}

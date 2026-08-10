// 場地不開放規則 API 層(Rule Page,僅 super):GET/POST/DELETE /admin/venue-rules
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { api, qs } from './client'

export interface VenueRule {
  id: number
  venueId: number
  venueName: string
  startDate: string // YYYY/MM/DD
  endDate: string
  /** ISO 星期(1=一…7=日);undefined=區間內每天 */
  weekdays?: number[]
  periods: string[]
  reason: string
}

interface VenueRuleOut {
  id: number
  venue_id: number
  venue_name: string
  start_date: string
  end_date: string
  weekdays: number[] | null
  periods: string[]
  reason: string
  created_at: string
}

const toRule = (r: VenueRuleOut): VenueRule => ({
  id: r.id,
  venueId: r.venue_id,
  venueName: r.venue_name,
  startDate: dayjs(r.start_date).format('YYYY/MM/DD'),
  endDate: dayjs(r.end_date).format('YYYY/MM/DD'),
  weekdays: r.weekdays ?? undefined,
  periods: r.periods,
  reason: r.reason,
})

const keys = {
  all: ['adminVenueRules'] as const,
  list: (venueId?: number) => ['adminVenueRules', 'list', venueId ?? null] as const,
}

export function useVenueRules(venueId?: number) {
  return useQuery({
    queryKey: keys.list(venueId),
    queryFn: () =>
      api<VenueRuleOut[]>(`/admin/venue-rules${qs({ venue_id: venueId })}`).then((rows) =>
        rows.map(toRule),
      ),
  })
}

export interface VenueRuleInput {
  venueId: number
  range: [Dayjs, Dayjs]
  weekdays?: number[]
  periods: string[]
  reason: string
}

export function useVenueRuleMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.all })
    void qc.invalidateQueries({ queryKey: ['adminBookings'] }) // 場況圖同步刷新
  }
  const create = useMutation({
    mutationFn: (b: VenueRuleInput) =>
      api<VenueRuleOut>('/admin/venue-rules', {
        method: 'POST',
        body: JSON.stringify({
          venue_id: b.venueId,
          start_date: b.range[0].format('YYYY-MM-DD'),
          end_date: b.range[1].format('YYYY-MM-DD'),
          weekdays: b.weekdays?.length ? b.weekdays : null,
          periods: b.periods,
          reason: b.reason,
        }),
      }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: number) => api<null>(`/admin/venue-rules/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  return { create, remove }
}

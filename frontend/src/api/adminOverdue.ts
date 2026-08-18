// 行政端逾期追蹤與停權(權限鍵 aoverdue):歸還提醒、停權/解除;
// 逾期列表沿用 adminClubOverview 的 useAdminEquipmentLoanList({ status: 'overdue' })
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type Dayjs } from 'dayjs'
import { api } from './client'
import { adminClubKeys, fetchAdminClubDetail, fetchAdminClubs } from './adminClubs'
import { suspendedNow } from '../lib/status'

export interface SuspendedClub {
  id: number
  name: string
  until: string // YYYY/MM/DD
  reason: string
}

// 後端無停權清單專屬端點:以 GET /admin/clubs 篩 suspended_until 非空,
// 再逐社取詳情補停權原因(列表 schema 不含 suspend_reason;停權中社團極少)
export function useSuspendedClubs() {
  return useQuery({
    queryKey: adminClubKeys.suspended,
    queryFn: async (): Promise<SuspendedClub[]> => {
      const clubs = await fetchAdminClubs()
      // 停權日已過的社團實際上早就不再被擋,不該再列在停權中(判定見 lib/status)
      const suspended = clubs.filter((c) => suspendedNow(c.suspendedUntil))
      const details = await Promise.all(suspended.map((c) => fetchAdminClubDetail(c.id)))
      return details.map((d) => ({
        id: d.id,
        name: d.name,
        until: d.suspendedUntil ?? '',
        reason: d.suspendReason ?? '',
      }))
    },
  })
}

export function useOverdueMutations() {
  const qc = useQueryClient()
  // 停權寫在社團主檔(suspended_until/suspend_reason)→ 刷新主檔整域(含停權清單)
  const invalidateClubs = () => void qc.invalidateQueries({ queryKey: adminClubKeys.all })
  const remind = useMutation({
    mutationFn: (loanId: number) =>
      api<null>(`/admin/equipment-loans/${loanId}/remind`, { method: 'POST' }),
  })
  const suspend = useMutation({
    mutationFn: ({ id, until, reason }: { id: number; until: Dayjs; reason: string }) =>
      api<unknown>(`/admin/clubs/${id}/suspend`, {
        method: 'POST',
        // 日期轉換集中於 api 層:Dayjs → ISO(YYYY-MM-DD)
        body: JSON.stringify({ until: until.format('YYYY-MM-DD'), reason }),
      }),
    onSuccess: invalidateClubs,
  })
  const lift = useMutation({
    mutationFn: (id: number) => api<unknown>(`/admin/clubs/${id}/suspend`, { method: 'DELETE' }),
    onSuccess: invalidateClubs,
  })
  return { remind, suspend, lift }
}

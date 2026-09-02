// 政府行事曆假日 API 層(權限鍵 asetting):GET/POST/DELETE /admin/holidays。
// 全量回傳(週六日不入表,一年只有十幾筆);日期即主鍵,同一天再送一次是改名而非衝突。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import { useInvalidateBadges } from './badges'

export interface Holiday {
  /** ISO 日期(YYYY-MM-DD);主鍵 */
  date: string
  name: string
}

const keys = { all: ['adminHolidays'] as const }

export function useHolidays() {
  return useQuery({
    queryKey: keys.all,
    queryFn: () => api<Holiday[]>('/admin/holidays'),
  })
}

export function useHolidayMutations() {
  const qc = useQueryClient()
  const invalidateBadges = useInvalidateBadges()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.all })
    // 逾期數是「結束日之隔天上班日」推導出來的:改了放假日就換一批單子逾期,
    // 而側欄徽章 staleTime 60 秒,不主動失效的話會與逾期頁的數字打架
    invalidateBadges()
  }

  const save = useMutation({
    mutationFn: (h: Holiday) =>
      api<Holiday>('/admin/holidays', { method: 'POST', body: JSON.stringify(h) }),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (date: string) => api<null>(`/admin/holidays/${date}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  return { save, remove }
}

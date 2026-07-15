import dayjs, { type Dayjs } from 'dayjs'
import type { Activity } from './types'

// 時間區間分隔符:系統寫 en dash,匯入/舊資料可能是 hyphen 或 em dash
export const TIME_RANGE_SEP = /[–—-]/

// 活動結束時間:結束日期 + timeRange 的結束時刻(未填時間則以當日 23:59 計)
export function activityEnded(a: Activity, now: Dayjs = dayjs()): boolean {
  const end = (a.timeRange ?? '').split(TIME_RANGE_SEP)[1]?.trim()
  const stamp = dayjs(`${a.endDate ?? a.date} ${end || '23:59'}`, 'YYYY/MM/DD HH:mm')
  return stamp.isValid() ? stamp.isBefore(now) : false
}

// 活動日期區間顯示:同日只顯示單一日期
export function dateRangeText(a: Pick<Activity, 'date' | 'endDate'>): string {
  return a.endDate && a.endDate !== a.date ? `${a.date} – ${a.endDate}` : a.date
}

// 結案資格:已核准且活動已結束
export const canClose = (a: Activity): boolean => a.status === 'approved' && activityEnded(a)

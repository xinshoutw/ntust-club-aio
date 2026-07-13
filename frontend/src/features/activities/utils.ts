import dayjs, { type Dayjs } from 'dayjs'
import type { Activity } from './types'

// 時間區間分隔符:系統寫 en dash,匯入/舊資料可能是 hyphen 或 em dash
export const TIME_RANGE_SEP = /[–—-]/

// 活動結束時間:date + timeRange 的結束時刻(未填時間則以當日 23:59 計)
export function activityEnded(a: Activity, now: Dayjs = dayjs()): boolean {
  const end = (a.timeRange ?? '').split(TIME_RANGE_SEP)[1]?.trim()
  const stamp = dayjs(`${a.date} ${end || '23:59'}`, 'YYYY/MM/DD HH:mm')
  return stamp.isValid() ? stamp.isBefore(now) : false
}

// 結案資格:已核准且活動已結束
export const canClose = (a: Activity): boolean => a.status === 'approved' && activityEnded(a)

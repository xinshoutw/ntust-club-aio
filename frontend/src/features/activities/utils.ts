import dayjs, { type Dayjs } from 'dayjs'

// 時間區間分隔符:系統寫 en dash,匯入/舊資料可能是 hyphen 或 em dash
export const TIME_RANGE_SEP = /[–—-]/

// 活動日期區間顯示:同日只顯示單一日期;部分填寫的草稿可能無日期
export function dateRangeText(a: { date?: string; endDate?: string }): string {
  if (!a.date) return '—'
  return a.endDate && a.endDate !== a.date ? `${a.date} – ${a.endDate}` : a.date
}

// 活動結束時刻:結束日(未填=開始日)+ timeRange 結束時刻(未填以 23:59 計)
// 與後端 activity_service.end_datetime 同規則;無日期(部分草稿)回 undefined
export function activityEndAt(a: { date?: string; endDate?: string; timeRange?: string }): Dayjs | undefined {
  const day = a.endDate ?? a.date
  if (!day) return undefined
  const end = a.timeRange?.split(TIME_RANGE_SEP)[1]?.trim()
  const parsed = dayjs(`${day} ${end || '23:59'}`, 'YYYY/MM/DD HH:mm')
  return parsed.isValid() ? parsed : dayjs(`${day} 23:59`, 'YYYY/MM/DD HH:mm')
}

/** 活動是否已結束(借用「關聯活動」下拉排除已結束者) */
export const activityEnded = (a: { date?: string; endDate?: string; timeRange?: string }): boolean => {
  const end = activityEndAt(a)
  return !!end && end.isBefore(dayjs())
}

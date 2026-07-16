// 時間區間分隔符:系統寫 en dash,匯入/舊資料可能是 hyphen 或 em dash
export const TIME_RANGE_SEP = /[–—-]/

// 活動日期區間顯示:同日只顯示單一日期
export function dateRangeText(a: { date: string; endDate?: string }): string {
  return a.endDate && a.endDate !== a.date ? `${a.date} – ${a.endDate}` : a.date
}

// 時間區間分隔符:系統寫 en dash,匯入/舊資料可能是 hyphen 或 em dash
export const TIME_RANGE_SEP = /[–—-]/

// 活動日期區間顯示:同日只顯示單一日期;部分填寫的草稿可能無日期
export function dateRangeText(a: { date?: string; endDate?: string }): string {
  if (!a.date) return '—'
  return a.endDate && a.endDate !== a.date ? `${a.date} – ${a.endDate}` : a.date
}

// 「活動是否已結束」的判定只留後端一份(GET /club/activities?ended=false):
// 前端這份複本原本只服務借用的關聯活動下拉,兩份規則一有出入就是下拉少一筆或多一筆

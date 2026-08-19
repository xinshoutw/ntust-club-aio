// Select 空選單的文案:選項查詢失敗時不能顯示成「沒有這種東西」。
// AntD 預設的「暫無資料」與各頁硬寫的「無審核通過之活動」都是同一種誤導 ——
// 使用者會去找自己哪裡沒建資料,而其實是那支查詢掛了。
// 載入中也要讓位:給了 notFoundContent,AntD 的 loading 就不再換成 spinner
// (與 lib/counts.countText 同一個道理 —— 空與失敗都不是「確定的答案」)。
// 選單裡不放重試鈕(popup 內的互動元件太脆),改講「重新整理頁面」。
export const notFoundText = (
  query: { isPending: boolean; isError: boolean },
  empty: string,
  what: string,
): string => {
  if (query.isError) return `${what}載入失敗,請重新整理頁面`
  if (query.isPending) return `${what}載入中…`
  return empty
}

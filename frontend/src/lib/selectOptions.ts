// Select 空選單的文案:選項查詢失敗時不能顯示成「沒有這種東西」。
// AntD 預設的「暫無資料」與各頁硬寫的「無審核通過之活動」都是同一種誤導 ——
// 使用者會去找自己哪裡沒建資料,而其實是那支查詢掛了。
// 選單裡不放重試鈕(popup 內的互動元件太脆),改講「重新整理頁面」。
export const notFoundText = (query: { isError: boolean }, empty: string, what: string): string =>
  query.isError ? `${what}載入失敗,請重新整理頁面` : empty

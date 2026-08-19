// 標題上的統計數字:查詢還沒回來或失敗時一律 —,不要拿 `?? 0` 當預設值
// (內容早已換成 Skeleton 或錯誤說明,而「共 0 筆」看起來就是一個確定的答案)
export const countText = (
  n: number,
  ...queries: { isPending: boolean; isError: boolean }[]
): string => (queries.some((q) => q.isPending || q.isError) ? '—' : n.toLocaleString())

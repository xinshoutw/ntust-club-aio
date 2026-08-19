// 自動增列共用:只在焦點真正離開該列時才整理空列(列內欄位間移動不觸發)
export const blurLeavesRow = (e: React.FocusEvent<HTMLElement>) =>
  !e.currentTarget.contains(e.relatedTarget as Node | null)

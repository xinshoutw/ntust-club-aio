// 瀏覽器另存:blob → 隱藏的 <a download> → 點擊。
// a.click() 只是排程下載,不是同步開始 —— 同步 revoke 會讓 Safari 與部分 Firefox 版本
// 在下載真正開始前就失去來源(按了沒反應)。延後收,頁面關閉時本來就會一併釋放
const REVOKE_DELAY_MS = 60_000

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

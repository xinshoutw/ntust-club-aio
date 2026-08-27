// CSV 匯出:欄位含逗號/引號/換行時加引號跳脫;UTF-8 BOM 讓 Excel 正確辨識

// Excel 公式注入中和:= + - @ 開頭的欄位前置單引號,避免開檔即執行公式
export const neutralizeFormula = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)

// 單獨的 CR 也要引號:Excel 與多數解析器把它當換行,不引就能從一格值切出新的一列,
// 而那一列的第一格繞過了 neutralizeFormula
const escapeField = (raw: string): string => {
  const v = neutralizeFormula(raw)
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(escapeField).join(',')).join('\n')
}

// a.click() 只是排程下載,不是同步開始 —— 同步 revoke 會讓 Safari 與部分 Firefox 版本
// 在下載真正開始前就失去來源(按了沒反應)。延後收,頁面關閉時本來就會一併釋放
const REVOKE_DELAY_MS = 60_000

export function downloadCsv(filename: string, rows: string[][]): void {
  const url = URL.createObjectURL(new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

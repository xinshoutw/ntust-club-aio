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

export function downloadCsv(filename: string, rows: string[][]): void {
  const url = URL.createObjectURL(new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

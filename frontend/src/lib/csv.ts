// CSV 匯出:欄位含逗號/引號/換行時加引號跳脫;UTF-8 BOM 讓 Excel 正確辨識
const escapeField = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

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

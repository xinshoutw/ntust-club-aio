// 評審端基礎原型 mock(2026-07-17):接後端時整檔移除。
// 實際:分組與指派來自 eval_groups*、評分細項配分依各獎項評分標準 PDF(data-model §3.8);
// 此處細項僅為原型示意,配分待接線時以後端為準。

export interface ScoreItem {
  key: string
  label: string
  max: number
}

export interface AwardAssignment {
  key: string // 獎項代號
  label: string
  items: ScoreItem[]
  clubs: string[] // 分組內受評社團
}

export const ASSIGNMENTS: AwardAssignment[] = [
  {
    key: 'finance',
    label: '最佳財務獎',
    items: [
      { key: 'ledger', label: '帳目完整性', max: 30 },
      { key: 'budget', label: '預算執行', max: 25 },
      { key: 'receipts', label: '憑證保存', max: 25 },
      { key: 'present', label: '現場簡報', max: 20 },
    ],
    clubs: ['資工系學會', '熱舞社', '攝影社', '康輔社'],
  },
  {
    key: 'activity',
    label: '最佳活動獎',
    items: [
      { key: 'plan', label: '活動企劃', max: 40 },
      { key: 'execute', label: '活動執行', max: 35 },
      { key: 'budget_use', label: '經費運用', max: 5 },
      { key: 'present', label: '現場簡報', max: 20 },
    ],
    clubs: ['登山社', '吉他社', '合唱團'],
  },
  {
    key: 'leader',
    label: '最佳社團負責人獎',
    items: [
      { key: 'lead', label: '領導表現', max: 45 },
      { key: 'engage', label: '社務參與', max: 35 },
      { key: 'present', label: '現場簡報', max: 20 },
    ],
    clubs: ['網球社', '熱舞社'],
  },
]

export interface DoneRow {
  award: string
  club: string
  total: number
  date: string // 完成時間 YYYY/MM/DD HH:mm
}

export const DONE_ROWS: DoneRow[] = [
  { award: '最佳財務獎', club: '資工系學會', total: 87, date: '2026/07/10 14:20' },
  { award: '最佳活動獎', club: '登山社', total: 78, date: '2026/07/11 09:45' },
]

import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  sub?: ReactNode
  extra?: ReactNode
}

export default function PageHeader({ title, sub, extra }: PageHeaderProps) {
  // minHeight 對齊全域 controlHeight(40):有無下拉/按鈕的頁面 header 皆等高
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', minHeight: 40 }}>
      <h1 style={{ margin: 0, fontWeight: 600, fontSize: 24 }}>{title}</h1>
      {sub && <div style={{ fontSize: 13, color: 'var(--steel)' }}>{sub}</div>}
      {extra && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>{extra}</div>}
    </div>
  )
}

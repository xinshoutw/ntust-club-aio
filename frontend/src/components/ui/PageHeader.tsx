import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  sub?: ReactNode
  extra?: ReactNode
}

export default function PageHeader({ title, sub, extra }: PageHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <h1 style={{ margin: 0, fontWeight: 600, fontSize: 24 }}>{title}</h1>
      {sub && <div style={{ fontSize: 13, color: 'var(--steel)' }}>{sub}</div>}
      {extra && <div style={{ marginLeft: 'auto' }}>{extra}</div>}
    </div>
  )
}

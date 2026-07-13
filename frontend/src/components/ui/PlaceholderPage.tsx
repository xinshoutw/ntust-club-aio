import { useLocation } from 'react-router'
import PageHeader from './PageHeader'

export default function PlaceholderPage({ title }: { title: string }) {
  const location = useLocation()
  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader title={title} />
      <div
        className="card"
        style={{
          marginTop: 20,
          padding: '48px 24px',
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--steel)',
        }}
      >
        此頁面開發中({location.pathname})。
      </div>
    </div>
  )
}

import { Link } from 'react-router'
import PageHeader from '../../components/ui/PageHeader'
import { REVIEW_ITEMS } from './reviewMock'
import { VIOLATIONS } from '../violations/mock'
import { EQUIPMENT_LOANS, ROOM_REQUESTS, VENUE_BOOKINGS } from '../bookings/mock'

interface Stat {
  label: string
  count: number
  path: string
}

export default function AdminHomePage() {
  const stats: Stat[] = [
    { label: '待審活動申請', count: REVIEW_ITEMS.filter((i) => i.status === 'pending_advisor').length, path: '/admin/review' },
    { label: '待審結案', count: 2, path: '/admin/close-review' },
    { label: '待審固定借用', count: ROOM_REQUESTS.filter((r) => r.status === 'pending').length, path: '/admin/rooms' },
    { label: '待審臨時借用', count: VENUE_BOOKINGS.filter((v) => v.status === 'pending').length + EQUIPMENT_LOANS.filter((l) => l.status === 'pending').length, path: '/admin/bookings' },
    { label: '逾期未還器材', count: EQUIPMENT_LOANS.filter((l) => l.status === 'overdue').length, path: '/admin/overdue' },
    { label: '未銷案違規', count: VIOLATIONS.filter((v) => v.status === 'violation_open').length, path: '/admin/violations' },
  ]

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader title="總覽" sub="114 學年第 2 學期" />
      <div
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {stats.map((s) => (
          <Link
            key={s.label}
            to={s.path}
            className="card"
            style={{ padding: '18px 20px', display: 'block', textDecoration: 'none', color: 'var(--ink)' }}
          >
            <div style={{ fontSize: 13, color: 'var(--steel)' }}>{s.label}</div>
            <div
              className="num"
              style={{ fontSize: 28, fontWeight: 600, marginTop: 6, color: s.count > 0 ? 'var(--seal)' : 'var(--ink)' }}
            >
              {s.count}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

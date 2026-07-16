import { Link } from 'react-router'
import type { UseQueryResult } from '@tanstack/react-query'
import PageHeader from '../../components/ui/PageHeader'
import { CURRENT_SEMESTER } from '../../lib/semester'
import {
  useOpenViolationTotal,
  useOverdueLoanTotal,
  usePendingActivityTotal,
  usePendingCloseTotal,
  usePendingRoomBookingTotal,
  usePendingTempBookingTotal,
} from '../../api/adminActivities'

interface Stat {
  label: string
  query: UseQueryResult<number>
  path: string
}

// 學期顯示詞:114-2 → 114 學年第 2 學期
const semesterLabel = (s: string): string => {
  const [year, term] = s.split('-')
  return `${year} 學年第 ${term} 學期`
}

export default function AdminHomePage() {
  // 各卡獨立查詢:無該模組權限(403)僅該卡顯示 —,不影響其他卡
  const stats: Stat[] = [
    { label: '待審活動申請', query: usePendingActivityTotal(), path: '/admin/review' },
    { label: '待審結案', query: usePendingCloseTotal(), path: '/admin/close-review' },
    { label: '待審固定借用', query: usePendingRoomBookingTotal(), path: '/admin/rooms' },
    { label: '待審臨時借用', query: usePendingTempBookingTotal(), path: '/admin/bookings' },
    { label: '逾期未還器材', query: useOverdueLoanTotal(), path: '/admin/overdue' },
    { label: '未銷案違規', query: useOpenViolationTotal(), path: '/admin/violations' },
  ]

  return (
    <div>
      <PageHeader title="總覽" sub={semesterLabel(CURRENT_SEMESTER)} />
      <div
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {stats.map((s) => {
          const count = s.query.data
          return (
            <Link
              key={s.label}
              to={s.path}
              className="card click-tint"
              style={{ padding: '18px 20px', display: 'block', textDecoration: 'none', color: 'var(--ink)' }}
            >
              <div style={{ fontSize: 13, color: 'var(--steel)' }}>{s.label}</div>
              <div
                className="num"
                style={{ fontSize: 28, fontWeight: 600, marginTop: 6, color: (count ?? 0) > 0 ? 'var(--seal)' : 'var(--ink)' }}
              >
                {count ?? '—'}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

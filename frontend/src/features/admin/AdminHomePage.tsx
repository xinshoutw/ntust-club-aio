import { Link } from 'react-router'
import type { UseQueryResult } from '@tanstack/react-query'
import PageHeader from '../../components/ui/PageHeader'
import { CURRENT_SEMESTER } from '../../lib/semester'
import { useAuth } from '../../app/auth'
import { canAccessAdminPath } from '../../lib/permissions'
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
  const { user } = useAuth()
  // 依 permissions 過濾:無權限的卡不顯示也不打 API(hooks 須無條件呼叫,以 enabled 擋)
  const can = (path: string) => canAccessAdminPath(user, path)
  const stats: Stat[] = [
    { label: '待審活動申請', query: usePendingActivityTotal(can('/admin/review')), path: '/admin/review' },
    { label: '待審結案', query: usePendingCloseTotal(can('/admin/close-review')), path: '/admin/close-review' },
    { label: '待審固定借用', query: usePendingRoomBookingTotal(can('/admin/rooms')), path: '/admin/rooms' },
    { label: '待審臨時借用', query: usePendingTempBookingTotal(can('/admin/bookings')), path: '/admin/bookings' },
    { label: '逾期未還器材', query: useOverdueLoanTotal(can('/admin/overdue')), path: '/admin/overdue' },
    { label: '未銷案違規', query: useOpenViolationTotal(can('/admin/violations')), path: '/admin/violations' },
  ].filter((s) => can(s.path))

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

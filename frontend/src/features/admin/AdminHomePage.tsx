import { Link } from 'react-router'
import PageHeader from '../../components/ui/PageHeader'
import { currentSemester } from '../../lib/semester'
import { useAuth } from '../../app/auth'
import { canAccessAdminPath } from '../../lib/permissions'
import { useBadges } from '../../api/badges'

interface Stat {
  label: string
  /** 側欄徽章的同一把鍵:數字兩處顯示,來源只有一個(services/badges.py) */
  key: string
  path: string
}

// 學期顯示詞:114-2 → 114 學年第 2 學期
const semesterLabel = (s: string): string => {
  const [year, term] = s.split('-')
  return `${year} 學年第 ${term} 學期`
}

// 卡片=側欄徽章的展開版:同一支查詢、同一組定義,不會出現「側欄 3 筆、卡片 5 筆」
const STATS: Stat[] = [
  { label: '待我簽核的活動申請', key: 'a-review', path: '/admin/review' },
  { label: '待審結案', key: 'a-close', path: '/admin/close-review' },
  { label: '待審固定借用', key: 'a-room', path: '/admin/rooms' },
  { label: '待審臨時借用', key: 'a-booking', path: '/admin/bookings' },
  { label: '逾期未還器材', key: 'a-overdue', path: '/admin/overdue' },
  { label: '未銷案違規', key: 'a-violations', path: '/admin/violations' },
]

export default function AdminHomePage() {
  const { user } = useAuth()
  const badges = useBadges()
  // 依 permissions 過濾:無權限的卡不顯示(後端也不會回那把鍵)
  const stats = STATS.filter((s) => canAccessAdminPath(user, s.path))

  return (
    <div>
      <PageHeader title="總覽" sub={semesterLabel(currentSemester())} />
      <div
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {stats.map((s) => {
          // 查詢未完成或失敗一律 — :「0 筆」看起來就是一個確定的答案
          const count = badges.isPending || badges.isError ? undefined : (badges.data?.[s.key] ?? 0)
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

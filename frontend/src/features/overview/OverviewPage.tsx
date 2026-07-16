import { Fragment, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import AnnouncementModal from '../../components/ui/AnnouncementModal'
import { ANNOUNCEMENTS, TRACKED, type Announcement } from '../activities/mock'
import './overview.css'

const countBadge: React.CSSProperties = {
  fontSize: 12,
  background: '#EEF0F3',
  color: 'var(--steel)',
  borderRadius: 999,
  padding: '1px 8px',
}

function CardTitle({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px 12px' }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
      <span className="num" style={countBadge}>
        {count}
      </span>
    </div>
  )
}

export default function OverviewPage() {
  const navigate = useNavigate()
  const categories = ['活動', '借用', '線上申請'] as const
  const [viewing, setViewing] = useState<Announcement | null>(null)
  const [viewOpen, setViewOpen] = useState(false)

  return (
    <div>
      <PageHeader title="總覽" />

      <div className="card" style={{ marginTop: 20 }}>
        <CardTitle title="待辦" count={2} />
        <div className="todo-row">
          <StatusPill status="locked" />
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            「程式設計工作坊」應於 <span className="num">2026/05/12</span> 前結案,現已鎖定;請洽課外活動指導組解鎖
          </div>
          <div className="todo-action">
            <Button size="small" style={{ height: 30 }} onClick={() => navigate('/activities')}>
              查看活動
            </Button>
          </div>
        </div>
        <div className="todo-row">
          <StatusPill status="closing_due" />
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            「迎新宿營」請於 <span className="num">2026/07/28</span> 前完成結案(剩 <span className="num">15</span> 天)
          </div>
          <div className="todo-action">
            <Button type="primary" size="small" style={{ height: 30 }} onClick={() => navigate('/activities')}>
              去結案
            </Button>
          </div>
        </div>
      </div>

      <div className="overview-grid">
        <div className="card">
          <CardTitle title="公告" count={ANNOUNCEMENTS.length} />
          {ANNOUNCEMENTS.map((a) => (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                setViewing(a)
                setViewOpen(true)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setViewing(a)
                  setViewOpen(true)
                }
              }}
              style={{ padding: '16px 20px', borderTop: '1px solid var(--line)', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{a.title}</div>
                <span style={{ fontSize: 12, color: 'var(--steel)', background: '#EEF0F3', borderRadius: 4, padding: '1px 6px' }}>
                  {a.scope}
                </span>
                <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>
                  {a.date}
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--steel)',
                  lineHeight: 1.7,
                  marginTop: 6,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {a.content}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <CardTitle title="進行中申請" count={TRACKED.length} />
          {categories.map((cat) => (
            <Fragment key={cat}>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--steel)',
                  letterSpacing: 1,
                  padding: '8px 20px 2px',
                  borderTop: '1px solid var(--line)',
                }}
              >
                {cat}
              </div>
              {TRACKED.filter((t) => t.category === cat).map((t) => (
                <Link key={t.id} to={t.path} className="tracked-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: 'var(--ink)' }}>{t.name}</div>
                  </div>
                  <StatusPill status={t.status} />
                </Link>
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      <AnnouncementModal
        announcement={viewing}
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        afterClose={() => setViewing(null)}
      />
    </div>
  )
}

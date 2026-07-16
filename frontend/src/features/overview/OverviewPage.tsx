import { Fragment, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import Markdown from '../../components/ui/Markdown'
import AnnouncementModal from '../../components/ui/AnnouncementModal'
import QueryError from '../../components/ui/QueryError'
import { useAnnouncements, type Announcement } from '../../api/announcements'
import { useOverviewActivities, type TrackedItem } from '../../api/overview'
import { useCertificates, useMaintenanceList, usePostalList } from '../../api/applications'
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

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ padding: '16px 20px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--steel)' }}>
      {text}
    </div>
  )
}

export default function OverviewPage() {
  const navigate = useNavigate()
  const categories = ['活動', '借用', '線上申請'] as const
  const [viewing, setViewing] = useState<Announcement | null>(null)
  const [viewOpen, setViewOpen] = useState(false)

  const announcementsQuery = useAnnouncements()
  const announcements = announcementsQuery.data?.announcements ?? []
  const announcementTotal = announcementsQuery.data?.total ?? 0

  const activitiesQuery = useOverviewActivities()
  const todos = activitiesQuery.data?.todos ?? []

  // 線上申請近況:與各申請頁共用查詢(近 5 筆)
  const maintenanceQuery = useMaintenanceList()
  const postalQuery = usePostalList()
  const certificatesQuery = useCertificates()
  const onlineTracked: TrackedItem[] = [
    ...(maintenanceQuery.data?.records ?? [])
      .filter((r) => r.status === 'pending' || r.status === 'in_progress')
      .map((r) => ({
        key: `mnt-${r.id}`,
        name: `空間報修 ${r.location}`,
        category: '線上申請' as const,
        status: r.status,
        path: '/maintenance',
      })),
    ...(postalQuery.data?.records ?? [])
      .filter((r) => r.status === 'pending')
      .map((r) => ({
        key: `postal-${r.id}`,
        name: '郵局帳戶異動',
        category: '線上申請' as const,
        status: r.status,
        path: '/postal',
      })),
    ...(certificatesQuery.data?.records ?? [])
      .filter((r) => r.status === 'pending')
      .map((r) => ({
        key: `cert-${r.id}`,
        name: '幹部證明',
        category: '線上申請' as const,
        status: r.status,
        path: '/certificates',
      })),
  ]
  const tracked = [...(activitiesQuery.data?.tracked ?? []), ...onlineTracked]

  const loading = announcementsQuery.isPending || activitiesQuery.isPending

  return (
    <div>
      <PageHeader title="總覽" />

      <Spin spinning={loading}>
        <div className="card" style={{ marginTop: 20 }}>
          <CardTitle title="待辦" count={todos.length} />
          {todos.map((t) => (
            <div key={t.id} className="todo-row">
              <StatusPill status={t.kind} />
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                {t.kind === 'locked' ? (
                  <>
                    「{t.name}」應於 <span className="num">{t.deadline}</span> 前結案,現已鎖定;請洽課外活動指導組解鎖
                  </>
                ) : (
                  <>
                    「{t.name}」請於 <span className="num">{t.deadline}</span> 前完成結案
                    {t.daysLeft > 0 ? (
                      <>
                        (剩 <span className="num">{t.daysLeft}</span> 天)
                      </>
                    ) : (
                      '(今日截止)'
                    )}
                  </>
                )}
              </div>
              <div className="todo-action">
                {t.kind === 'locked' ? (
                  <Button size="small" style={{ height: 30 }} onClick={() => navigate('/activities')}>
                    查看活動
                  </Button>
                ) : (
                  <Button type="primary" size="small" style={{ height: 30 }} onClick={() => navigate('/activities')}>
                    去結案
                  </Button>
                )}
              </div>
            </div>
          ))}
          {activitiesQuery.isError && (
            <div style={{ borderTop: '1px solid var(--line)' }}>
              <QueryError compact title="待辦事項載入失敗" error={activitiesQuery.error} onRetry={() => activitiesQuery.refetch()} />
            </div>
          )}
          {!loading && !activitiesQuery.isError && todos.length === 0 && <EmptyRow text="目前沒有待辦事項" />}
        </div>

        <div className="overview-grid">
          <div className="card">
            <CardTitle title="公告" count={announcementTotal} />
            {announcements.map((a) => (
              <div
                key={a.id}
                className="click-tint"
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
                <div className="announcement-preview">
                  <Markdown source={a.content} />
                </div>
              </div>
            ))}
            {announcementsQuery.isError && (
              <div style={{ borderTop: '1px solid var(--line)' }}>
                <QueryError compact title="公告載入失敗" error={announcementsQuery.error} onRetry={() => announcementsQuery.refetch()} />
              </div>
            )}
            {!loading && !announcementsQuery.isError && announcements.length === 0 && <EmptyRow text="目前沒有公告" />}
          </div>

          <div className="card">
            <CardTitle title="進行中申請" count={tracked.length} />
            {activitiesQuery.isError && (
              <div style={{ borderTop: '1px solid var(--line)' }}>
                <QueryError compact title="申請進度載入失敗" error={activitiesQuery.error} onRetry={() => activitiesQuery.refetch()} />
              </div>
            )}
            {!activitiesQuery.isError && categories
              .filter((cat) => tracked.some((t) => t.category === cat))
              .map((cat) => (
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
                  {tracked
                    .filter((t) => t.category === cat)
                    .map((t) => (
                      <Link key={t.key} to={t.path} className="tracked-row">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, color: 'var(--ink)' }}>{t.name}</div>
                        </div>
                        <StatusPill status={t.status} />
                      </Link>
                    ))}
                </Fragment>
              ))}
            {!loading && !activitiesQuery.isError && tracked.length === 0 && <EmptyRow text="目前沒有進行中的申請" />}
          </div>
        </div>
      </Spin>

      <AnnouncementModal
        announcement={viewing}
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        afterClose={() => setViewing(null)}
      />
    </div>
  )
}

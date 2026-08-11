import { Fragment, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import Markdown from '../../components/ui/Markdown'
import AnnouncementModal from '../../components/ui/AnnouncementModal'
import QueryError from '../../components/ui/QueryError'
import { useAnnouncements, useMarkAnnouncementsRead, type Announcement } from '../../api/announcements'
import { useOverviewActivities, type TrackedItem } from '../../api/overview'
import {
  useActiveEquipmentLoans,
  useActiveRoomBookings,
  useActiveVenueBookings,
} from '../../api/bookings'
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

  // 公告顯示於本頁:進入頁面即視為已讀(鈴鐺紅點熄滅);標記後查詢刷新使 unread 歸零
  const markRead = useMarkAnnouncementsRead()
  const { mutate: markReadMutate } = markRead
  const hasUnread = announcements.some((a) => a.unread)
  useEffect(() => {
    if (hasUnread) markReadMutate()
  }, [hasUnread, markReadMutate])

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
  // 借用近況:三類審核中的申請(已核准的屬「正在借用」,在借用總覽頁看)
  const roomQuery = useActiveRoomBookings()
  const venueQuery = useActiveVenueBookings()
  const loanQuery = useActiveEquipmentLoans()
  const bookingTracked: TrackedItem[] = [
    ...(roomQuery.data ?? [])
      .filter((r) => r.status === 'pending')
      .map((r) => ({
        key: `room-${r.id}`,
        name: `固定場地借用 ${r.venueName}`,
        category: '借用' as const,
        status: r.status,
        path: '/bookings',
      })),
    ...(venueQuery.data ?? [])
      .filter((r) => r.status === 'pending')
      .map((r) => ({
        key: `venue-${r.id}`,
        name: `臨時場地借用 ${r.venueName}`,
        category: '借用' as const,
        status: r.status,
        path: '/bookings',
      })),
    ...(loanQuery.data ?? [])
      .filter((r) => r.status === 'pending')
      .map((r) => ({
        key: `loan-${r.id}`,
        name: `器材借用 ${r.equipmentName}`,
        category: '借用' as const,
        status: r.status,
        path: '/bookings',
      })),
  ]
  const tracked = [
    ...(activitiesQuery.data?.tracked ?? []),
    ...bookingTracked,
    ...onlineTracked,
  ]

  // 空分類會被 filter 濾掉,查詢失敗時整個分類會安靜消失 —— 六支一起看載入與錯誤
  const trackedQueries = [
    activitiesQuery,
    roomQuery,
    venueQuery,
    loanQuery,
    maintenanceQuery,
    postalQuery,
    certificatesQuery,
  ]
  const trackedErrored = trackedQueries.filter((q) => q.isError)
  const retryTracked = () => {
    for (const q of trackedErrored) void q.refetch()
  }

  const loading =
    announcementsQuery.isPending || trackedQueries.some((q) => q.isPending)

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
            {trackedErrored.length > 0 && (
              <div style={{ borderTop: '1px solid var(--line)' }}>
                <QueryError compact title="申請進度載入失敗" error={trackedErrored[0].error} onRetry={retryTracked} />
              </div>
            )}
            {categories
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
            {!loading && trackedErrored.length === 0 && tracked.length === 0 && <EmptyRow text="目前沒有進行中的申請" />}
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

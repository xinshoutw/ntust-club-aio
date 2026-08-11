import { useState } from 'react'
import { Modal, Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import type { StatusKey } from '../../lib/status'
import { roomEntryText } from '../../api/bookings'
import { useAdminClubDetail } from '../../api/adminClubs'
import {
  roomConflictKeys,
  useAdminBookingMutations,
  useAllPendingRoomBookings,
  type AdminRoomRequest,
} from '../../api/adminBookings'
import { useAdminActivityDetail, useAdminActivityMutations } from '../../api/adminActivities'
import {
  useAdminClubActivities,
  useAdminClubMaintenance,
  useAdminClubRoomBookings,
  useAdminClubVenueBookings,
  useAdminEquipmentLoanList,
  type AdminMaintenanceRow,
} from '../../api/adminClubOverview'
import ActivityReviewModal from './ActivityReviewModal'
import BookingReviewModal, { type BookingReviewItem } from './BookingReviewModal'
import ClubSelect from './ClubSelect'
import { useAdminClub } from './clubContext'
import { useAuth } from '../../app/auth'
import { canAccessAdminPath } from '../../lib/permissions'

const label: React.CSSProperties = { color: 'var(--steel)' }

function NoPermission() {
  return (
    <div style={{ padding: '20px 20px 24px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--steel)' }}>
      您的權限無法檢視此區塊
    </div>
  )
}

// 線上申請(空間報修)無專屬審核彈窗,以唯讀詳情呈現;
// 幹部證明尚無 admin 端點,暫不列入(後端補齊後再接)
interface Detail {
  title: string
  status: StatusKey
  rows: [string, React.ReactNode][]
}

function clickableRow(onClick: () => void): React.HTMLAttributes<HTMLDivElement> {
  return {
    role: 'button',
    tabIndex: 0,
    onClick,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    },
  }
}

function LoadError({ queries }: { queries: { isError: boolean; error: Error | null }[] }) {
  const failed = queries.find((q) => q.isError)
  if (!failed) return null
  return (
    <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', fontSize: 13, color: '#B03A2E' }}>
      載入失敗:{failed.error?.message ?? '請稍後再試'}
    </div>
  )
}

// 行政端社團總覽:比照社團端總覽,檢視所選社團的申請進度與借用中項目;
// 點擊項目開與各專屬審核介面相同的彈窗(待審核者可直接核准/退回,其餘唯讀)
export default function ClubOverviewPage() {
  const { clubId } = useAdminClub()
  const { user } = useAuth()
  // 各區塊資料來自不同 admin 端點,權限鍵各異;受限 admin 不發無權限的 query
  // (否則整排 403 顯示成載入失敗),改以權限提示取代
  const canActivities =
    canAccessAdminPath(user, '/admin/review') || canAccessAdminPath(user, '/admin/close-review')
  const canMaint = canAccessAdminPath(user, '/admin/maintenance')
  const canRooms = canAccessAdminPath(user, '/admin/rooms')
  const canBookings = canAccessAdminPath(user, '/admin/bookings')

  const detailQuery = useAdminClubDetail(clubId)
  const activitiesQuery = useAdminClubActivities(clubId, canActivities)
  const roomsQuery = useAdminClubRoomBookings(clubId, canRooms)
  const venuesQuery = useAdminClubVenueBookings(clubId, canBookings)
  const loansQuery = useAdminEquipmentLoanList({ clubId }, canBookings)
  const maintQuery = useAdminClubMaintenance(clubId, canMaint)
  const actMutations = useAdminActivityMutations()
  const bookingMutations = useAdminBookingMutations()

  // 點活動列 → 彈窗立即開啟(Skeleton),詳情(經費/附件)到位後補齊
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [reviewName, setReviewName] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const reviewQuery = useAdminActivityDetail(reviewId ?? undefined)
  const reviewItem = reviewQuery.data

  const [booking, setBooking] = useState<BookingReviewItem | null>(null)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingApiId, setBookingApiId] = useState<number | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const info = detailQuery.data

  const openActivity = (id: number, name: string) => {
    setReviewId(id)
    setReviewName(name)
    setReviewOpen(true)
  }

  const openBooking = (item: BookingReviewItem, apiId: number) => {
    setBooking(item)
    setBookingApiId(apiId)
    setBookingOpen(true)
  }

  // 固定借用衝突以「全部社團的審核中申請」計算(judge 與 AdminRoomsPage 共用一份:
  // 兩社搶同場地同星期同節次)
  const pendingRoomsQuery = useAllPendingRoomBookings(canRooms && clubId != null)
  const conflicts = roomConflictKeys(pendingRoomsQuery.data ?? [])
  const conflictSlotsOf = (r: AdminRoomRequest): string[] =>
    r.status !== 'pending'
      ? []
      : r.entries.flatMap((e) =>
          e.periods.filter((p) => conflicts.has(`${r.venueId}|${e.dow}|${p}`)).map((p) => `${e.dow}|${p}`),
        )

  const openMaintenance = (m: AdminMaintenanceRow) => {
    setDetail({
      title: `空間報修 — ${m.location}`,
      status: m.status,
      rows: [
        ['類別', '空間報修'],
        ['地點', m.location],
        ['報修項目', m.items],
        ['申請日', <span className="num" key="d">{m.createdAt}</span>],
        ...(m.handleNote ? ([['處理備註', m.handleNote]] as [string, React.ReactNode][]) : []),
      ],
    })
    setDetailOpen(true)
  }

  // 借用審核動作:依類別打對應 admin API(mutation 成功即 invalidate 借用整域)
  const approveBooking = (item: BookingReviewItem, apiId: number): Promise<unknown> =>
    item.kind === 'venue'
      ? bookingMutations.approveVenue.mutateAsync(apiId)
      : item.kind === 'loan'
        ? bookingMutations.approveLoan.mutateAsync(apiId)
        : bookingMutations.approveRoom.mutateAsync(apiId)
  const rejectBooking = (item: BookingReviewItem, apiId: number, reason: string): Promise<unknown> =>
    item.kind === 'venue'
      ? bookingMutations.rejectVenue.mutateAsync({ id: apiId, reason })
      : item.kind === 'loan'
        ? bookingMutations.rejectLoan.mutateAsync({ id: apiId, reason })
        : bookingMutations.rejectRoom.mutateAsync({ id: apiId, reason })
  // 撤銷已核准:社團總覽是唯一同時看得到各類已核准借用的地方
  const revokeBooking = (item: BookingReviewItem, apiId: number, reason: string): Promise<unknown> =>
    item.kind === 'venue'
      ? bookingMutations.revokeVenue.mutateAsync({ id: apiId, reason })
      : item.kind === 'loan'
        ? bookingMutations.revokeLoan.mutateAsync({ id: apiId, reason })
        : bookingMutations.revokeRoom.mutateAsync({ id: apiId, reason })

  const activities = activitiesQuery.data ?? []
  const maintenance = (maintQuery.data ?? []).filter((m) => m.status !== 'done')
  const trackedCount = activities.length + maintenance.length
  const rooms = (roomsQuery.data ?? []).filter((r) => r.status !== 'rejected')
  const venues = (venuesQuery.data ?? []).filter((v) => v.status !== 'rejected')
  const loans = (loansQuery.data ?? []).filter((l) => l.status !== 'returned' && l.status !== 'rejected')
  const bookingCount = rooms.length + venues.length + loans.length

  const trackedLoading = activitiesQuery.isPending || maintQuery.isPending
  const bookingLoading = roomsQuery.isPending || venuesQuery.isPending || loansQuery.isPending

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 20px',
    borderTop: '1px solid var(--line)',
    cursor: 'pointer',
  }

  return (
    <div>
      <PageHeader title="社團總覽" extra={<ClubSelect />} />

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>基本資料</div>
        <Spin spinning={clubId != null && detailQuery.isPending}>
          <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '9px 12px', fontSize: 13 }}>
            <div style={label}>性質</div><div>{info?.attribute ?? '—'}</div>
            <div style={label}>帳號</div>
            <div className="num">
              {info?.username ?? '—'}
              {info && !info.isActive && <span style={{ color: '#B03A2E', marginLeft: 8 }}>(已停用)</span>}
            </div>
            <div style={label}>網頁連結</div>
            <div>
              {info?.websiteUrl ? (
                <a href={info.websiteUrl} target="_blank" rel="noopener noreferrer">{info.websiteUrl}</a>
              ) : (
                '—'
              )}
            </div>
            <div style={label}>簡介</div><div style={{ lineHeight: 1.7 }}>{info?.intro || '—'}</div>
            <div style={label}>聯絡 Email</div>
            <div className="num">{info?.contactEmails.filter(Boolean).join('、') || '—'}</div>
          </div>
          {detailQuery.isError && (
            <div style={{ fontSize: 13, color: '#B03A2E', marginTop: 12 }}>載入失敗:{detailQuery.error.message}</div>
          )}
        </Spin>
      </div>

      <div className="overview-grid">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px 12px' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>進行中申請</div>
            <span className="num" style={{ fontSize: 12, background: '#EEF0F3', color: 'var(--steel)', borderRadius: 999, padding: '1px 8px' }}>
              {trackedCount}
            </span>
            {trackedLoading && clubId != null && <Spin size="small" />}
          </div>
          {!canActivities && !canMaint && <NoPermission />}
          {activities.map((a) => (
            <div key={`act-${a.id}`} className="click-tint" style={rowStyle} {...clickableRow(() => openActivity(a.id, a.name))}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>活動申請</div>
              </div>
              <StatusPill status={a.status} />
            </div>
          ))}
          {maintenance.map((m) => (
            <div key={`mnt-${m.id}`} className="click-tint" style={rowStyle} {...clickableRow(() => openMaintenance(m))}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>空間報修 {m.location}</div>
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>線上申請</div>
              </div>
              <StatusPill status={m.status} />
            </div>
          ))}
          <LoadError queries={[activitiesQuery, maintQuery, reviewQuery]} />
          {(canActivities || canMaint) && !trackedLoading && trackedCount === 0 && (
            <div style={{ padding: '20px 20px 24px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--steel)' }}>
              尚無進行中的申請
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px 12px' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>借用中</div>
            <span className="num" style={{ fontSize: 12, background: '#EEF0F3', color: 'var(--steel)', borderRadius: 999, padding: '1px 8px' }}>
              {bookingCount}
            </span>
            {bookingLoading && clubId != null && <Spin size="small" />}
          </div>
          {!canRooms && !canBookings && <NoPermission />}
          {rooms.map((r) => (
            <div
              key={`room-${r.id}`}
              className="click-tint"
              style={rowStyle}
              {...clickableRow(() => openBooking({ kind: 'room', data: { ...r, conflictKeys: conflictSlotsOf(r) } }, r.apiId))}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{r.room}</div>
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>固定場地 · 每週 {r.entries.map(roomEntryText).join('、')}</div>
              </div>
              <StatusPill status={r.status} />
            </div>
          ))}
          {venues.map((v) => (
            <div
              key={`ven-${v.id}`}
              className="click-tint"
              style={rowStyle}
              {...clickableRow(() => openBooking({ kind: 'venue', data: v }, v.apiId))}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{v.venue}</div>
                <div className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>臨時場地 · {v.date} 第 {v.periods.join('、')} 節</div>
              </div>
              <StatusPill status={v.status} />
            </div>
          ))}
          {loans.map((l) => (
            <div
              key={`loan-${l.id}`}
              className="click-tint"
              style={rowStyle}
              {...clickableRow(() => openBooking({ kind: 'loan', data: l }, l.apiId))}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{l.equipment} <span className="num">×{l.qty}</span></div>
                <div className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>器材 · {l.startDate} – {l.endDate}</div>
              </div>
              <StatusPill status={l.status} />
            </div>
          ))}
          <LoadError queries={[roomsQuery, venuesQuery, loansQuery]} />
          {(canRooms || canBookings) && !bookingLoading && bookingCount === 0 && (
            <div style={{ padding: '20px 20px 24px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--steel)' }}>
              尚無借用中的場地或器材
            </div>
          )}
        </div>
      </div>

      {/* 活動申請審核彈窗(與申請審核頁同版面);點列立即開啟、詳情補齊;
          常駐待關閉動畫結束(afterClose)才卸載 */}
      {reviewId != null && (
        <ActivityReviewModal
          key={reviewId}
          item={reviewItem ?? null}
          pendingName={reviewName}
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          afterClose={() => setReviewId(null)}
          onApprove={(p) =>
            actMutations.approve.mutateAsync({
              id: reviewId,
              fundSource: p.fundSource || undefined,
              budget: p.budget,
              isLargeApproved: reviewItem?.type === '活動' ? p.largeApproved : undefined,
            })
          }
          onReject={(reason) => actMutations.reject.mutateAsync({ id: reviewId, reason })}
        />
      )}

      {/* 借用審核彈窗(與臨時場地器材審核頁同版面):審核中可核准/退回,其餘唯讀 */}
      {booking && bookingApiId != null && (
        <BookingReviewModal
          key={booking.data.id}
          item={booking}
          open={bookingOpen}
          onClose={() => setBookingOpen(false)}
          afterClose={() => setBooking(null)}
          onApprove={() => approveBooking(booking, bookingApiId)}
          onReject={(reason) => rejectBooking(booking, bookingApiId, reason)}
          onRevoke={(reason) => revokeBooking(booking, bookingApiId, reason)}
        />
      )}

      {/* 線上申請詳情(唯讀);常駐至關閉動畫結束 */}
      <Modal
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        afterClose={() => setDetail(null)}
        footer={null}
        width={460}
        title={
          detail && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 26 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{detail.title}</span>
              <StatusPill status={detail.status} />
            </div>
          )
        }
      >
        {detail && (
          <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: '9px 12px', fontSize: 13, marginTop: 4 }}>
            {detail.rows.map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <div style={label}>{k}</div>
                <div>{v}</div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

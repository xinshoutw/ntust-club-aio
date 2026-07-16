import { useState } from 'react'
import { Modal } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import type { StatusKey } from '../../lib/status'
import { CLUB_ACTIVITIES, TRACKED, type TrackedApplication } from '../activities/mock'
import { budgetTotals, type Activity } from '../activities/types'
import { CERTIFICATE_RECORDS, MAINTENANCE_RECORDS } from '../applications/mock'
import { EQUIPMENT_LOANS, ROOM_REQUESTS, VENUE_BOOKINGS, roomEntryText } from '../bookings/mock'
import { CLUB_PROFILE } from '../club-settings/mock'
import ActivityReviewModal from './ActivityReviewModal'
import BookingReviewModal, { type BookingReviewItem } from './BookingReviewModal'
import ClubSelect from './ClubSelect'
import { CLUBS_MASTER } from './clubsMock'
import { useAdminClub } from './clubContext'
import { REVIEW_ITEMS, type ReviewItem } from './reviewMock'

const label: React.CSSProperties = { color: 'var(--steel)' }

// 線上申請(空間報修/幹部證明)無專屬審核彈窗,以唯讀詳情呈現
interface Detail {
  title: string
  status: StatusKey
  rows: [string, React.ReactNode][]
}

// 審核 mock 未涵蓋的活動:以社團端活動資料組出唯讀審核檢視(狀態沿用追蹤列)
function activityReviewView(a: Activity, status: StatusKey): ReviewItem {
  return {
    id: a.id,
    club: a.club,
    name: a.name,
    type: a.type,
    isLarge: a.isLarge,
    largeApproved: a.largeApproved,
    date: a.date,
    requested: budgetTotals(a.budget).requested,
    status,
    detail: {
      timeRange: a.timeRange ? `${a.date}${a.endDate ? ` – ${a.endDate}` : ''} ${a.timeRange}` : undefined,
      location: a.location,
      participantsIn: a.participantsIn,
      participantsOut: a.participantsOut,
      submittedAt: a.submittedAt,
      submittedBy: a.submittedBy,
      attachments: (a.attachments ?? []).map((f) => f.name),
      // mock 無核定金額紀錄,核定欄以擬請值示意
      budget: a.budget.map((b) => ({
        id: b.id,
        category: b.category,
        description: b.description,
        selfFund: b.selfFund,
        requested: b.requestedSubsidy,
        approved: b.approvedSubsidy ?? b.requestedSubsidy,
      })),
    },
  }
}

function onlineDetail(t: TrackedApplication): Detail {
  const mnt = MAINTENANCE_RECORDS.find((m) => m.id === t.id)
  if (mnt) {
    return {
      title: t.name,
      status: mnt.status,
      rows: [
        ['類別', '空間報修'],
        ['地點', mnt.location],
        ['報修項目', mnt.items],
        ['申請日', <span className="num" key="d">{mnt.date}</span>],
        ...(mnt.handleNote ? ([['處理備註', mnt.handleNote]] as [string, React.ReactNode][]) : []),
      ],
    }
  }
  const cert = CERTIFICATE_RECORDS.find((c) => c.id === t.id)
  if (cert) {
    return {
      title: t.name,
      status: cert.status,
      rows: [
        ['類別', '幹部證明'],
        ['申請對象', cert.holder],
        ['學年期', cert.term],
        ['申請日', <span className="num" key="d">{cert.date}</span>],
      ],
    }
  }
  return { title: t.name, status: t.status, rows: [['類別', t.category]] }
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

// 行政端社團總覽:比照社團端總覽,檢視所選社團的申請進度與借用中項目;
// 點擊項目開與各專屬審核介面相同的彈窗(待審核者可直接核准/退回,其餘唯讀)
export default function ClubOverviewPage() {
  const { club } = useAdminClub()
  const master = CLUBS_MASTER.find((c) => c.name === club)
  const [review, setReview] = useState<ReviewItem | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [booking, setBooking] = useState<BookingReviewItem | null>(null)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const openReview = (item: ReviewItem) => {
    setReview(item)
    setReviewOpen(true)
  }
  const openBooking = (item: BookingReviewItem) => {
    setBooking(item)
    setBookingOpen(true)
  }
  const openDetail = (d: Detail) => {
    setDetail(d)
    setDetailOpen(true)
  }

  const openTracked = (t: TrackedApplication) => {
    // 借用類:同 id 對照借用 mock,開借用審核彈窗
    if (t.category === '借用') {
      const room = ROOM_REQUESTS.find((r) => r.id === t.id)
      if (room) return openBooking({ kind: 'room', data: room })
      const venue = VENUE_BOOKINGS.find((v) => v.id === t.id)
      if (venue) return openBooking({ kind: 'venue', data: venue })
      const loan = EQUIPMENT_LOANS.find((l) => l.id === t.id)
      if (loan) return openBooking({ kind: 'loan', data: loan })
    }
    if (t.category === '線上申請') return openDetail(onlineDetail(t))
    // 活動:以名稱+社團對照審核 mock;未涵蓋者以社團端活動資料組出唯讀檢視
    const found = REVIEW_ITEMS.find((r) => r.name === t.name && r.club === club)
    if (found) return openReview(found)
    const activity = CLUB_ACTIVITIES.find((a) => a.name === t.name && a.club === club)
    if (activity) return openReview(activityReviewView(activity, t.status))
    openReview({ id: t.id, club, name: t.name, type: '活動', date: '—', requested: 0, status: t.status })
  }

  // mock 僅資工系學會有完整平時資料;其餘社團顯示空狀態
  const tracked = club === '資工系學會' ? TRACKED : []
  const rooms = ROOM_REQUESTS.filter((r) => r.club === club)
  const venues = VENUE_BOOKINGS.filter((v) => v.club === club)
  const loans = EQUIPMENT_LOANS.filter((l) => l.club === club && l.status !== 'returned')
  const bookingCount = rooms.length + venues.length + loans.length

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
        <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '9px 12px', fontSize: 13 }}>
          <div style={label}>性質</div><div>{master?.attribute ?? '—'}</div>
          <div style={label}>帳號</div>
          <div className="num">
            {master?.account ?? '—'}
            {master && !master.active && <span style={{ color: '#B03A2E', marginLeft: 8 }}>(已停用)</span>}
          </div>
          <div style={label}>網頁連結</div>
          <div>
            {CLUB_PROFILE.url ? (
              <a href={CLUB_PROFILE.url} target="_blank" rel="noopener noreferrer">{CLUB_PROFILE.url}</a>
            ) : (
              '—'
            )}
          </div>
          <div style={label}>簡介</div><div style={{ lineHeight: 1.7 }}>{CLUB_PROFILE.intro || '—'}</div>
          <div style={label}>聯絡 Email</div>
          <div className="num">{CLUB_PROFILE.emails.filter(Boolean).join('、') || '—'}</div>
        </div>
      </div>

      <div className="overview-grid">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px 12px' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>進行中申請</div>
            <span className="num" style={{ fontSize: 12, background: '#EEF0F3', color: 'var(--steel)', borderRadius: 999, padding: '1px 8px' }}>
              {tracked.length}
            </span>
          </div>
          {tracked.map((t) => (
            <div key={t.id} className="click-tint" style={rowStyle} {...clickableRow(() => openTracked(t))}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>{t.category}</div>
              </div>
              <StatusPill status={t.status} />
            </div>
          ))}
          {tracked.length === 0 && (
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
          </div>
          {rooms.map((r) => (
            <div
              key={r.id}
              className="click-tint"
              style={rowStyle}
              {...clickableRow(() => openBooking({ kind: 'room', data: r }))}
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
              key={v.id}
              className="click-tint"
              style={rowStyle}
              {...clickableRow(() => openBooking({ kind: 'venue', data: v }))}
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
              key={l.id}
              className="click-tint"
              style={rowStyle}
              {...clickableRow(() => openBooking({ kind: 'loan', data: l }))}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{l.equipment} <span className="num">×{l.qty}</span></div>
                <div className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>器材 · {l.startDate} – {l.endDate}</div>
              </div>
              <StatusPill status={l.status} />
            </div>
          ))}
          {bookingCount === 0 && (
            <div style={{ padding: '20px 20px 24px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--steel)' }}>
              尚無借用中的場地或器材
            </div>
          )}
        </div>
      </div>

      {/* 活動申請審核彈窗(與申請審核頁同版面);常駐待關閉動畫結束(afterClose)才卸載 */}
      {review && (
        <ActivityReviewModal
          key={review.id}
          item={review}
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          afterClose={() => setReview(null)}
        />
      )}

      {/* 借用審核彈窗(與臨時場地器材審核頁同版面):審核中可核准/退回,其餘唯讀 */}
      {booking && (
        <BookingReviewModal
          key={booking.data.id}
          item={booking}
          open={bookingOpen}
          onClose={() => setBookingOpen(false)}
          afterClose={() => setBooking(null)}
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

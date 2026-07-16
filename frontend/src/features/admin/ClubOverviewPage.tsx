import { useState } from 'react'
import { Modal } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import type { StatusKey } from '../../lib/status'
import { TRACKED } from '../activities/mock'
import { EQUIPMENT_LOANS, ROOM_REQUESTS, VENUE_BOOKINGS, roomEntryText } from '../bookings/mock'
import { CLUB_PROFILE } from '../club-settings/mock'
import ClubSelect from './ClubSelect'
import { CLUBS_MASTER } from './clubsMock'
import { useAdminClub } from './clubContext'

const label: React.CSSProperties = { color: 'var(--steel)' }

// 點擊任一項目開啟的唯讀詳情
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

// 行政端社團總覽:比照社團端總覽,唯讀檢視所選社團的申請進度與借用中項目;
// 所有項目皆可點擊開啟詳情彈窗
export default function ClubOverviewPage() {
  const { club } = useAdminClub()
  const master = CLUBS_MASTER.find((c) => c.name === club)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const openDetail = (d: Detail) => {
    setDetail(d)
    setDetailOpen(true)
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
            <div
              key={t.id}
              className="click-tint"
              style={rowStyle}
              {...clickableRow(() =>
                openDetail({
                  title: t.name,
                  status: t.status,
                  rows: [['類別', t.category]],
                }),
              )}
            >
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
              {...clickableRow(() =>
                openDetail({
                  title: r.room,
                  status: r.status,
                  rows: [
                    ['類別', '固定場地借用'],
                    ['每週時段', r.entries.map(roomEntryText).join('、')],
                    ['用途', r.note || '—'],
                  ],
                }),
              )}
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
              {...clickableRow(() =>
                openDetail({
                  title: v.venue,
                  status: v.status,
                  rows: [
                    ['類別', '臨時場地借用'],
                    ['日期時段', <span className="num" key="d">{v.date} 第 {v.periods.join('、')} 節</span>],
                    ['用途', v.purpose || '—'],
                  ],
                }),
              )}
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
              {...clickableRow(() =>
                openDetail({
                  title: `${l.equipment} ×${l.qty}`,
                  status: l.status,
                  rows: [
                    ['類別', '器材借用'],
                    ['借用區間', <span className="num" key="d">{l.startDate} – {l.endDate}</span>],
                    ...(l.activity ? ([['關聯活動', l.activity]] as [string, React.ReactNode][]) : []),
                    ['用途', l.purpose || '—'],
                    ...(l.borrower ? ([['借用人', l.borrower]] as [string, React.ReactNode][]) : []),
                    ...(l.returnedBy ? ([['歸還人', l.returnedBy]] as [string, React.ReactNode][]) : []),
                  ],
                }),
              )}
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

      {/* 項目詳情(唯讀);常駐至關閉動畫結束 */}
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

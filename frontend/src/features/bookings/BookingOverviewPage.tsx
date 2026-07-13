import { useState } from 'react'
import { DatePicker, Pagination, Tooltip } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { EQUIPMENT_LOANS, PERIODS, ROOM_REQUESTS, VENUE_BOOKINGS, VENUES } from './mock'

const RETURNED_PAGE = 10

// 場地格狀態與圖例(依需求配色)
type CellState = 'free' | 'closed' | 'reviewing' | 'temp' | 'fixed' | 'mine'
const CELL: Record<CellState, { label: string; bg: string; fg?: string }> = {
  free: { label: '可借', bg: '#EEF0F3' },
  closed: { label: '不開放', bg: '#9AA1AC', fg: '#fff' },
  reviewing: { label: '審核中', bg: '#F5A623', fg: '#fff' },
  temp: { label: '臨時借用', bg: '#F0A899' },
  fixed: { label: '固定借用', bg: '#9E1B32', fg: '#fff' },
  mine: { label: '我的借用', bg: '#2E7D57', fg: '#fff' },
}

// mock 佔用資料(接後端後由 API 取當日場況);全校社團的借用皆會顯示
function cellInfo(venue: string, period: string, myClub?: string): { state: CellState; club?: string } {
  if (venue === 'TR 練團室' && ['1', '2'].includes(period)) return { state: 'closed' }
  if (venue === 'S304 音樂教室' && period === '3') {
    const isMine = ROOM_REQUESTS.some((r) => r.club === myClub && r.room === venue)
    return { state: isMine ? 'mine' : 'fixed', club: isMine ? myClub : '電機系學會' }
  }
  if (venue === 'S304 音樂教室' && period === '4') return { state: 'reviewing', club: '電機系學會' }
  if (venue === '精誠廣場 1' && ['5', '6', '7'].includes(period))
    return myClub === '資工系學會' ? { state: 'mine', club: myClub } : { state: 'temp', club: '資工系學會' }
  if (venue === 'S312/S313' && ['A', 'B'].includes(period)) return { state: 'temp', club: '機器人研究社' }
  if (venue === 'S207' && ['6', '7'].includes(period)) return { state: 'fixed', club: '美術社' }
  return { state: 'free' }
}

export default function BookingOverviewPage() {
  const { user } = useAuth()
  const mine = user?.club
  const [returnedPage, setReturnedPage] = useState(1)

  const rooms = ROOM_REQUESTS.filter((r) => r.club === mine)
  const venues = VENUE_BOOKINGS.filter((v) => v.club === mine)
  const active = EQUIPMENT_LOANS.filter((l) => l.club === mine && l.status !== 'returned')
  const returned = EQUIPMENT_LOANS.filter((l) => l.club === mine && l.status === 'returned')
  const returnedPaged = returned.slice((returnedPage - 1) * RETURNED_PAGE, returnedPage * RETURNED_PAGE)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader title="借用總覽" sub={mine} />

      {/* 場地借用情形 */}
      <div className="card" style={{ marginTop: 20, padding: '16px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>場地借用情形</div>
          <DatePicker format="YYYY/MM/DD" size="small" placeholder="2026/09/15" />
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(Object.keys(CELL) as CellState[]).map((k) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--steel)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: CELL[k].bg, border: '1px solid rgba(31,36,48,.12)' }} />
                {CELL[k].label}
              </span>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 3, minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ fontSize: 12, fontWeight: 500, color: 'var(--steel)', textAlign: 'left', paddingRight: 8 }}>場地</th>
                {PERIODS.map((p) => (
                  <th key={p} className="num" style={{ fontSize: 11, fontWeight: 500, color: 'var(--steel)', width: 30 }}>{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VENUES.map((v) => (
                <tr key={v.name}>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap', paddingRight: 8 }}>{v.name}</td>
                  {PERIODS.map((p) => {
                    const info = cellInfo(v.name, p, mine)
                    const cell = (
                      <div style={{ width: 28, height: 22, borderRadius: 4, background: CELL[info.state].bg }} />
                    )
                    return (
                      <td key={p}>
                        {info.club ? (
                          <Tooltip title={<span style={{ fontSize: 14 }}>{info.club}</span>} mouseEnterDelay={0}>
                            {cell}
                          </Tooltip>
                        ) : (
                          cell
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 我的借用:單卡整併(固定/臨時/器材),僅顯示自己社團 */}
      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>我的借用(進行中)</div>
        <table className="tb" style={{ minWidth: 680 }}>
          <thead>
            <tr>
              <th style={{ width: 90 }}>類別</th>
              <th>內容</th>
              <th>時間</th>
              <th style={{ width: 110 }}>狀態</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id}>
                <td style={{ color: 'var(--steel)', fontSize: 13 }}>固定場地</td>
                <td style={{ fontWeight: 500 }}>{r.room}</td>
                <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                  {r.entries.map((e) => `${e.date} 第${e.period}節`).join('、')}
                </td>
                <td><StatusPill status={r.status} /></td>
              </tr>
            ))}
            {venues.map((v) => (
              <tr key={v.id}>
                <td style={{ color: 'var(--steel)', fontSize: 13 }}>臨時場地</td>
                <td style={{ fontWeight: 500 }}>{v.venue}<span style={{ color: 'var(--steel)', fontWeight: 400, fontSize: 13 }}> · {v.purpose}</span></td>
                <td className="num" style={{ color: 'var(--steel)', fontSize: 13 }}>{v.date} 第 {v.periods.join('、')} 節</td>
                <td><StatusPill status={v.status} /></td>
              </tr>
            ))}
            {active.map((l) => (
              <tr key={l.id}>
                <td style={{ color: 'var(--steel)', fontSize: 13 }}>器材</td>
                <td style={{ fontWeight: 500 }}>{l.equipment} <span className="num">×{l.qty}</span></td>
                <td className="num" style={{ color: 'var(--steel)', fontSize: 13 }}>
                  {l.status === 'checked_out' && l.returnDue ? `歸還期限 ${l.returnDue}` : `${l.startDate} – ${l.endDate}`}
                </td>
                <td><StatusPill status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 已歸還:獨立分頁區 */}
      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>已歸還</div>
        <table className="tb" style={{ minWidth: 560 }}>
          <tbody>
            {returnedPaged.map((l) => (
              <tr key={l.id}>
                <td style={{ fontWeight: 500 }}>
                  {l.equipment} <span className="num">×{l.qty}</span>
                </td>
                <td className="num" style={{ fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                <td style={{ color: 'var(--steel)', fontSize: 13 }}>{l.purpose}</td>
                <td style={{ width: 100 }}><StatusPill status="returned" /></td>
              </tr>
            ))}
            {returned.length === 0 && (
              <tr className="no-hover">
                <td style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>尚無歸還紀錄。</td>
              </tr>
            )}
          </tbody>
        </table>
        {returned.length > RETURNED_PAGE && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 14px' }}>
            <Pagination current={returnedPage} pageSize={RETURNED_PAGE} total={returned.length} onChange={setReturnedPage} showSizeChanger={false} />
          </div>
        )}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--steel)' }}>
        器材應於借用結束日之隔天上班日 <span className="num">10:30</span> 前歸還。
      </div>
    </div>
  )
}

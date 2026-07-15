import { useState } from 'react'
import { useNavigate } from 'react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { Button, DatePicker, Pagination, Select, Tooltip } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { EQUIPMENT_LOANS, PERIODS, ROOM_REQUESTS, VENUE_BOOKINGS, VENUES } from './mock'

const RETURNED_PAGE = 10
const VENUE_DAYS = 14 // 單一場地檢視一頁 14 天

// 場地格狀態(2026-07-15 需求方配色):不開放不畫方框也不列圖例;固定借用改深灰
type CellState = 'free' | 'closed' | 'reviewing' | 'temp' | 'fixed' | 'mine'
const CELL: Record<CellState, { label: string; bg: string }> = {
  free: { label: '可借', bg: '#EEF0F3' },
  closed: { label: '不開放', bg: 'transparent' },
  reviewing: { label: '審核中', bg: '#F5A623' },
  temp: { label: '臨時借用', bg: '#F0A899' },
  fixed: { label: '固定借用', bg: '#9AA1AC' },
  mine: { label: '我的借用', bg: '#2E7D57' },
}
const LEGEND: CellState[] = ['free', 'reviewing', 'temp', 'fixed', 'mine']
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

// ---- mock 場況(接後端後由 API 取) ----

// 固定借用(已核准):學期內每週同一時段;審核中的固定借用不顯示於場況圖
const FIXED_WEEKLY: { venue: string; dow: number; periods: string[]; club: string }[] = [
  { venue: 'S207', dow: 2, periods: ['6', '7'], club: '美術社' },
  { venue: 'S304 音樂教室', dow: 3, periods: ['3', '4'], club: '電機系學會' },
  { venue: '練團室', dow: 1, periods: ['C', 'D'], club: '熱音社' },
  { venue: 'S302/S303', dow: 4, periods: ['A', 'B', 'C'], club: '資工系學會' },
]

// 臨時借用(特定日期):自我的申請 mock 加上其他社團近日借用,讓場況圖有內容
const today0 = dayjs()
const GRID_TEMP: { venue: string; date: string; periods: string[]; club: string; pending: boolean }[] = [
  ...VENUE_BOOKINGS.filter((v) => v.status === 'pending' || v.status === 'approved').map((v) => ({
    venue: v.venue,
    date: v.date,
    periods: v.periods,
    club: v.club,
    pending: v.status === 'pending',
  })),
  { venue: 'S209', date: today0.format('YYYY/MM/DD'), periods: ['3', '4'], club: '吉他社', pending: false },
  { venue: 'S304 音樂教室', date: today0.format('YYYY/MM/DD'), periods: ['5'], club: '電機系學會', pending: true },
  { venue: 'S312/S313', date: today0.add(1, 'day').format('YYYY/MM/DD'), periods: ['A', 'B'], club: '機器人研究社', pending: false },
  { venue: '3F 戶外廣場', date: today0.add(2, 'day').format('YYYY/MM/DD'), periods: ['5', '6', '7'], club: '熱舞社', pending: true },
  { venue: 'S204 共享食堂', date: today0.add(3, 'day').format('YYYY/MM/DD'), periods: ['5', '6'], club: '資工系學會', pending: false },
  { venue: '戶外精誠廣場 2', date: today0.add(4, 'day').format('YYYY/MM/DD'), periods: ['8', '9', '10'], club: '登山社', pending: false },
]

function cellInfo(venue: string, date: Dayjs, period: string, myClub?: string): { state: CellState; club?: string } {
  if (venue === '練團室' && ['1', '2'].includes(period)) return { state: 'closed' } // 保養時段示意
  const fixed = FIXED_WEEKLY.find((f) => f.venue === venue && f.dow === date.day() && f.periods.includes(period))
  if (fixed) return fixed.club === myClub ? { state: 'mine', club: myClub } : { state: 'fixed', club: fixed.club }
  const d = date.format('YYYY/MM/DD')
  const t = GRID_TEMP.find((x) => x.venue === venue && x.date === d && x.periods.includes(period))
  if (t) {
    if (t.pending) return { state: 'reviewing', club: t.club }
    return t.club === myClub ? { state: 'mine', club: t.club } : { state: 'temp', club: t.club }
  }
  return { state: 'free' }
}

// 單一場地格:可借才可點(直接前往臨時場地借用);審核中不可點;不開放不畫方框
function Cell({ info, label, onBook }: { info: { state: CellState; club?: string }; label: string; onBook: () => void }) {
  const base: React.CSSProperties = { width: '100%', height: 24, borderRadius: 4, background: CELL[info.state].bg, display: 'block' }
  const el =
    info.state === 'closed' ? (
      <div role="img" aria-label={label} style={base} />
    ) : info.state === 'free' ? (
      <button
        type="button"
        aria-label={`${label},點擊前往臨時場地借用`}
        onClick={onBook}
        style={{ ...base, border: 'none', padding: 0, cursor: 'pointer' }}
      />
    ) : (
      <div role="img" aria-label={label} style={base} />
    )
  return info.club ? (
    <Tooltip title={<span style={{ fontSize: 14 }}>{info.club}</span>} mouseEnterDelay={0}>
      {el}
    </Tooltip>
  ) : (
    el
  )
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {LEGEND.map((k) => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--steel)' }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: CELL[k].bg, border: '1px solid rgba(31,36,48,.12)' }} />
          {CELL[k].label}
        </span>
      ))}
    </div>
  )
}

export default function BookingOverviewPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const mine = user?.club
  const [returnedPage, setReturnedPage] = useState(1)
  const [gridDate, setGridDate] = useState<Dayjs>(() => dayjs())
  // 場地檢視:點左側場地名稱進入,顯示該場地自起始日起 14 天場況
  const [venueView, setVenueView] = useState<string | null>(null)
  const [venueStart, setVenueStart] = useState<Dayjs>(() => dayjs().startOf('day'))

  const rooms = ROOM_REQUESTS.filter((r) => r.club === mine)
  const venues = VENUE_BOOKINGS.filter((v) => v.club === mine)
  const active = EQUIPMENT_LOANS.filter((l) => l.club === mine && l.status !== 'returned')
  const returned = EQUIPMENT_LOANS.filter((l) => l.club === mine && l.status === 'returned')
  const returnedPaged = returned.slice((returnedPage - 1) * RETURNED_PAGE, returnedPage * RETURNED_PAGE)

  const book = (venue: string, date: Dayjs, period: string) =>
    navigate(`/bookings/venue?venue=${encodeURIComponent(venue)}&date=${date.format('YYYY/MM/DD')}&period=${period}`)

  const openVenue = (name: string) => {
    setVenueView(name)
    setVenueStart(dayjs().startOf('day'))
  }

  const venueDef = venueView ? VENUES.find((v) => v.name === venueView) : undefined
  const venueRows = Array.from({ length: VENUE_DAYS }, (_, i) => venueStart.add(i, 'day'))

  const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: 'var(--steel)' }

  return (
    <div>
      <PageHeader title="借用總覽" sub={mine} />

      {/* 場地借用情形:單日全場地 / 單一場地 14 天,兩種檢視 */}
      <div className="card" style={{ marginTop: 20, padding: '16px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {!venueDef ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, marginRight: 4 }}>場地借用情形</div>
              <Button size="small" className="num" aria-label="往前一週" onClick={() => setGridDate((d) => d.subtract(7, 'day'))}>{'<<<'}</Button>
              <Button size="small" className="num" aria-label="往前一天" onClick={() => setGridDate((d) => d.subtract(1, 'day'))}>{'<'}</Button>
              <DatePicker
                format="YYYY/MM/DD"
                size="small"
                allowClear={false}
                value={gridDate}
                onChange={(d) => d && setGridDate(d)}
              />
              <Button size="small" className="num" aria-label="往後一天" onClick={() => setGridDate((d) => d.add(1, 'day'))}>{'>'}</Button>
              <Button size="small" className="num" aria-label="往後一週" onClick={() => setGridDate((d) => d.add(7, 'day'))}>{'>>>'}</Button>
              <Button size="small" onClick={() => setGridDate(dayjs())}>今天</Button>
            </>
          ) : (
            <>
              <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => setVenueView(null)}>
                單日總覽
              </Button>
              <Select
                size="small"
                value={venueView}
                onChange={openVenue}
                options={VENUES.map((v) => ({ value: v.name, label: `${v.name}(${v.capacity} 人)` }))}
                style={{ minWidth: 190 }}
                popupMatchSelectWidth={false}
              />
              <Button size="small" className="num" aria-label={`前 ${VENUE_DAYS} 天`} onClick={() => setVenueStart((s) => s.subtract(VENUE_DAYS, 'day'))}>{'<'}</Button>
              <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>
                {venueStart.format('YYYY/MM/DD')} – {venueStart.add(VENUE_DAYS - 1, 'day').format('MM/DD')}
              </span>
              <Button size="small" className="num" aria-label={`後 ${VENUE_DAYS} 天`} onClick={() => setVenueStart((s) => s.add(VENUE_DAYS, 'day'))}>{'>'}</Button>
              <Button size="small" onClick={() => setVenueStart(dayjs().startOf('day'))}>今天起</Button>
            </>
          )}
          <div style={{ flex: 1 }} />
          <Legend />
        </div>

        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          {!venueDef ? (
            <table style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%', tableLayout: 'fixed', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 176, textAlign: 'left', paddingRight: 8 }}>場地(容納人數)</th>
                  {PERIODS.map((p) => (
                    <th key={p} className="num" style={thStyle}>{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {VENUES.map((v) => (
                  <tr key={v.name}>
                    <td style={{ whiteSpace: 'nowrap', paddingRight: 8 }}>
                      <button
                        type="button"
                        className="link-btn"
                        style={{ padding: 0, fontSize: 13 }}
                        aria-label={`檢視 ${v.name} 未來 ${VENUE_DAYS} 天場況`}
                        onClick={() => openVenue(v.name)}
                      >
                        {v.name}
                      </button>
                      <span className="num" style={{ fontSize: 11, color: 'var(--steel)', marginLeft: 5 }}>{v.capacity}</span>
                    </td>
                    {PERIODS.map((p) => {
                      const info = cellInfo(v.name, gridDate, p, mine)
                      const label = `${v.name} 第${p}節:${CELL[info.state].label}${info.club ? `(${info.club})` : ''}`
                      return (
                        <td key={p}>
                          <Cell info={info} label={label} onBook={() => book(v.name, gridDate, p)} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%', tableLayout: 'fixed', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 110, textAlign: 'left', paddingRight: 8 }}>日期</th>
                  {PERIODS.map((p) => (
                    <th key={p} className="num" style={thStyle}>{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {venueRows.map((d) => {
                  const isToday = d.isSame(today0, 'day')
                  return (
                    <tr key={d.format('YYYY/MM/DD')}>
                      <td className="num" style={{ whiteSpace: 'nowrap', paddingRight: 8, fontSize: 12, fontWeight: isToday ? 600 : 400, color: isToday ? 'var(--seal)' : 'var(--ink)' }}>
                        {d.format('MM/DD')}(週{WEEKDAY[d.day()]})
                      </td>
                      {PERIODS.map((p) => {
                        const info = cellInfo(venueDef.name, d, p, mine)
                        const label = `${d.format('MM/DD')} 第${p}節:${CELL[info.state].label}${info.club ? `(${info.club})` : ''}`
                        return (
                          <td key={p}>
                            <Cell info={info} label={label} onBook={() => book(venueDef.name, d, p)} />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--steel)' }}>
          {!venueDef
            ? <>點場地名稱檢視該場地 {VENUE_DAYS} 天場況;點「可借」格前往臨時場地借用。</>
            : <>點「可借」格前往臨時場地借用,並自動帶入場地、日期與時段。</>}
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

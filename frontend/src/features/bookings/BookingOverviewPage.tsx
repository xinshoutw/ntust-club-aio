import { useState } from 'react'
import { useNavigate } from 'react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { Button, DatePicker, Select, Tooltip } from 'antd'
import {
  ArrowLeftOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { Pager } from '../../components/ui/tableControls'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { CELL, EQUIPMENT_LOANS, PERIODS, ROOM_REQUESTS, VENUE_BOOKINGS, VENUES, cellInfo, roomEntryText, type CellState } from './mock'

const RETURNED_PAGE = 10
const VENUE_DAYS = 15 // 單一場地檢視:選擇日 −7 ~ +7 共 15 天(不含過去,不足往未來補)

const LEGEND: CellState[] = ['free', 'reviewing', 'temp', 'fixed', 'mine']
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

const today0 = dayjs()

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
  // 場地檢視:點場地名稱進入,以當時檢視日為中心 −7~+7 共 15 天;後端不提供過去場況,
  // 起始日不得早於今天,被截掉的天數往未來補(顯示天數固定)
  const [venueView, setVenueView] = useState<string | null>(null)
  const [venueStart, setVenueStart] = useState<Dayjs>(() => dayjs().startOf('day'))
  const todayStart = dayjs().startOf('day')
  const clampStart = (d: Dayjs) => (d.isBefore(todayStart, 'day') ? todayStart : d)

  const rooms = ROOM_REQUESTS.filter((r) => r.club === mine)
  const venues = VENUE_BOOKINGS.filter((v) => v.club === mine)
  const active = EQUIPMENT_LOANS.filter((l) => l.club === mine && l.status !== 'returned')
  const returned = EQUIPMENT_LOANS.filter((l) => l.club === mine && l.status === 'returned')
  const returnedPaged = returned.slice((returnedPage - 1) * RETURNED_PAGE, returnedPage * RETURNED_PAGE)

  const book = (venue: string, date: Dayjs, period: string) =>
    navigate(`/bookings/venue?venue=${encodeURIComponent(venue)}&date=${date.format('YYYY/MM/DD')}&period=${period}`)

  const openVenue = (name: string) => {
    setVenueView(name)
    setVenueStart(clampStart(gridDate.startOf('day').subtract(7, 'day')))
  }

  const venueDef = venueView ? VENUES.find((v) => v.name === venueView) : undefined
  const venueRows = Array.from({ length: VENUE_DAYS }, (_, i) => venueStart.add(i, 'day'))

  const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: 'var(--steel)' }

  return (
    <div>
      <PageHeader title="借用總覽" />

      {/* 場地借用情形:單日全場地 / 單一場地 15 天(−7~+7),兩種檢視 */}
      <div className="card" style={{ marginTop: 20, padding: '16px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {!venueDef ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, marginRight: 4 }}>場地借用情形</div>
              <Tooltip title="前一週">
                <Button
                  size="small"
                  icon={<DoubleLeftOutlined />}
                  aria-label="前一週"
                  disabled={!gridDate.isAfter(todayStart, 'day')}
                  onClick={() => setGridDate((d) => clampStart(d.subtract(7, 'day')))}
                />
              </Tooltip>
              <Tooltip title="前一天">
                <Button
                  size="small"
                  icon={<LeftOutlined />}
                  aria-label="前一天"
                  disabled={!gridDate.isAfter(todayStart, 'day')}
                  onClick={() => setGridDate((d) => clampStart(d.subtract(1, 'day')))}
                />
              </Tooltip>
              <DatePicker
                format={(d) => `${d.format('YYYY/MM/DD')} (${WEEKDAY[d.day()]})`}
                size="small"
                allowClear={false}
                suffixIcon={null}
                style={{ width: 120 }}
                styles={{ input: { textAlign: 'center' } }}
                value={gridDate}
                disabledDate={(d) => d.isBefore(todayStart, 'day')}
                onChange={(d) => d && setGridDate(d)}
              />
              <Tooltip title="後一天">
                <Button size="small" icon={<RightOutlined />} aria-label="後一天" onClick={() => setGridDate((d) => d.add(1, 'day'))} />
              </Tooltip>
              <Tooltip title="後一週">
                <Button size="small" icon={<DoubleRightOutlined />} aria-label="後一週" onClick={() => setGridDate((d) => d.add(7, 'day'))} />
              </Tooltip>
              <Button size="small" onClick={() => setGridDate(dayjs())}>今天</Button>
            </>
          ) : (
            <>
              <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => setVenueView(null)}>
                總覽
              </Button>
              <Select
                size="small"
                value={venueView}
                onChange={setVenueView}
                options={VENUES.map((v) => ({ value: v.name, label: `${v.name} (${v.capacity} 人)` }))}
                style={{ minWidth: 190 }}
                popupMatchSelectWidth={false}
              />
              <Tooltip title={`前 ${VENUE_DAYS} 天`}>
                <Button
                  size="small"
                  icon={<LeftOutlined />}
                  aria-label={`前 ${VENUE_DAYS} 天`}
                  disabled={!venueStart.isAfter(todayStart, 'day')}
                  onClick={() => setVenueStart((s) => clampStart(s.subtract(VENUE_DAYS, 'day')))}
                />
              </Tooltip>
              <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>
                {venueStart.format('MM/DD')} – {venueStart.add(VENUE_DAYS - 1, 'day').format('MM/DD')}
              </span>
              <Tooltip title={`後 ${VENUE_DAYS} 天`}>
                <Button
                  size="small"
                  icon={<RightOutlined />}
                  aria-label={`後 ${VENUE_DAYS} 天`}
                  onClick={() => setVenueStart((s) => s.add(VENUE_DAYS, 'day'))}
                />
              </Tooltip>
              <Button size="small" onClick={() => setVenueStart(todayStart)}>今天</Button>
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
                  <th style={{ ...thStyle, width: 176, textAlign: 'left', paddingRight: 8 }}>場地</th>
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
                        className="venue-btn"
                        aria-label={`檢視 ${v.name} ${VENUE_DAYS} 天場況`}
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
                        {d.format('MM/DD')}（{WEEKDAY[d.day()]}）
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
      </div>

      {/* 我的借用:單卡整併(固定/臨時/器材),僅顯示自己社團 */}
      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近借用</div>
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
                  每週 {r.entries.map(roomEntryText).join('、')}
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
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近歸還</div>
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
                <td style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>尚無歸還紀錄</td>
              </tr>
            )}
          </tbody>
        </table>
        <Pager page={returnedPage} pageSize={RETURNED_PAGE} total={returned.length} onChange={setReturnedPage} style={{ padding: '10px 0 14px' }} />
      </div>
    </div>
  )
}

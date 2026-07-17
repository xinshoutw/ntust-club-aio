import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { Button, DatePicker, Select, Spin, Tooltip } from 'antd'
import {
  ArrowLeftOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Pager } from '../../components/ui/tableControls'
import StatusPill from '../../components/ui/StatusPill'
import {
  PERIODS,
  roomEntryText,
  useAllEquipmentLoans,
  useAllRoomBookings,
  useAllVenueBookings,
  useAvailability,
  useAvailabilityDays,
  useVenues,
  venueLabel,
  type AvailabilityCell,
  type AvailabilityGrid,
  type AvailabilityState,
  type Venue,
} from '../../api/bookings'
import { CELL, type CellState } from './mock'

const RETURNED_PAGE = 10
const VENUE_DAYS = 15 // 單一場地檢視:選擇日 −7 ~ +7 共 15 天(不含過去,不足往未來補)

const LEGEND: CellState[] = ['free', 'reviewing', 'temp', 'fixed', 'mine']
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

// 後端場況狀態 → 色格狀態;未佔用格依場地開放旗標補 可借/不開放
const STATE_OF: Record<AvailabilityState, CellState> = {
  pending: 'reviewing',
  temp: 'temp',
  fixed: 'fixed',
  mine: 'mine',
}

function cellOf(
  venue: Venue,
  grid: AvailabilityGrid | undefined,
  period: string,
): { state: CellState; club?: string } {
  const c: AvailabilityCell | undefined = grid?.[String(venue.id)]?.[period]
  if (c) return { state: STATE_OF[c.status], club: c.club }
  return { state: venue.allowTemp ? 'free' : 'closed' }
}

// 單一場地格:可借才可點(直接前往臨時場地借用);審核中不可點;不開放不畫方框。
// 被佔用格 hover 顯示借用社團名(mine 顯示「我的社團」語意由色塊表達,仍附社名)
function Cell({ state, label, club, onBook }: { state: CellState; label: string; club?: string; onBook: () => void }) {
  const base: React.CSSProperties = { width: '100%', height: 24, borderRadius: 4, background: CELL[state].bg, display: 'block' }
  if (state === 'free') {
    return (
      <button
        type="button"
        aria-label={`${label},點擊前往臨時場地借用`}
        onClick={onBook}
        style={{ ...base, border: 'none', padding: 0, cursor: 'pointer' }}
      />
    )
  }
  const cell = <div role="img" aria-label={club ? `${label}(${club})` : label} style={base} />
  // 被佔用格(有社團名)才掛 tooltip;不開放格無社名不掛
  return club ? <Tooltip title={`${club}・${CELL[state].label}`}>{cell}</Tooltip> : cell
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
  const navigate = useNavigate()
  const [returnedPage, setReturnedPage] = useState(1)
  const [gridDate, setGridDate] = useState<Dayjs>(() => dayjs())
  // 場地檢視:點場地名稱進入,以當時檢視日為中心 −7~+7 共 15 天;後端不提供過去場況,
  // 起始日不得早於今天,被截掉的天數往未來補(顯示天數固定)
  const [venueView, setVenueView] = useState<number | null>(null)
  const [venueStart, setVenueStart] = useState<Dayjs>(() => dayjs().startOf('day'))
  const todayStart = dayjs().startOf('day')
  const clampStart = (d: Dayjs) => (d.isBefore(todayStart, 'day') ? todayStart : d)

  const venuesQuery = useVenues()
  const venues = venuesQuery.data ?? []
  const venueDef = venueView != null ? venues.find((v) => v.id === venueView) : undefined

  // 單日全場地 / 單一場地 15 天(逐日並行查詢,見 api/bookings.useAvailabilityDays)
  const dayQuery = useAvailability(gridDate)
  const venueDates = useMemo(
    () => Array.from({ length: VENUE_DAYS }, (_, i) => venueStart.add(i, 'day')),
    [venueStart],
  )
  const rangeQuery = useAvailabilityDays(venueDef ? venueDates : [], venueDef?.id)

  const roomsQuery = useAllRoomBookings()
  const venueBookingsQuery = useAllVenueBookings()
  const loansQuery = useAllEquipmentLoans()
  // 「我的借用」只列進行中:退回/歸還/過期(場地日期已過)的紀錄由各借用頁近 5 筆呈現
  const rooms = (roomsQuery.data ?? []).filter((r) => r.status === 'pending' || r.status === 'approved')
  const venueBookings = (venueBookingsQuery.data ?? []).filter(
    (v) => v.status === 'pending' || (v.status === 'approved' && !dayjs(v.date, 'YYYY/MM/DD').isBefore(todayStart, 'day')),
  )
  const loans = loansQuery.data ?? []
  const active = loans.filter((l) => l.status !== 'returned' && l.status !== 'rejected')
  const returned = loans.filter((l) => l.status === 'returned')
  const returnedPaged = returned.slice((returnedPage - 1) * RETURNED_PAGE, returnedPage * RETURNED_PAGE)
  const listsPending = roomsQuery.isPending || venueBookingsQuery.isPending || loansQuery.isPending
  const listsErrored = [roomsQuery, venueBookingsQuery, loansQuery].filter((q) => q.isError)
  const retryLists = () => {
    for (const q of listsErrored) void q.refetch()
  }

  const book = (venueId: number, date: Dayjs, period: string) =>
    navigate(`/bookings/venue?venue=${venueId}&date=${date.format('YYYY/MM/DD')}&period=${period}`)

  const openVenue = (id: number) => {
    setVenueView(id)
    setVenueStart(clampStart(gridDate.startOf('day').subtract(7, 'day')))
  }

  const gridPending = venueDef ? rangeQuery.isPending : venuesQuery.isPending || dayQuery.isPending
  // 場況圖來源查詢失敗時整卡顯示錯誤,不畫預設色格
  // (15 天檢視走逐日並行查詢:任一日失敗即整卡錯誤,重試只補抓失敗的日期)
  const gridError = venuesQuery.isError
    ? { error: venuesQuery.error, retry: () => void venuesQuery.refetch() }
    : !venueDef && dayQuery.isError
      ? { error: dayQuery.error, retry: () => void dayQuery.refetch() }
      : venueDef && rangeQuery.isError
        ? { error: rangeQuery.error, retry: rangeQuery.refetchErrored }
        : null

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
                options={venues.map((v) => ({ value: v.id, label: venueLabel(v) }))}
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

        <Spin spinning={gridPending}>
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            {gridError ? (
              <QueryError compact title="場地借用情形載入失敗" error={gridError.error} onRetry={gridError.retry} />
            ) : !venueDef ? (
              <table aria-label="各場地單日借用情形" style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%', tableLayout: 'fixed', minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 176, textAlign: 'left', paddingRight: 8 }}>場地</th>
                    {PERIODS.map((p) => (
                      <th key={p} className="num" style={thStyle}>{p}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {venues.map((v) => (
                    <tr key={v.id}>
                      <td style={{ whiteSpace: 'nowrap', paddingRight: 8 }}>
                        <button
                          type="button"
                          className="venue-btn"
                          aria-label={`檢視 ${v.name} ${VENUE_DAYS} 天場況`}
                          onClick={() => openVenue(v.id)}
                        >
                          {v.name}
                        </button>
                        {v.capacity != null && (
                          <span className="num" style={{ fontSize: 11, color: 'var(--steel)', marginLeft: 5 }}>{v.capacity}</span>
                        )}
                      </td>
                      {PERIODS.map((p) => {
                        const { state, club } = cellOf(v, dayQuery.data, p)
                        const label = `${v.name} 第${p}節:${CELL[state].label}`
                        return (
                          <td key={p}>
                            <Cell state={state} label={label} club={club} onBook={() => book(v.id, gridDate, p)} />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table aria-label={`${venueDef.name} ${VENUE_DAYS} 天借用情形`} style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%', tableLayout: 'fixed', minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 110, textAlign: 'left', paddingRight: 8 }}>日期</th>
                    {PERIODS.map((p) => (
                      <th key={p} className="num" style={thStyle}>{p}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {venueDates.map((d) => {
                    const isToday = d.isSame(todayStart, 'day')
                    const grid = rangeQuery.byDate[d.format('YYYY-MM-DD')]
                    return (
                      <tr key={d.format('YYYY/MM/DD')}>
                        <td className="num" style={{ whiteSpace: 'nowrap', paddingRight: 8, fontSize: 12, fontWeight: isToday ? 600 : 400, color: isToday ? 'var(--seal)' : 'var(--ink)' }}>
                          {d.format('MM/DD')}（{WEEKDAY[d.day()]}）
                        </td>
                        {PERIODS.map((p) => {
                          const { state, club } = cellOf(venueDef, grid, p)
                          const label = `${d.format('MM/DD')} 第${p}節:${CELL[state].label}`
                          return (
                            <td key={p}>
                              <Cell state={state} label={label} club={club} onBook={() => book(venueDef.id, d, p)} />
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
        </Spin>
      </div>

      {/* 我的借用:單卡整併(固定/臨時/器材),後端僅回傳本社資料 */}
      <Spin spinning={listsPending}>
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近借用</div>
          <table className="tb" aria-label="最近借用" style={{ minWidth: 680 }}>
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
                <tr key={`room-${r.id}`}>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>固定場地</td>
                  <td style={{ fontWeight: 500 }}>{r.venueName}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                    每週 {r.entries.map(roomEntryText).join('、')}
                  </td>
                  <td><StatusPill status={r.status} /></td>
                </tr>
              ))}
              {venueBookings.map((v) => (
                <tr key={`venue-${v.id}`}>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>臨時場地</td>
                  <td style={{ fontWeight: 500 }}>{v.venueName}<span style={{ color: 'var(--steel)', fontWeight: 400, fontSize: 13 }}> · {v.purpose}</span></td>
                  <td className="num" style={{ color: 'var(--steel)', fontSize: 13 }}>{v.date} 第 {v.periods.join('、')} 節</td>
                  <td><StatusPill status={v.status} /></td>
                </tr>
              ))}
              {active.map((l) => (
                <tr key={`loan-${l.id}`}>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>器材</td>
                  <td style={{ fontWeight: 500 }}>{l.equipmentName} <span className="num">×{l.qty}</span></td>
                  <td className="num" style={{ color: 'var(--steel)', fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                  <td><StatusPill status={l.status} /></td>
                </tr>
              ))}
              {listsErrored.length > 0 && (
                <tr className="no-hover">
                  <td colSpan={4}>
                    <QueryError compact title="借用紀錄載入失敗" error={listsErrored[0]?.error} onRetry={retryLists} />
                  </td>
                </tr>
              )}
              {listsErrored.length === 0 && !listsPending && rooms.length === 0 && venueBookings.length === 0 && active.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>尚無借用紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 已歸還:獨立分頁區(後端列表無狀態篩選,自全量資料切分後前端分頁) */}
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近歸還</div>
          <table className="tb" aria-label="最近歸還" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th scope="col">品項</th>
                <th scope="col">借用期間</th>
                <th scope="col">用途</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {returnedPaged.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500 }}>
                    {l.equipmentName} <span className="num">×{l.qty}</span>
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>{l.purpose}</td>
                  <td style={{ width: 100 }}><StatusPill status="returned" /></td>
                </tr>
              ))}
              {loansQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={4}>
                    <QueryError compact title="歸還紀錄載入失敗" error={loansQuery.error} onRetry={() => loansQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!loansQuery.isError && returned.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>尚無歸還紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager page={returnedPage} pageSize={RETURNED_PAGE} total={returned.length} onChange={setReturnedPage} style={{ padding: '10px 0 14px' }} />
        </div>
      </Spin>
    </div>
  )
}

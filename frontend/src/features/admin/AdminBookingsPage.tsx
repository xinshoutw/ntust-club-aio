import { useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { App, Button, DatePicker, Spin, Tooltip } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { Cols, Pager } from '../../components/ui/tableControls'
import BookingReviewModal from './BookingReviewModal'
import { CELL, type CellState } from '../bookings/cells'
import { PERIODS } from '../../api/bookings'
import {
  useAdminAvailability,
  useAdminBookingMutations,
  useAdminVenues,
  usePendingEquipmentLoans,
  usePendingVenueBookings,
  type AdminEquipmentLoan,
  type AdminVenueBooking,
} from '../../api/adminBookings'

const GRID_LEGEND: CellState[] = ['free', 'reviewing', 'temp', 'fixed']
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
const PAGE_SIZE = 50

// API 場況格狀態 → 色格狀態(未列出的格=可借)
const CELL_STATE = {
  pending: 'reviewing',
  temp: 'temp',
  fixed: 'fixed',
  blocked: 'closed', // 不開放規則(Rule Page):不畫方框
} as const

type ReviewItem =
  | { kind: 'venue'; data: AdminVenueBooking }
  | { kind: 'loan'; data: AdminEquipmentLoan }

export default function AdminBookingsPage() {
  const { message } = App.useApp()
  const [selected, setSelected] = useState<ReviewItem | null>(null)
  const [open, setOpen] = useState(false)
  const [gridDate, setGridDate] = useState<Dayjs>(() => dayjs())
  const [venuePage, setVenuePage] = useState(1)
  const [loanPage, setLoanPage] = useState(1)

  const venuesQuery = useAdminVenues()
  const gridQuery = useAdminAvailability(gridDate.format('YYYY-MM-DD'))
  const venueQuery = usePendingVenueBookings({ page: venuePage, pageSize: PAGE_SIZE })
  const loanQuery = usePendingEquipmentLoans({ page: loanPage, pageSize: PAGE_SIZE })
  const { approveVenue, rejectVenue, approveLoan, rejectLoan } = useAdminBookingMutations()

  const venues = venuesQuery.data ?? []
  const grid = gridQuery.data ?? {}
  const pendingVenues = venueQuery.data?.bookings ?? []
  const venueTotal = venueQuery.data?.total ?? 0
  const pendingLoans = loanQuery.data?.loans ?? []
  const loanTotal = loanQuery.data?.total ?? 0

  const openReview = (item: ReviewItem) => {
    setSelected(item)
    setOpen(true)
  }

  // 場況「審核中」格點擊:以 booking_id 對照待審列表資料開審核彈窗
  const openReviewByGrid = (bookingId: number) => {
    const booking = pendingVenues.find((v) => v.apiId === bookingId)
    if (booking) {
      openReview({ kind: 'venue', data: booking })
    } else {
      message.error('找不到對應的待審申請,請於下方待審列表開啟')
    }
  }

  return (
    <div>
      <PageHeader
        title="臨時場地器材借用"
        sub={
          <>
            待審 <span className="num">{venueTotal + loanTotal}</span> 件
          </>
        }
      />

      {/* 場地借用情形(與社團端同構):僅「審核中」橘格可點,點擊直接開該筆審核彈窗 */}
      <div className="card" style={{ marginTop: 20, padding: '16px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginRight: 4 }}>場地借用情形</div>
          <Tooltip title="前一天">
            <Button size="small" icon={<LeftOutlined />} aria-label="前一天" onClick={() => setGridDate((d) => d.subtract(1, 'day'))} />
          </Tooltip>
          <DatePicker
            format={(d) => `${d.format('YYYY/MM/DD')}(週${WEEKDAY[d.day()]})`}
            size="small"
            allowClear={false}
            suffixIcon={null}
            style={{ width: 156 }}
            value={gridDate}
            onChange={(d) => d && setGridDate(d)}
          />
          <Tooltip title="後一天">
            <Button size="small" icon={<RightOutlined />} aria-label="後一天" onClick={() => setGridDate((d) => d.add(1, 'day'))} />
          </Tooltip>
          <Button size="small" onClick={() => setGridDate(dayjs())}>今天</Button>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {GRID_LEGEND.map((k) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--steel)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: CELL[k].bg, border: '1px solid rgba(31,36,48,.12)' }} />
                {CELL[k].label}
              </span>
            ))}
          </div>
        </div>
        <Spin spinning={venuesQuery.isPending || gridQuery.isPending}>
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table aria-label="場地借用情形" style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%', tableLayout: 'fixed', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ fontSize: 11, fontWeight: 500, color: 'var(--steel)', width: 176, textAlign: 'left', paddingRight: 8 }}>場地(容納人數)</th>
                  {PERIODS.map((p) => (
                    <th key={p} className="num" style={{ fontSize: 11, fontWeight: 500, color: 'var(--steel)' }}>{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {venues.map((v) => (
                  <tr key={v.id}>
                    <td style={{ whiteSpace: 'nowrap', paddingRight: 8, fontSize: 13 }}>
                      {v.name}
                      {v.capacity != null && (
                        <span className="num" style={{ fontSize: 11, color: 'var(--steel)', marginLeft: 5 }}>{v.capacity}</span>
                      )}
                    </td>
                    {PERIODS.map((p) => {
                      const cell = grid[String(v.id)]?.[p]
                      const state: CellState = cell ? CELL_STATE[cell.status] : 'free'
                      // API 格值僅審核中帶申請 id;社團名以待審列表對照(其餘格無社團資訊)
                      const club =
                        cell?.bookingId != null
                          ? pendingVenues.find((b) => b.apiId === cell.bookingId)?.club
                          : undefined
                      // 固定借用的審核中格點不了(要到「固定場地借用審核」),標示上要說清楚
                      const kindNote = state === 'reviewing' && cell?.kind === 'fixed' ? '(固定借用)' : ''
                      const label = `${v.name} 第${p}節:${CELL[state].label}${kindNote}${club ? `(${club})` : ''}`
                      const base: React.CSSProperties = { width: '100%', height: 24, borderRadius: 4, background: CELL[state].bg, display: 'block' }
                      const el =
                        state === 'reviewing' && cell?.bookingId != null ? (
                          <button
                            type="button"
                            aria-label={`${label},點擊開啟審核`}
                            onClick={() => openReviewByGrid(cell.bookingId!)}
                            style={{ ...base, border: 'none', padding: 0, cursor: 'pointer' }}
                          />
                        ) : (
                          <div role="img" aria-label={label} style={base} />
                        )
                      return (
                        <td key={p}>
                          {club ? (
                            <Tooltip title={<span style={{ fontSize: 14 }}>{club}</span>} mouseEnterDelay={0}>
                              {el}
                            </Tooltip>
                          ) : (
                            el
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(venuesQuery.isError || gridQuery.isError) && (
            <div style={{ textAlign: 'center', color: '#B03A2E', padding: '12px 0 2px', fontSize: 13 }}>
              載入失敗:{venuesQuery.error?.message ?? gridQuery.error?.message}
            </div>
          )}
        </Spin>
      </div>

      <Spin spinning={venueQuery.isPending}>
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>場地</div>
          <table className="tb dense fixed" aria-label="待審場地借用" style={{ minWidth: 720 }}>
            {/* 社團/場地截斷、時段與用途吃剩餘寬且允許換行;日期/狀態/開啟固定 px */}
            <Cols widths={['18%', '18%', 96, 'auto', 90, 32]} />
            <thead>
              <tr>
                <th>社團</th>
                <th>場地</th>
                <th>日期</th>
                <th>時段與用途</th>
                <th>狀態</th>
                <th aria-label="開啟" />
              </tr>
            </thead>
            <tbody>
              {pendingVenues.map((v) => (
                <tr key={v.id} onClick={() => openReview({ kind: 'venue', data: v })} style={{ cursor: 'pointer' }}>
                  <td className="cell-clip" title={v.club}>{v.club}</td>
                  <td className="cell-clip" title={v.venue || '未命名場地'} style={{ fontWeight: 500 }}>
                    <button
                      type="button"
                      className="row-open-btn"
                      aria-label={`開啟 ${v.club} 借用「${v.venue || '未命名場地'}」的審核`}
                      onClick={(e) => {
                        e.stopPropagation()
                        openReview({ kind: 'venue', data: v })
                      }}
                    >
                      {v.venue || '未命名場地'}
                    </button>
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>第 {v.periods.join('、')} 節 · {v.purpose}</td>
                  <td><StatusPill status={v.status} /></td>
                  <td className="r"><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
                </tr>
              ))}
              {venueQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: '#B03A2E', padding: 24 }}>
                    載入失敗:{venueQuery.error.message}
                  </td>
                </tr>
              )}
              {!venueQuery.isPending && !venueQuery.isError && pendingVenues.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>沒有待審的場地借用</td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager page={venuePage} pageSize={PAGE_SIZE} total={venueTotal} onChange={setVenuePage} />
        </div>
      </Spin>

      <Spin spinning={loanQuery.isPending}>
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>器材</div>
          <table className="tb dense fixed" aria-label="待審器材借用" style={{ minWidth: 720 }}>
            {/* 社團截斷、器材與數量允許換行(數量須可見)、活動與用途吃剩餘寬;期間/狀態/開啟固定 px */}
            <Cols widths={['16%', '20%', 184, 'auto', 90, 32]} />
            <thead>
              <tr>
                <th>社團</th>
                <th>器材與數量</th>
                <th>借用期間</th>
                <th>活動與用途</th>
                <th>狀態</th>
                <th aria-label="開啟" />
              </tr>
            </thead>
            <tbody>
              {pendingLoans.map((l) => {
                // 該區間可借數不足:數量紅字提示(是否核准由管理員裁量)
                const short = l.availableExcludingSelf != null && l.qty > l.availableExcludingSelf
                return (
                  <tr key={l.id} onClick={() => openReview({ kind: 'loan', data: l })} style={{ cursor: 'pointer' }}>
                    <td className="cell-clip" title={l.club}>{l.club}</td>
                    <td style={{ fontWeight: 500 }}>
                      <button
                        type="button"
                        className="row-open-btn"
                        aria-label={`開啟 ${l.club} 借用「${l.equipment || '未命名器材'}」的審核`}
                        onClick={(e) => {
                          e.stopPropagation()
                          openReview({ kind: 'loan', data: l })
                        }}
                      >
                        {l.equipment || '未命名器材'}
                      </button>{' '}
                      {short ? (
                        <Tooltip title={`該區間可借 ${l.availableExcludingSelf}`}>
                          <span className="num" style={{ color: '#B03A2E', fontWeight: 600 }}>×{l.qty}</span>
                        </Tooltip>
                      ) : (
                        <span className="num">×{l.qty}</span>
                      )}
                    </td>
                    <td className="num" style={{ fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                    <td style={{ fontSize: 13, color: 'var(--steel)' }}>
                      {l.activity ? `${l.activity} · ${l.purpose}` : l.purpose}
                    </td>
                    <td><StatusPill status={l.status} /></td>
                    <td className="r"><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
                  </tr>
                )
              })}
              {loanQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: '#B03A2E', padding: 24 }}>
                    載入失敗:{loanQuery.error.message}
                  </td>
                </tr>
              )}
              {!loanQuery.isPending && !loanQuery.isError && pendingLoans.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>沒有待審的器材借用</td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager page={loanPage} pageSize={PAGE_SIZE} total={loanTotal} onChange={setLoanPage} />
        </div>
      </Spin>

      {/* Modal 常駐至關閉動畫結束(afterClose)才卸載 */}
      {selected && (
        <BookingReviewModal
          key={selected.data.id}
          item={selected}
          open={open}
          onClose={() => setOpen(false)}
          afterClose={() => setSelected(null)}
          onApprove={() =>
            selected.kind === 'venue'
              ? approveVenue.mutateAsync(selected.data.apiId)
              : approveLoan.mutateAsync(selected.data.apiId)
          }
          onReject={(reason) =>
            selected.kind === 'venue'
              ? rejectVenue.mutateAsync({ id: selected.data.apiId, reason })
              : rejectLoan.mutateAsync({ id: selected.data.apiId, reason })
          }
        />
      )}
    </div>
  )
}

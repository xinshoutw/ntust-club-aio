import { useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { App, Button, DatePicker, Dropdown, Spin, Tooltip } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { Cols, Pager } from '../../components/ui/tableControls'
import BookingReviewModal, { type BookingReviewItem } from './BookingReviewModal'
import { CELL, emptyCellState, type CellState } from '../bookings/cells'
import { PERIODS } from '../../api/bookings'
import {
  useAdminAvailability,
  useAdminBookingMutations,
  useAdminVenues,
  usePendingEquipmentLoans,
  usePendingVenueBookings,
  type GridCell,
} from '../../api/adminBookings'

const GRID_LEGEND: CellState[] = ['free', 'fixedOnly', 'closed', 'reviewing', 'temp', 'fixed']
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
const PAGE_SIZE = 50

// API 場況格狀態 → 色格狀態(未列出的格=可借)
const CELL_STATE = {
  pending: 'reviewing',
  temp: 'temp',
  fixed: 'fixed',
  blocked: 'closed', // 不開放規則(Rule Page):不畫方框
} as const

/** 格的說明文字:格色所屬(不開放格為原因)+ 該格所有待審單。
 *  已核准蓋過審核中,但底下壓著誰的申請正是承辦要看見的衝突,不能只剩顏色。 */
function cellText(state: CellState, cell: GridCell | undefined): string {
  const parts = [`${CELL[state].label}${cell?.club && state !== 'reviewing' ? `(${cell.club})` : ''}`]
  if (cell?.pending.length) {
    const who = cell.pending.map((p) => (p.kind === 'fixed' ? `${p.club}(固定借用)` : p.club))
    parts.push(`待審:${who.join('、')}`)
  }
  return parts.join(' · ')
}

export default function AdminBookingsPage() {
  const { message } = App.useApp()
  const [selected, setSelected] = useState<BookingReviewItem | null>(null)
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

  const openReview = (item: BookingReviewItem) => {
    setSelected(item)
    setOpen(true)
  }

  // 場況格點擊:以申請 id 對照待審列表資料開審核彈窗(列表只有本頁,找不到就指路)
  const openReviewByGrid = (bookingId: number, club: string) => {
    const booking = pendingVenues.find((v) => v.apiId === bookingId)
    if (booking) {
      openReview({ kind: 'venue', data: booking })
    } else {
      message.error(`「${club}」的待審申請不在目前這一頁,請於下方待審列表翻頁開啟`)
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
                  <th scope="col" style={{ fontSize: 11, fontWeight: 500, color: 'var(--steel)', width: 176, textAlign: 'left', paddingRight: 8 }}>場地(容納人數)</th>
                  {PERIODS.map((p) => (
                    <th scope="col" key={p} className="num" style={{ fontSize: 11, fontWeight: 500, color: 'var(--steel)' }}>{p}</th>
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
                      // 未列出的格不是一律可借:場地可能只開放固定借用,或整個不開放
                      const state: CellState = cell ? CELL_STATE[cell.status] : emptyCellState(v)
                      const text = cellText(state, cell)
                      const label = `${v.name} 第${p}節:${text}`
                      // 可點的是臨時借用待審單(固定借用要到「固定場地借用審核」審);
                      // 已核准蓋過審核中的格子照樣點得到底下的待審單
                      const openable = (cell?.pending ?? []).filter((x) => x.id != null)
                      // 格色被更高權重的狀態佔走時,底下壓著的待審單要看得見 —— 不開放格
                      // 本來就是透明無框,不標的話那顆可點的格子在畫面上根本不存在
                      const hidden = state !== 'reviewing' && (cell?.pending.length ?? 0) > 0
                      const base: React.CSSProperties = {
                        width: '100%',
                        height: 24,
                        borderRadius: 4,
                        background: CELL[state].bg,
                        display: 'block',
                        boxShadow: hidden ? `inset 0 0 0 2px ${CELL.reviewing.bg}` : undefined,
                      }
                      const el =
                        openable.length > 0 ? (
                          <button
                            type="button"
                            aria-label={`${label},點擊開啟審核`}
                            onClick={
                              openable.length === 1
                                ? () => openReviewByGrid(openable[0].id!, openable[0].club)
                                : undefined
                            }
                            style={{ ...base, border: 'none', padding: 0, cursor: 'pointer' }}
                          />
                        ) : (
                          <div role="img" aria-label={label} style={base} />
                        )
                      // 同一格多筆待審(兩社搶同一格):每一筆都要點得到,不能只留一筆
                      const clickable =
                        openable.length > 1 ? (
                          <Dropdown
                            trigger={['click']}
                            menu={{
                              items: openable.map((x) => ({
                                key: String(x.id),
                                label: `審核 ${x.club} 的申請`,
                                onClick: () => openReviewByGrid(x.id!, x.club),
                              })),
                            }}
                          >
                            {el}
                          </Dropdown>
                        ) : (
                          el
                        )
                      return (
                        <td key={p}>
                          {cell ? (
                            <Tooltip title={<span style={{ fontSize: 14 }}>{text}</span>} mouseEnterDelay={0}>
                              {clickable}
                            </Tooltip>
                          ) : (
                            clickable
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
            <div style={{ textAlign: 'center', color: '#C13B34', padding: '12px 0 2px', fontSize: 13 }}>
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
                <th scope="col">社團</th>
                <th scope="col">場地</th>
                <th scope="col">日期</th>
                <th scope="col">時段與用途</th>
                <th scope="col">狀態</th>
                <th scope="col" aria-label="開啟" />
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
                  <td colSpan={6} style={{ textAlign: 'center', color: '#C13B34', padding: 24 }}>
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
                <th scope="col">社團</th>
                <th scope="col">器材與數量</th>
                <th scope="col">借用期間</th>
                <th scope="col">活動與用途</th>
                <th scope="col">狀態</th>
                <th scope="col" aria-label="開啟" />
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
                          <span className="num" style={{ color: '#C13B34', fontWeight: 600 }}>×{l.qty}</span>
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
                  <td colSpan={6} style={{ textAlign: 'center', color: '#C13B34', padding: 24 }}>
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

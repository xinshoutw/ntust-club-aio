import { useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { Button, DatePicker, Tooltip } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import BookingReviewModal, { type BookingReviewItem } from './BookingReviewModal'
import {
  CELL,
  EQUIPMENT_LOANS,
  PERIODS,
  VENUES,
  VENUE_BOOKINGS,
  cellInfo,
  type CellState,
} from '../bookings/mock'

const GRID_LEGEND: CellState[] = ['free', 'reviewing', 'temp', 'fixed']
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

export default function AdminBookingsPage() {
  const [selected, setSelected] = useState<BookingReviewItem | null>(null)
  const [open, setOpen] = useState(false)
  const [gridDate, setGridDate] = useState<Dayjs>(() => dayjs())
  const pendingVenues = VENUE_BOOKINGS.filter((v) => v.status === 'pending')
  const pendingLoans = EQUIPMENT_LOANS.filter((l) => l.status === 'pending')

  const openReview = (item: BookingReviewItem) => {
    setSelected(item)
    setOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="臨時場地器材借用"
        sub={
          <>
            待審 <span className="num">{pendingVenues.length + pendingLoans.length}</span> 件
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
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%', tableLayout: 'fixed', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ fontSize: 11, fontWeight: 500, color: 'var(--steel)', width: 176, textAlign: 'left', paddingRight: 8 }}>場地(容納人數)</th>
                {PERIODS.map((p) => (
                  <th key={p} className="num" style={{ fontSize: 11, fontWeight: 500, color: 'var(--steel)' }}>{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VENUES.map((v) => (
                <tr key={v.name}>
                  <td style={{ whiteSpace: 'nowrap', paddingRight: 8, fontSize: 13 }}>
                    {v.name}
                    <span className="num" style={{ fontSize: 11, color: 'var(--steel)', marginLeft: 5 }}>{v.capacity}</span>
                  </td>
                  {PERIODS.map((p) => {
                    const info = cellInfo(v.name, gridDate, p)
                    const label = `${v.name} 第${p}節:${CELL[info.state].label}${info.club ? `(${info.club})` : ''}`
                    const base: React.CSSProperties = { width: '100%', height: 24, borderRadius: 4, background: CELL[info.state].bg, display: 'block' }
                    const el =
                      info.state === 'reviewing' && info.booking ? (
                        <button
                          type="button"
                          aria-label={`${label},點擊開啟審核`}
                          onClick={() => openReview({ kind: 'venue', data: info.booking! })}
                          style={{ ...base, border: 'none', padding: 0, cursor: 'pointer' }}
                        />
                      ) : (
                        <div role="img" aria-label={label} style={base} />
                      )
                    return (
                      <td key={p}>
                        {info.club ? (
                          <Tooltip title={<span style={{ fontSize: 14 }}>{info.club}</span>} mouseEnterDelay={0}>
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
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>場地</div>
        <table className="tb dense" style={{ minWidth: 720 }}>
          <tbody>
            {pendingVenues.map((v) => (
              <tr key={v.id} onClick={() => openReview({ kind: 'venue', data: v })} style={{ cursor: 'pointer' }}>
                <td>{v.club}</td>
                <td style={{ fontWeight: 500 }}>{v.venue}</td>
                <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>第 {v.periods.join('、')} 節 · {v.purpose}</td>
                <td style={{ width: 90 }}><StatusPill status={v.status} /></td>
                <td className="r" style={{ width: 32 }}><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
              </tr>
            ))}
            {pendingVenues.length === 0 && (
              <tr className="no-hover">
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>沒有待審的場地借用</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>器材</div>
        <table className="tb dense" style={{ minWidth: 720 }}>
          <tbody>
            {pendingLoans.map((l) => (
              <tr key={l.id} onClick={() => openReview({ kind: 'loan', data: l })} style={{ cursor: 'pointer' }}>
                <td>{l.club}</td>
                <td style={{ fontWeight: 500 }}>
                  {l.equipment} <span className="num">×{l.qty}</span>
                </td>
                <td className="num" style={{ fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{l.purpose}</td>
                <td style={{ width: 90 }}><StatusPill status={l.status} /></td>
                <td className="r" style={{ width: 32 }}><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
              </tr>
            ))}
            {pendingLoans.length === 0 && (
              <tr className="no-hover">
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>沒有待審的器材借用</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal 常駐至關閉動畫結束(afterClose)才卸載 */}
      {selected && (
        <BookingReviewModal
          key={selected.data.id}
          item={selected}
          open={open}
          onClose={() => setOpen(false)}
          afterClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

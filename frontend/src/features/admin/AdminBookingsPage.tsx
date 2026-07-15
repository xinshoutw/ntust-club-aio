import { useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { App, Button, DatePicker, Input, Modal, Tooltip } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import {
  CELL,
  EQUIPMENT,
  EQUIPMENT_LOANS,
  PERIODS,
  VENUES,
  VENUE_BOOKINGS,
  cellInfo,
  type CellState,
  type EquipmentLoan,
  type VenueBooking,
} from '../bookings/mock'

type Pending = { kind: 'venue'; data: VenueBooking } | { kind: 'loan'; data: EquipmentLoan }

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }
const GRID_LEGEND: CellState[] = ['free', 'reviewing', 'temp', 'fixed']
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

// 臨時場地/器材借用審核彈窗:核准或退回(退回原因必填)
function BookingReviewModal({
  item,
  open,
  onClose,
  afterClose,
}: {
  item: Pending
  open: boolean
  onClose: () => void
  afterClose: () => void
}) {
  const { message } = App.useApp()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const id = item.data.id
  const title = item.kind === 'venue' ? item.data.venue : `${item.data.equipment} ×${item.data.qty}`

  const closeReject = () => {
    setRejectOpen(false)
    setReason('')
  }

  const submitReject = () => {
    if (!reason.trim()) {
      message.error('退回原因為必填。')
      return
    }
    message.success(`已退回 ${id}(通知社團修正重送)`)
    closeReject()
    onClose()
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      width={520}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 26 }}>
          <span className="num" style={{ fontSize: 13, color: 'var(--steel)', fontWeight: 400 }}>{id}</span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
          <StatusPill status="pending" />
        </div>
      }
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--steel)', flex: 1 }}>退回原因必填。</div>
          <Button danger style={{ height: 38 }} onClick={() => setRejectOpen(true)}>退回…</Button>
          <Button
            type="primary"
            style={{ height: 38 }}
            onClick={() => {
              message.success(`已核准 ${id}`)
              onClose()
            }}
          >
            核准
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: '9px 12px', fontSize: 13, marginTop: 4 }}>
        <div style={detailLabel}>社團</div><div>{item.data.club}</div>
        {item.kind === 'venue' ? (
          <>
            <div style={detailLabel}>場地</div><div>{item.data.venue}</div>
            <div style={detailLabel}>日期時段</div>
            <div className="num">{item.data.date} 第 {item.data.periods.join('、')} 節</div>
          </>
        ) : (
          <>
            <div style={detailLabel}>器材</div><div>{item.data.equipment} <span className="num">×{item.data.qty}</span></div>
            <div style={detailLabel}>借用區間</div><div className="num">{item.data.startDate} – {item.data.endDate}</div>
            {item.data.activity && (
              <>
                <div style={detailLabel}>綁定活動</div><div>{item.data.activity}</div>
              </>
            )}
          </>
        )}
        <div style={detailLabel}>用途</div><div>{item.data.purpose || '—'}</div>
      </div>

      {/* 器材可借數檢核:核准會使該品項可借數不足時提醒 */}
      {item.kind === 'loan' &&
        (() => {
          const eq = EQUIPMENT.find((e) => e.name === item.data.equipment)
          if (!eq || item.data.qty <= eq.available) return null
          return (
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--paper)', borderRadius: 6, fontSize: 13, color: '#B03A2E' }}>
              可借數不足:目前「{eq.name}」可借 <span className="num">{eq.available}</span>,本單申請{' '}
              <span className="num">{item.data.qty}</span>;核准前請確認歸還排程。
            </div>
          )
        })()}

      <Modal
        open={rejectOpen}
        title="退回借用申請"
        okText="確認退回"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onOk={submitReject}
        onCancel={closeReject}
      >
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 8 }}>退回原因(必填,通知社團)</div>
        <Input.TextArea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例:所選時段已有其他社團借用"
        />
      </Modal>
    </Modal>
  )
}

export default function AdminBookingsPage() {
  const [selected, setSelected] = useState<Pending | null>(null)
  const [open, setOpen] = useState(false)
  const [gridDate, setGridDate] = useState<Dayjs>(() => dayjs())
  const pendingVenues = VENUE_BOOKINGS.filter((v) => v.status === 'pending')
  const pendingLoans = EQUIPMENT_LOANS.filter((l) => l.status === 'pending')

  const openReview = (item: Pending) => {
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
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--steel)' }}>
          點「審核中」格開啟該筆申請的審核彈窗;其餘格僅供檢視。
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>場地</div>
        <table className="tb dense" style={{ minWidth: 720 }}>
          <tbody>
            {pendingVenues.map((v) => (
              <tr key={v.id} onClick={() => openReview({ kind: 'venue', data: v })} style={{ cursor: 'pointer' }}>
                <td className="num" style={{ color: 'var(--steel)', width: 140 }}>{v.id}</td>
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
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>沒有待審的場地借用。</td>
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
                <td className="num" style={{ color: 'var(--steel)', width: 140 }}>{l.id}</td>
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
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>沒有待審的器材借用。</td>
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

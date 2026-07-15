import { useState } from 'react'
import { App, Button, Input, Modal } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { EQUIPMENT_LOANS, VENUE_BOOKINGS, type EquipmentLoan, type VenueBooking } from '../bookings/mock'

type Pending = { kind: 'venue'; data: VenueBooking } | { kind: 'loan'; data: EquipmentLoan }

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }

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
          </>
        )}
        <div style={detailLabel}>用途</div><div>{item.data.purpose || '—'}</div>
      </div>

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

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
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

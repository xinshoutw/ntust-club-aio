import { useState } from 'react'
import { App, Button, Input, Modal } from 'antd'
import StatusPill from '../../components/ui/StatusPill'
import {
  DOW_TEXT,
  ROOM_REQUESTS,
  availableInWindow,
  type EquipmentLoan,
  type RoomRequest,
  type VenueBooking,
} from '../bookings/mock'

export type BookingReviewItem =
  | { kind: 'venue'; data: VenueBooking }
  | { kind: 'loan'; data: EquipmentLoan }
  | { kind: 'room'; data: RoomRequest }

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }

// 固定借用衝突=兩社搶同教室同星期同節次(僅比對審核中申請;與教室固定借用審核頁同邏輯)
const isRoomConflict = (room: RoomRequest, dow: number, period: string): boolean =>
  ROOM_REQUESTS.some(
    (o) =>
      o.id !== room.id &&
      o.status === 'pending' &&
      o.room === room.room &&
      o.entries.some((e) => e.dow === dow && e.periods.includes(period)),
  )

// 場地/器材借用審核彈窗(臨時場地器材審核頁與行政端社團總覽共用):
// 審核中顯示核准/退回(退回原因必填),其他狀態唯讀;含器材可借數檢核與固定借用衝突標示
export default function BookingReviewModal({
  item,
  open,
  onClose,
  afterClose,
}: {
  item: BookingReviewItem
  open: boolean
  onClose: () => void
  afterClose: () => void
}) {
  const { message } = App.useApp()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const canReview = item.data.status === 'pending'
  const title =
    item.kind === 'venue' ? item.data.venue : item.kind === 'room' ? item.data.room : `${item.data.equipment} ×${item.data.qty}`
  const roomConflict =
    item.kind === 'room' && canReview
      ? item.data.entries.some((e) => e.periods.some((p) => isRoomConflict(item.data, e.dow, p)))
      : false

  const closeReject = () => {
    setRejectOpen(false)
    setReason('')
  }

  const submitReject = () => {
    if (!reason.trim()) {
      message.error('退回原因為必填')
      return
    }
    message.success('已退回借用申請')
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
          <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
          <StatusPill status={item.data.status} />
        </div>
      }
      footer={
        canReview ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button danger style={{ height: 38 }} onClick={() => setRejectOpen(true)}>退回</Button>
            <Button
              type="primary"
              style={{ height: 38 }}
              onClick={() => {
                message.success('已核准借用申請')
                onClose()
              }}
            >
              核准
            </Button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--steel)' }}>非待審核申請，僅供查看</div>
        )
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: '9px 12px', fontSize: 13, marginTop: 4 }}>
        <div style={detailLabel}>社團</div><div>{item.data.club}</div>
        {item.kind === 'venue' && (
          <>
            <div style={detailLabel}>場地</div><div>{item.data.venue}</div>
            <div style={detailLabel}>日期時段</div>
            <div className="num">{item.data.date} 第 {item.data.periods.join('、')} 節</div>
          </>
        )}
        {item.kind === 'room' && (
          <>
            <div style={detailLabel}>場地</div><div>{item.data.room}</div>
            <div style={detailLabel}>每週時段</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {item.data.entries.flatMap((e) =>
                e.periods.map((p) => {
                  const conflict = canReview && isRoomConflict(item.data, e.dow, p)
                  return (
                    <span key={`${e.dow}-${p}`} className="num" style={{ color: conflict ? '#C13B34' : undefined, fontWeight: conflict ? 500 : undefined }}>
                      週{DOW_TEXT[e.dow]} 第 {p} 節{conflict && '（衝突）'}
                    </span>
                  )
                }),
              )}
            </div>
          </>
        )}
        {item.kind === 'loan' && (
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
        <div style={detailLabel}>用途</div><div>{(item.kind === 'room' ? item.data.note : item.data.purpose) || '—'}</div>
        {item.kind === 'loan' && item.data.returnDue && (
          <>
            <div style={detailLabel}>歸還期限</div><div className="num">{item.data.returnDue}</div>
          </>
        )}
        {item.kind === 'loan' && item.data.borrower && (
          <>
            <div style={detailLabel}>借用人</div><div>{item.data.borrower}</div>
          </>
        )}
        {item.kind === 'loan' && item.data.returnedBy && (
          <>
            <div style={detailLabel}>歸還人</div><div>{item.data.returnedBy}</div>
          </>
        )}
      </div>

      {/* 器材可借數檢核:以本單借用區間推導可借數(排除本單自身),不足時提醒;僅審核中需要 */}
      {item.kind === 'loan' &&
        canReview &&
        (() => {
          const free = availableInWindow(item.data.equipment, item.data.startDate, item.data.endDate, item.data.id)
          if (item.data.qty <= free) return null
          return (
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--paper)', borderRadius: 6, fontSize: 13, color: '#B03A2E' }}>
              可借數不足：該區間「{item.data.equipment}」可借 <span className="num">{free}</span>，本單申請{' '}
              <span className="num">{item.data.qty}</span>；核准前請確認歸還排程
            </div>
          )
        })()}

      {roomConflict && (
        <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--paper)', borderRadius: 6, fontSize: 13, color: '#B03A2E' }}>
          此申請與其他申請衝突，請擇一核准
        </div>
      )}

      <Modal
        open={rejectOpen}
        title="退回借用申請"
        okText="確認退回"
        destroyOnHidden
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onOk={submitReject}
        onCancel={closeReject}
      >
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 8 }}>退回原因(必填,通知社團)</div>
        <Input.TextArea
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例:所選時段已有其他社團借用"
        />
      </Modal>
    </Modal>
  )
}

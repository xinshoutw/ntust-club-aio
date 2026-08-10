import { useState } from 'react'
import { App, Button, Input, Modal } from 'antd'
import dayjs from 'dayjs'
import StatusPill from '../../components/ui/StatusPill'
import { DOW_TEXT } from '../../api/bookings'
import type {
  AdminEquipmentLoan,
  AdminRoomRequest,
  AdminVenueBooking,
} from '../../api/adminBookings'

// room 的 conflictKeys(`${dow}|${period}`)由呼叫端以全部審核中申請的現場資料計算,
// 比照 AdminRoomsPage 同邏輯——衝突=兩社搶同場地同星期同節次
export type BookingReviewItem =
  | { kind: 'venue'; data: AdminVenueBooking }
  | { kind: 'loan'; data: AdminEquipmentLoan }
  | { kind: 'room'; data: AdminRoomRequest & { conflictKeys?: string[] } }

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }

// 場地/器材借用審核彈窗(臨時場地器材審核頁與行政端社團總覽共用):
// 審核中顯示核准/退回(退回原因必填),其他狀態唯讀;含器材可借數檢核與固定借用衝突標示
// onApprove/onReject:接 API 的頁面傳入 mutateAsync 回呼(成功 message+關彈窗、失敗 message.error)
export default function BookingReviewModal({
  item,
  open,
  onClose,
  afterClose,
  onApprove,
  onReject,
  onRevoke,
}: {
  item: BookingReviewItem
  open: boolean
  onClose: () => void
  afterClose: () => void
  onApprove?: () => Promise<unknown>
  onReject?: (reason: string) => Promise<unknown>
  onRevoke?: (reason: string) => Promise<unknown>
}) {
  const { message } = App.useApp()
  // 同一個原因彈窗兩用:退回(待審)與撤銷(已核准)
  const [reasonMode, setReasonMode] = useState<'reject' | 'revoke' | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const canReview = item.data.status === 'pending'
  // 後端對臨時場地擋「日期已過」;過期單顯示撤銷鈕只會換來 409
  const notPast =
    item.kind !== 'venue' || !dayjs(item.data.date, 'YYYY/MM/DD').isBefore(dayjs(), 'day')
  const canRevoke = item.data.status === 'approved' && !!onRevoke && notPast
  const title =
    item.kind === 'venue' ? item.data.venue : item.kind === 'room' ? item.data.room : `${item.data.equipment} ×${item.data.qty}`
  const roomConflict = item.kind === 'room' && canReview && (item.data.conflictKeys?.length ?? 0) > 0

  const closeReason = () => {
    setReasonMode(null)
    setReason('')
  }

  const submitApprove = async () => {
    if (onApprove) {
      setSubmitting(true)
      try {
        await onApprove()
      } catch (e) {
        message.error(e instanceof Error ? e.message : '操作失敗')
        return
      } finally {
        setSubmitting(false)
      }
    }
    message.success('已核准借用申請')
    onClose()
  }

  const submitReason = async () => {
    const revoking = reasonMode === 'revoke'
    const trimmed = reason.trim()
    if (!trimmed) {
      message.error(revoking ? '撤銷原因為必填' : '退回原因為必填')
      return
    }
    const action = revoking ? onRevoke : onReject
    if (action) {
      setSubmitting(true)
      try {
        await action(trimmed)
      } catch (e) {
        message.error(e instanceof Error ? e.message : '操作失敗')
        return
      } finally {
        setSubmitting(false)
      }
    }
    message.success(revoking ? '已撤銷借用' : '已退回借用申請')
    closeReason()
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
            <Button danger style={{ height: 38 }} disabled={submitting} onClick={() => setReasonMode('reject')}>退回</Button>
            <Button
              type="primary"
              style={{ height: 38 }}
              loading={submitting && reasonMode === null}
              onClick={() => void submitApprove()}
            >
              核准
            </Button>
          </div>
        ) : canRevoke ? (
          <Button danger style={{ height: 38 }} disabled={submitting} onClick={() => setReasonMode('revoke')}>
            撤銷借用
          </Button>
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
                  const conflict = canReview && (item.data.conflictKeys?.includes(`${e.dow}|${p}`) ?? false)
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
      </div>

      {/* 器材可借數檢核:後端以本單借用區間推導可借數(排除本單自身),不足時提醒;僅審核中需要 */}
      {item.kind === 'loan' &&
        canReview &&
        (() => {
          const free = item.data.availableExcludingSelf
          if (free == null || item.data.qty <= free) return null
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
        open={reasonMode !== null}
        title={reasonMode === 'revoke' ? '撤銷已核准的借用' : '退回借用申請'}
        okText={reasonMode === 'revoke' ? '確認撤銷' : '確認退回'}
        destroyOnHidden
        confirmLoading={submitting}
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onOk={() => void submitReason()}
        onCancel={closeReason}
      >
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 8 }}>
          {reasonMode === 'revoke' ? '撤銷原因(必填,通知社團)' : '退回原因(必填,通知社團)'}
        </div>
        <Input.TextArea
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={reasonMode === 'revoke' ? '例:場地整修,該時段停止開放' : '例:所選時段已有其他社團借用'}
        />
      </Modal>
    </Modal>
  )
}

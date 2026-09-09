import { useState } from 'react'
import { App, Button, Input, InputNumber, Modal } from 'antd'
import dayjs from 'dayjs'
import StatusPill from '../../components/ui/StatusPill'
import { DOW_TEXT } from '../../api/bookings'
import { CONFLICT_TEXT, conflictNote } from '../../api/adminBookings'
import type {
  AdminEquipmentLoan,
  AdminRoomRequest,
  AdminVenueBooking,
  RoomConflictKind,
} from '../../api/adminBookings'

export type BookingReviewItem =
  | { kind: 'venue'; data: AdminVenueBooking }
  | { kind: 'loan'; data: AdminEquipmentLoan }
  | { kind: 'room'; data: AdminRoomRequest }

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }

// 場地/器材借用審核彈窗(臨時場地器材審核頁與行政端社團總覽共用):
// 審核中顯示核准/退回(退回原因必填),其他狀態唯讀;含器材可借數檢核與固定借用衝突標示
// onApprove/onReject:接 API 的頁面傳入 mutateAsync 回呼(成功 message+關彈窗、失敗 message.error)
export default function BookingReviewModal({
  item,
  conflicts,
  open,
  onClose,
  afterClose,
  onApprove,
  onReject,
  onRevoke,
}: {
  item: BookingReviewItem
  /** 固定借用衝突:`dow|period` → 種類。後端隨待審列帶回(booking_service.fixed_conflict_slots);
   *  呼叫端每次 render 由**現行清單**回查那一列 —— 用開窗當下的快照的話,重抓後的新結果就進不來 */
  conflicts?: Map<string, RoomConflictKind>
  open: boolean
  onClose: () => void
  afterClose: () => void
  /** 器材單帶核准數量(承辦改過才有值;場地與固定借用恆為 undefined) */
  onApprove?: (qty?: number) => Promise<unknown>
  onReject?: (reason: string) => Promise<unknown>
  onRevoke?: (reason: string) => Promise<unknown>
}) {
  const { message } = App.useApp()
  // 同一個原因彈窗兩用:退回(待審)與撤銷(已核准)
  const [reasonMode, setReasonMode] = useState<'reject' | 'revoke' | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // 器材核准數量:預設=申請數,承辦可改(可借數不足時核准較少的量,不必退回讓社團重送)
  const [approveQty, setApproveQty] = useState<number | null>(
    item.kind === 'loan' ? item.data.qty : null,
  )
  // 兩個回呼都接上才是審核模式(所有場地/器材借用那兩頁,持查閱鍵的人一個都不接):
  // 畫出核准或退回鈕卻沒有人接,按下去只會得到一句假的「已核准」「已退回」
  const canReview = item.data.status === 'pending' && !!onApprove && !!onReject
  // 後端對臨時場地擋「日期已過」;過期單顯示撤銷鈕只會換來 409
  const notPast =
    item.kind !== 'venue' || !dayjs(item.data.date, 'YYYY/MM/DD').isBefore(dayjs(), 'day')
  const canRevoke = item.data.status === 'approved' && !!onRevoke && notPast
  const title =
    item.kind === 'venue' ? item.data.venue : item.kind === 'room' ? item.data.room : `${item.data.equipment} ×${item.data.qty}`
  // 衝突僅對待審單有意義(已核准/已退回單不再顯示)
  const conflictOf = (dow: number, period: string) =>
    canReview ? conflicts?.get(`${dow}|${period}`) : undefined
  const note =
    item.kind === 'room'
      ? conflictNote(item.data.entries.flatMap((e) => e.periods.map((p) => conflictOf(e.dow, p))))
      : null

  const closeReason = () => {
    setReasonMode(null)
    setReason('')
  }

  const submitApprove = async () => {
    const qtyChanged = item.kind === 'loan' && approveQty != null && approveQty !== item.data.qty
    if (item.kind === 'loan' && approveQty == null) {
      message.error('請填寫核准數量')
      return
    }
    if (onApprove) {
      setSubmitting(true)
      try {
        await onApprove(qtyChanged ? (approveQty as number) : undefined)
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
          <div style={{ fontSize: 12, color: 'var(--steel)' }}>
            {item.data.status === 'pending' ? '僅供查看' : '非待審核申請，僅供查看'}
          </div>
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
                  const conflict = conflictOf(e.dow, p)
                  return (
                    <span key={`${e.dow}-${p}`} className="num" style={{ color: conflict ? '#C13B34' : undefined, fontWeight: conflict ? 500 : undefined }}>
                      週{DOW_TEXT[e.dow]} 第 {p} 節{conflict && CONFLICT_TEXT[conflict]}
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
            {canReview && (
              <>
                <div style={detailLabel}>核准數量</div>
                <div>
                  <InputNumber
                    aria-label="核准數量"
                    min={1}
                    max={item.data.qty}
                    precision={0}
                    size="small"
                    style={{ width: 96 }}
                    value={approveQty}
                    onChange={(v) => setApproveQty(typeof v === 'number' ? v : null)}
                  />
                  {approveQty != null && approveQty !== item.data.qty && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--steel)' }}>
                      申請 <span className="num">{item.data.qty}</span>，將以此數量核准
                    </span>
                  )}
                </div>
              </>
            )}
            {item.data.activity && (
              <>
                <div style={detailLabel}>綁定活動</div><div>{item.data.activity}</div>
              </>
            )}
          </>
        )}
        <div style={detailLabel}>用途</div><div>{(item.kind === 'room' ? item.data.note : item.data.purpose) || '—'}</div>
        {/* 固定借用的申請表沒有電話欄,只有臨時場地與器材填得到聯絡人 */}
        {item.kind !== 'room' && (
          <>
            <div style={detailLabel}>聯絡電話</div>
            <div className="num">{item.data.phone || '—'}</div>
          </>
        )}
        <div style={detailLabel}>送件時間</div>
        <div className="num">{item.data.createdAt}</div>
        {/* 承辦的處置(三種借用的輸出都帶):退回原因、撤銷原因,或核准時留的話(器材改數量)。
            退回件即使沒留理由也要有一列 —— 舊系統遷入的退回件多半是空的,那也是一個答案 */}
        {(item.data.decision || item.data.status === 'rejected') && (
          <>
            <div style={detailLabel}>
              {item.data.status === 'rejected' ? '退回原因' : item.data.status === 'cancelled' ? '撤銷原因' : '核准說明'}
            </div>
            <div>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: item.data.decision?.reason ? undefined : 'var(--steel)' }}>
                {item.data.decision?.reason || '系統未留下退回原因'}
              </div>
              {item.data.decision && (
                <div className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>
                  {item.data.decision.at}
                  {item.data.decision.by && ` · ${item.data.decision.by}`}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 器材可借數檢核:後端以本單借用區間推導可借數(排除本單自身),不足時提醒;僅審核中需要 */}
      {item.kind === 'loan' &&
        canReview &&
        (() => {
          const free = item.data.availableExcludingSelf
          const qty = approveQty ?? item.data.qty
          if (free == null || qty <= free) return null
          return (
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--paper)', borderRadius: 6, fontSize: 13, color: '#C13B34' }}>
              可借數不足：該區間「{item.data.equipment}」可借 <span className="num">{free}</span>，本單
              {qty === item.data.qty ? '申請' : '將核准'} <span className="num">{qty}</span>；核准前請確認歸還排程
            </div>
          )
        })()}

      {note && (
        <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--paper)', borderRadius: 6, fontSize: 13, color: '#C13B34' }}>
          {note}
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
          {reasonMode === 'revoke' ? '撤銷原因' : '退回原因'}
        </div>
        <Input.TextArea
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={reasonMode === 'revoke' ? '場地整修' : '所選時段已有其他社團借用'}
        />
      </Modal>
    </Modal>
  )
}

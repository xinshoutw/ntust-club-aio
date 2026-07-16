import { useState } from 'react'
import { App, Button, Input, Modal } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { DOW_TEXT, ROOM_REQUESTS, type RoomRequest } from '../bookings/mock'

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }

// 退回原因預設文案:每次開啟退回視窗都回到此值(可修改後送出)
const DEFAULT_REJECT_REASON = '很抱歉，目前時段無法受理。若仍有借用需求，請聯絡組長，謝謝'

// 教室固定借用審核彈窗:顯示每週時段(含衝突標示),核准或退回(退回原因必填)
// 衝突=兩社搶同教室同星期同節次;整單擇一核准,不做部分同意
function RoomReviewModal({
  item,
  isConflict,
  open,
  onClose,
  afterClose,
}: {
  item: RoomRequest
  isConflict: (dow: number, period: string) => boolean
  open: boolean
  onClose: () => void
  afterClose: () => void
}) {
  const { message } = App.useApp()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState(DEFAULT_REJECT_REASON)
  const hasConflict = item.entries.some((e) => e.periods.some((p) => isConflict(e.dow, p)))

  // 關閉時重設回預設文案,重開才不會是上次殘留或空白
  const closeReject = () => {
    setRejectOpen(false)
    setReason(DEFAULT_REJECT_REASON)
  }

  const submitReject = () => {
    if (!reason.trim()) {
      message.error('退回原因為必填')
      return
    }
    message.success(`已退回 ${item.club} 的固定借用申請`)
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
          <span style={{ fontSize: 16, fontWeight: 600 }}>{item.room}</span>
          <StatusPill status="pending" />
        </div>
      }
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          <Button danger style={{ height: 38 }} onClick={() => setRejectOpen(true)}>退回</Button>
          <Button
            type="primary"
            style={{ height: 38 }}
            onClick={() => {
              message.success(`已核准 ${item.club} 的固定借用申請`)
              onClose()
            }}
          >
            核准
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: '9px 12px', fontSize: 13, marginTop: 4 }}>
        <div style={detailLabel}>社團</div><div>{item.club}</div>
        <div style={detailLabel}>用途</div><div>{item.note || '—'}</div>
        <div style={detailLabel}>每週時段</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {item.entries.flatMap((e) =>
            e.periods.map((p) => {
              const conflict = isConflict(e.dow, p)
              return (
                <span key={`${e.dow}-${p}`} className="num" style={{ color: conflict ? '#C13B34' : undefined, fontWeight: conflict ? 500 : undefined }}>
                  週{DOW_TEXT[e.dow]} 第 {p} 節{conflict && '（衝突）'}
                </span>
              )
            }),
          )}
        </div>
      </div>
      {hasConflict && (
        <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--paper)', borderRadius: 6, fontSize: 13, color: '#B03A2E' }}>
          此申請與其他申請衝突，請擇一核准
        </div>
      )}

      <Modal
        open={rejectOpen}
        title="退回借用申請"
        okText="確認退回"
        destroyOnHidden
        okButtonProps={{ danger: true, autoFocus: true }}
        cancelText="取消"
        onOk={submitReject}
        onCancel={closeReject}
      >
        <Input.TextArea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="簡述說明"
        />
      </Modal>
    </Modal>
  )
}

export default function AdminRoomsPage() {
  const [selected, setSelected] = useState<RoomRequest | null>(null)
  const [open, setOpen] = useState(false)
  const pending = ROOM_REQUESTS.filter((r) => r.status === 'pending')

  // 標出互相衝突的時段(同教室每週同星期同節次);衝突時擇一社團核准,不做部分同意
  const conflictKeys = new Set<string>()
  const seen = new Map<string, string>()
  for (const r of pending) {
    for (const e of r.entries) {
      for (const p of e.periods) {
        const key = `${r.room}|${e.dow}|${p}`
        if (seen.has(key) && seen.get(key) !== r.id) {
          conflictKeys.add(key)
        } else {
          seen.set(key, r.id)
        }
      }
    }
  }
  const isConflict = (room: string) => (dow: number, period: string) => conflictKeys.has(`${room}|${dow}|${period}`)

  return (
    <div>
      <PageHeader
        title="教室固定借用"
        sub={
          <>
            待審 <span className="num">{pending.length}</span> 件
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb dense" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>社團</th>
              <th>教室</th>
              <th>每週時段</th>
              <th>用途</th>
              <th>狀態</th>
              <th aria-label="開啟" style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => (
              <tr
                key={r.id}
                onClick={() => {
                  setSelected(r)
                  setOpen(true)
                }}
                style={{ cursor: 'pointer' }}
              >
                <td>{r.club}</td>
                <td style={{ fontWeight: 500 }}>{r.room}</td>
                <td style={{ fontSize: 13 }}>
                  {r.entries.flatMap((e) =>
                    e.periods.map((p) => {
                      const conflict = conflictKeys.has(`${r.room}|${e.dow}|${p}`)
                      return (
                        <span key={`${e.dow}-${p}`} className="num" style={{ color: conflict ? '#C13B34' : undefined, fontWeight: conflict ? 500 : undefined, marginRight: 8, display: 'inline-block' }}>
                          週{DOW_TEXT[e.dow]} 第{p}節
                          {conflict && <span style={{ fontSize: 12 }}>(衝突)</span>}
                        </span>
                      )
                    }),
                  )}
                </td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{r.note}</td>
                <td><StatusPill status={r.status} /></td>
                <td className="r"><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr className="no-hover">
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>沒有待審的固定借用</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal 常駐至關閉動畫結束(afterClose)才卸載 */}
      {selected && (
        <RoomReviewModal
          key={selected.id}
          item={selected}
          isConflict={isConflict(selected.room)}
          open={open}
          onClose={() => setOpen(false)}
          afterClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

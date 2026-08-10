import { useState } from 'react'
import { App, Button, Input, Modal, Spin } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols, Pager } from '../../components/ui/tableControls'
import { DOW_TEXT } from '../bookings/mock'
import {
  useAdminBookingMutations,
  useAdminFixedWindow,
  usePendingRoomBookings,
  type AdminRoomRequest,
} from '../../api/adminBookings'

const PAGE_SIZE = 50

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
  item: AdminRoomRequest
  isConflict: (dow: number, period: string) => boolean
  open: boolean
  onClose: () => void
  afterClose: () => void
}) {
  const { message } = App.useApp()
  const { approveRoom, rejectRoom } = useAdminBookingMutations()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState(DEFAULT_REJECT_REASON)
  const hasConflict = item.entries.some((e) => e.periods.some((p) => isConflict(e.dow, p)))

  // 關閉時重設回預設文案,重開才不會是上次殘留或空白
  const closeReject = () => {
    setRejectOpen(false)
    setReason(DEFAULT_REJECT_REASON)
  }

  const submitApprove = () => {
    approveRoom.mutate(item.apiId, {
      onSuccess: () => {
        message.success(`已核准 ${item.club} 的固定借用申請`)
        onClose()
      },
      onError: (e) => message.error(e.message),
    })
  }

  const submitReject = () => {
    if (!reason.trim()) {
      message.error('退回原因為必填')
      return
    }
    rejectRoom.mutate(
      { id: item.apiId, reason: reason.trim() },
      {
        onSuccess: () => {
          message.success(`已退回 ${item.club} 的固定借用申請`)
          closeReject()
          onClose()
        },
        onError: (e) => message.error(e.message),
      },
    )
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
          <Button danger style={{ height: 38 }} disabled={approveRoom.isPending} onClick={() => setRejectOpen(true)}>退回</Button>
          <Button type="primary" style={{ height: 38 }} loading={approveRoom.isPending} onClick={submitApprove}>
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
        confirmLoading={rejectRoom.isPending}
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
  const [selected, setSelected] = useState<AdminRoomRequest | null>(null)
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)

  // 開放窗外不提供審核面板;與側欄反灰共用同一查詢
  const windowQuery = useAdminFixedWindow()
  const windowOpen = windowQuery.data?.open === true
  const listQuery = usePendingRoomBookings({ page, pageSize: PAGE_SIZE }, windowOpen)
  const pending = listQuery.data?.requests ?? []
  const total = listQuery.data?.total ?? 0

  // 標出互相衝突的時段(同場地每週同星期同節次);衝突時擇一社團核准,不做部分同意
  const conflictKeys = new Set<string>()
  const seen = new Map<string, number>()
  for (const r of pending) {
    for (const e of r.entries) {
      for (const p of e.periods) {
        const key = `${r.venueId}|${e.dow}|${p}`
        if (seen.has(key) && seen.get(key) !== r.apiId) {
          conflictKeys.add(key)
        } else {
          seen.set(key, r.apiId)
        }
      }
    }
  }
  const isConflict = (venueId: number) => (dow: number, period: string) =>
    conflictKeys.has(`${venueId}|${dow}|${period}`)

  if (windowQuery.isPending) {
    return (
      <div>
        <PageHeader title="教室固定借用" />
        <div className="card" style={{ marginTop: 20, padding: '48px 24px', textAlign: 'center' }}>
          <Spin />
        </div>
      </div>
    )
  }

  // 開放窗查詢失敗不可誤判為「未開放申請」,顯示錯誤與重試
  if (windowQuery.isError) {
    return (
      <div>
        <PageHeader title="教室固定借用" />
        <div style={{ marginTop: 20 }}>
          <QueryError title="受理期間載入失敗" error={windowQuery.error} onRetry={() => windowQuery.refetch()} />
        </div>
      </div>
    )
  }

  if (!windowOpen) {
    const w = windowQuery.data
    return (
      <div>
        <PageHeader title="教室固定借用" />
        <div className="card" style={{ marginTop: 20, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>目前未開放申請</div>
          {w?.openFrom && w.openUntil && (
            <div className="num" style={{ fontSize: 13, color: 'var(--steel)', marginTop: 8 }}>
              受理期間 {w.openFrom} – {w.openUntil}
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 8 }}>
            可於系統設定調整開放區間
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="教室固定借用"
        sub={
          <>
            待審 <span className="num">{total}</span> 件
          </>
        }
      />

      <Spin spinning={listQuery.isPending}>
        <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
          <table className="tb dense fixed" aria-label="待審教室固定借用" style={{ minWidth: 760 }}>
            {/* 社團/教室/用途截斷、每週時段吃剩餘寬且允許換行;狀態/開啟固定 px */}
            <Cols widths={['16%', '15%', 'auto', '18%', 90, 32]} />
            <thead>
              <tr>
                <th>社團</th>
                <th>教室</th>
                <th>每週時段</th>
                <th>用途</th>
                <th>狀態</th>
                <th aria-label="開啟" />
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
                  <td className="cell-clip" title={r.club}>{r.club}</td>
                  <td className="cell-clip" title={r.room || '未命名教室'} style={{ fontWeight: 500 }}>
                    <button
                      type="button"
                      className="row-open-btn"
                      aria-label={`開啟 ${r.club} 借用「${r.room || '未命名教室'}」的審核`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelected(r)
                        setOpen(true)
                      }}
                    >
                      {r.room || '未命名教室'}
                    </button>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {r.entries.flatMap((e) =>
                      e.periods.map((p) => {
                        const conflict = conflictKeys.has(`${r.venueId}|${e.dow}|${p}`)
                        return (
                          <span key={`${e.dow}-${p}`} className="num" style={{ color: conflict ? '#C13B34' : undefined, fontWeight: conflict ? 500 : undefined, marginRight: 8, display: 'inline-block' }}>
                            週{DOW_TEXT[e.dow]} 第{p}節
                            {conflict && <span style={{ fontSize: 12 }}>(衝突)</span>}
                          </span>
                        )
                      }),
                    )}
                  </td>
                  <td className="cell-clip" title={r.note} style={{ fontSize: 13, color: 'var(--steel)' }}>{r.note}</td>
                  <td><StatusPill status={r.status} /></td>
                  <td className="r"><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
                </tr>
              ))}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: '#B03A2E', padding: 24 }}>
                    載入失敗:{listQuery.error.message}
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && pending.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>沒有待審的固定借用</td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </div>
      </Spin>

      {/* Modal 常駐至關閉動畫結束(afterClose)才卸載 */}
      {selected && (
        <RoomReviewModal
          key={selected.id}
          item={selected}
          isConflict={isConflict(selected.venueId)}
          open={open}
          onClose={() => setOpen(false)}
          afterClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

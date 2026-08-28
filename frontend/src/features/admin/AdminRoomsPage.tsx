import { useState } from 'react'
import { countText } from '../../lib/counts'
import { App, Button, Input, Modal } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols, Pager } from '../../components/ui/tableControls'
import { DOW_TEXT } from '../../api/bookings'
import { intakeNote } from './intakeWindow'
import {
  CONFLICT_TEXT,
  conflictNote,
  useAdminBookingMutations,
  useAdminFixedWindow,
  usePendingRoomBookings,
  type AdminRoomRequest,
  type RoomConflictKind,
} from '../../api/adminBookings'

const PAGE_SIZE = 50

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }

// 退回原因預設文案:每次開啟退回視窗都回到此值(可修改後送出)
const DEFAULT_REJECT_REASON = '目前時段無法受理，若仍有借用需求請聯絡組長'

// 固定場地借用審核彈窗:顯示每週時段(含衝突標示),核准或退回(退回原因必填)
// 衝突=兩社搶同場地同星期同時段;整單擇一核准,不做部分同意
function RoomReviewModal({
  item,
  conflictOf,
  open,
  onClose,
  afterClose,
}: {
  item: AdminRoomRequest
  conflictOf: (dow: number, period: string) => RoomConflictKind | undefined
  open: boolean
  onClose: () => void
  afterClose: () => void
}) {
  const { message } = App.useApp()
  const { approveRoom, rejectRoom } = useAdminBookingMutations()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState(DEFAULT_REJECT_REASON)
  const note = conflictNote(item.entries.flatMap((e) => e.periods.map((p) => conflictOf(e.dow, p))))

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
              const conflict = conflictOf(e.dow, p)
              return (
                <span key={`${e.dow}-${p}`} className="num" style={{ color: conflict ? '#C13B34' : undefined, fontWeight: conflict ? 500 : undefined }}>
                  週{DOW_TEXT[e.dow]} 第 {p} 節{conflict && CONFLICT_TEXT[conflict]}
                </span>
              )
            }),
          )}
        </div>
      </div>
      {note && (
        <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--paper)', borderRadius: 6, fontSize: 13, color: '#C13B34' }}>
          {note}
        </div>
      )}

      <Modal
        open={rejectOpen}
        title="退回借用申請"
        okText="確認退回"
        destroyOnHidden
        confirmLoading={rejectRoom.isPending}
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onOk={submitReject}
        onCancel={closeReject}
      >
        {/* 必填輸入型彈窗聚焦輸入框(不是確認鈕):否則 Enter 只會送出空原因換來錯誤 */}
        <Input.TextArea
          autoFocus
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

  // 受理期間只擋社團送新單,不擋審核:期間結束後承辦仍要審完已收到的單(decisions.md D-04)。
  // 這支查詢只餵下面那條說明橫幅 —— 失敗就不顯示橫幅,清單與審核照常
  const windowQuery = useAdminFixedWindow()
  const windowNote = intakeNote(windowQuery.data)
  const listQuery = usePendingRoomBookings({ page, pageSize: PAGE_SIZE })
  const pending = listQuery.data?.requests ?? []
  const total = listQuery.data?.total ?? 0

  // 衝突逐格由後端算好隨列帶回(判定與核准端的三項檢核同一份):
  // 對上待審單=擇一核准,對上已核准的固定或臨時借用=核准必被擋下
  const conflictOf = (r: AdminRoomRequest) => (dow: number, period: string) =>
    r.conflicts.get(`${dow}|${period}`)

  return (
    <div>
      <PageHeader
        title="固定場地借用"
        sub={
          <>
            待審 <span className="num">{countText(total, listQuery)}</span> 件
          </>
        }
      />

      {/* 受理期間不影響審核,只影響社團送不送得了新單 —— 說清楚是哪一種未開放 */}
      {windowNote && (
        <div className="card" style={{ marginTop: 20, padding: '12px 20px', fontSize: 13, color: 'var(--steel)' }}>
          {windowNote}
        </div>
      )}

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <LoadingBlock pending={listQuery.isPending}>
          <table className="tb dense fixed" aria-label="待審固定場地借用" style={{ minWidth: 760 }}>
            {/* 社團/場地/用途截斷、每週時段吃剩餘寬且允許換行;狀態/開啟固定 px */}
            <Cols widths={['16%', '15%', 'auto', '18%', 90, 32]} />
            <thead>
              <tr>
                <th scope="col">社團</th>
                <th scope="col">場地</th>
                <th scope="col">每週時段</th>
                <th scope="col">用途</th>
                <th scope="col">狀態</th>
                <th scope="col" aria-label="開啟" />
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
                  <td className="cell-clip" title={r.room || '未命名場地'} style={{ fontWeight: 500 }}>
                    <button
                      type="button"
                      className="row-open-btn"
                      aria-label={`開啟 ${r.club} 借用「${r.room || '未命名場地'}」的審核`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelected(r)
                        setOpen(true)
                      }}
                    >
                      {r.room || '未命名場地'}
                    </button>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {r.entries.flatMap((e) =>
                      e.periods.map((p) => {
                        const conflict = conflictOf(r)(e.dow, p)
                        return (
                          <span key={`${e.dow}-${p}`} className="num" style={{ color: conflict ? '#C13B34' : undefined, fontWeight: conflict ? 500 : undefined, marginRight: 8, display: 'inline-block' }}>
                            週{DOW_TEXT[e.dow]} 第{p}節
                            {conflict && <span style={{ fontSize: 12 }}>{CONFLICT_TEXT[conflict]}</span>}
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
                  <td colSpan={6}>
                    <QueryError
                      compact
                      title="固定借用申請載入失敗"
                      error={listQuery.error}
                      onRetry={() => void listQuery.refetch()}
                    />
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
        </LoadingBlock>
          <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </div>

      {/* Modal 常駐至關閉動畫結束(afterClose)才卸載 */}
      {selected && (
        <RoomReviewModal
          key={selected.id}
          item={selected}
          conflictOf={conflictOf(selected)}
          open={open}
          onClose={() => setOpen(false)}
          afterClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

import { useState } from 'react'
import { App, Button, Checkbox, Drawer, Input, InputNumber, Modal } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import StampTrail, { type StampStage } from '../../components/ui/StampTrail'
import { fmtMoney } from '../activities/types'
import { REVIEW_ITEMS, type ReviewItem } from './reviewMock'

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }

// 章軌由單據狀態推導;登入者(mock)為輔導老師,僅本關可簽核
function stagesOf(status: ReviewItem['status']): StampStage[] {
  const mk = (advisor: StampStage['state'], chief: StampStage['state'], dean: StampStage['state']): StampStage[] => [
    { char: '輔', label: '輔導老師', state: advisor, note: noteOf(advisor) },
    { char: '組', label: '組長', state: chief, note: noteOf(chief) },
    { char: '長', label: '學務長', state: dean, note: noteOf(dean) },
  ]
  switch (status) {
    case 'pending_advisor':
      return mk('current', 'todo', 'todo')
    case 'pending_chief':
      return mk('done', 'current', 'todo')
    case 'pending_dean':
      return mk('done', 'done', 'current')
    case 'approved':
    case 'closed':
      return mk('done', 'done', 'done')
    case 'rejected':
      return mk('rejected', 'todo', 'todo')
    default:
      return mk('todo', 'todo', 'todo')
  }
}

function noteOf(state: StampStage['state']): string | undefined {
  switch (state) {
    case 'current':
      return '審核中'
    case 'todo':
      return '未到關'
    case 'done':
      return '已核'
    case 'rejected':
      return '已退回'
  }
}

function DetailDrawer({ item, onClose }: { item: ReviewItem; onClose: () => void }) {
  const { message } = App.useApp()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  // 大型活動由社團申請、審核時認可;認可後行政分才享 ×3 加權
  const [largeApproved, setLargeApproved] = useState(true)
  const d = item.detail
  // 核定金額:controlled,依預算列 id 管理
  const [approvals, setApprovals] = useState<Record<number, number>>(() =>
    Object.fromEntries((d?.budget ?? []).map((b) => [b.id, b.approved])),
  )

  const canReview = item.status === 'pending_advisor'
  const requestedTotal = d?.budget.reduce((s, b) => s + b.requested, 0) ?? 0
  const approvedTotal = d?.budget.reduce((s, b) => s + (approvals[b.id] ?? 0), 0) ?? 0

  const closeReject = () => {
    setRejectOpen(false)
    setReason('')
  }

  const submitReject = () => {
    if (!reason.trim()) {
      message.error('退回原因為必填。')
      return
    }
    message.success(`已退回 ${item.id}(通知社團修正重送)`)
    closeReject()
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size={560}
      mask={false}
      rootStyle={{ top: 56 }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="num" style={{ fontSize: 13, color: 'var(--steel)', fontWeight: 400 }}>{item.id}</span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{item.name}</span>
          <StatusPill status={item.status} />
        </div>
      }
      footer={
        canReview ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--steel)', flex: 1 }}>
              退回將通知社團修正重送;退回原因必填。
            </div>
            <Button danger style={{ height: 38 }} onClick={() => setRejectOpen(true)}>
              退回…
            </Button>
            <Button
              type="primary"
              style={{ height: 38 }}
              onClick={() => {
                const largeNote = item.type === '大型活動' ? `(大型活動${largeApproved ? '已認可' : '未認可'})` : ''
                message.success(`已核准 ${item.id}${largeNote},送組長關`)
                onClose()
              }}
            >
              核准,送組長關
            </Button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--steel)' }}>
            {item.status === 'rejected' ? '此申請已退回社團修正。' : '非本關卡待審單據,僅供查看。'}
          </div>
        )
      }
    >
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        <StampTrail stages={stagesOf(item.status)} />
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 10px' }}>基本資料</div>
      <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '8px 12px', fontSize: 13 }}>
        <div style={detailLabel}>社團</div><div>{item.club}</div>
        <div style={detailLabel}>類型</div><div>{item.type}</div>
        <div style={detailLabel}>日期時間</div><div className="num">{d?.timeRange ?? item.date}</div>
        <div style={detailLabel}>地點</div><div>{d?.location ?? '—'}</div>
        <div style={detailLabel}>參加人數</div>
        <div>
          校內 <span className="num">{d?.participantsIn ?? '—'}</span> · 校外{' '}
          <span className="num">{d?.participantsOut ?? '—'}</span>
        </div>
        <div style={detailLabel}>送件</div>
        <div>
          <span className="num">{d?.submittedAt ?? '—'}</span>
          {d?.submittedBy ? ` · ${d.submittedBy}` : ''}
        </div>
        <div style={detailLabel}>附件</div>
        <div>
          {d?.attachments.length
            ? d.attachments.map((f, i) => (
                <span key={f}>
                  {i > 0 && ' · '}
                  <button type="button" className="link-btn" style={{ color: 'var(--focus)', padding: 0 }}>
                    {f}
                  </button>
                </span>
              ))
            : '—'}
        </div>
      </div>

      {item.type === '大型活動' && (
        <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--paper)', borderRadius: 6 }}>
          <Checkbox
            checked={largeApproved}
            disabled={!canReview}
            onChange={(e) => setLargeApproved(e.target.checked)}
          >
            認可為大型活動(評鑑行政分 ×3 加權)
          </Checkbox>
        </div>
      )}

      {d && d.budget.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '22px 0 10px' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>經費明細 — 逐項核定</div>
            <div style={{ fontSize: 12, color: 'var(--steel)' }}>
              {canReview ? '核定金額由本關填寫' : '核定金額(唯讀)'}
            </div>
          </div>
          <table className="tb dense">
            <thead>
              <tr>
                <th style={{ paddingLeft: 0 }}>摘要</th>
                <th>說明</th>
                <th className="r">自籌</th>
                <th className="r">擬請</th>
                <th className="r" style={{ width: 96, paddingRight: 0 }}>核定</th>
              </tr>
            </thead>
            <tbody>
              {d.budget.map((b) => (
                <tr key={b.id} className="no-hover">
                  <td style={{ paddingLeft: 0, whiteSpace: 'nowrap' }}>{b.category}</td>
                  <td style={{ color: 'var(--steel)' }}>{b.description}</td>
                  <td className="r num">{b.selfFund.toLocaleString()}</td>
                  <td className="r num">{b.requested.toLocaleString()}</td>
                  <td style={{ paddingRight: 0 }}>
                    {canReview ? (
                      <InputNumber
                        size="small"
                        style={{ width: '100%' }}
                        min={0}
                        max={b.requested}
                        precision={0}
                        value={approvals[b.id]}
                        onChange={(v) => setApprovals((prev) => ({ ...prev, [b.id]: v ?? 0 }))}
                        controls={false}
                      />
                    ) : (
                      <div className="r num" style={{ textAlign: 'right' }}>{(approvals[b.id] ?? 0).toLocaleString()}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ borderBottom: 'none', padding: '10px 8px 0 0', fontSize: 12, color: 'var(--steel)', textAlign: 'right' }}>
                  擬請合計 <span className="num" style={{ fontSize: 13, color: 'var(--ink)' }}>{fmtMoney(requestedTotal)}</span>
                </td>
                <td colSpan={2} style={{ borderBottom: 'none', padding: '10px 0 0', textAlign: 'right', fontSize: 12, color: 'var(--steel)' }}>
                  核定合計 <span className="num" style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{fmtMoney(approvedTotal)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </>
      )}

      <Modal
        open={rejectOpen}
        title="退回申請"
        okText="確認退回"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onOk={submitReject}
        onCancel={closeReject}
      >
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 8 }}>
          退回原因(必填,將顯示於社團的活動列表)
        </div>
        <Input.TextArea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例:經費明細第 3 項未附估價單"
        />
      </Modal>
    </Drawer>
  )
}

export default function ReviewPage() {
  const [selected, setSelected] = useState<ReviewItem | null>(null)
  const pendingCount = REVIEW_ITEMS.filter((i) => i.status === 'pending_advisor').length
  const rejectedCount = REVIEW_ITEMS.filter((i) => i.status === 'rejected').length

  return (
    <div>
      <PageHeader
        title="活動申請審核"
        sub={
          <>
            待審 <span className="num">{pendingCount}</span> 件 · 已退回{' '}
            <span className="num">{rejectedCount}</span> 件
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb dense" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ width: 36, paddingRight: 0 }}>
                <Checkbox aria-label="全選" />
              </th>
              <th>單號</th>
              <th>社團</th>
              <th>活動名稱</th>
              <th>類型</th>
              <th>活動日期</th>
              <th className="r">擬請補助</th>
              <th>狀態</th>
              <th className="r">動作</th>
            </tr>
          </thead>
          <tbody>
            {REVIEW_ITEMS.map((item) => (
              <tr key={item.id} style={selected?.id === item.id ? { background: 'var(--seal-tint)' } : undefined}>
                <td style={{ paddingRight: 0 }}>
                  <Checkbox aria-label="選取" />
                </td>
                <td className="num" style={{ color: 'var(--steel)' }}>{item.id}</td>
                <td>{item.club}</td>
                <td style={{ fontWeight: 500 }}>{item.name}</td>
                <td>{item.type}</td>
                <td className="num">{item.date}</td>
                <td className="r num">{fmtMoney(item.requested)}</td>
                <td><StatusPill status={item.status} /></td>
                <td className="r">
                  <button
                    type="button"
                    className={item.status === 'pending_advisor' ? 'link-btn primary' : 'link-btn'}
                    onClick={() => setSelected(item)}
                  >
                    {item.status === 'pending_advisor' ? '審核' : '查看'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* key 依單據重掛,核定金額與退回原因不會殘留到下一張 */}
      {selected && <DetailDrawer key={selected.id} item={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

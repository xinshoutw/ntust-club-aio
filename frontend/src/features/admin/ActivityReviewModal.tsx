import { useState } from 'react'
import { App, Button, Checkbox, Input, InputNumber, Modal } from 'antd'
import StatusPill from '../../components/ui/StatusPill'
import LargeBadge from '../../components/ui/LargeBadge'
import StampTrail, { type StampStage } from '../../components/ui/StampTrail'
import { fmtMoney } from '../activities/types'
import type { ReviewItem } from './reviewMock'

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
    // 結案流程中/待結案/逾期未結案皆為三關已核後的狀態(行政端社團總覽以唯讀開啟)
    case 'closing_pending_advisor':
    case 'closing_due':
    case 'locked':
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

// 活動申請審核彈窗(申請審核頁與行政端社團總覽共用):
// 章軌、基本資料、經費逐項核定、大型活動認可;待本關者可核准/退回,其餘唯讀
export default function ActivityReviewModal({
  item,
  open,
  onClose,
  afterClose,
}: {
  item: ReviewItem
  open: boolean
  onClose: () => void
  afterClose: () => void
}) {
  const { message } = App.useApp()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  // 大型活動:社團申請或管理員逕行核定;認可後行政分才享 ×3 加權
  const [largeApproved, setLargeApproved] = useState(item.largeApproved ?? !!item.isLarge)
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
      message.error('退回原因為必填')
      return
    }
    message.success(`已退回「${item.name}」`)
    closeReject()
    onClose()
  }

  const hasBudget = !!d && d.budget.length > 0

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      width={hasBudget ? 880 : 620}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 26 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{item.name}</span>
          {/* 本關可簽核時,徽章即時反映下方「認可為大型活動」勾選 */}
          <LargeBadge applied={item.isLarge} approved={canReview ? largeApproved : item.largeApproved} />
          <StatusPill status={item.status} />
          <span style={{ flex: 1 }} />
          <StampTrail stages={stagesOf(item.status)} />
        </div>
      }
      footer={
        canReview ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
            <Button danger style={{ height: 38 }} onClick={() => setRejectOpen(true)}>
              退回
            </Button>
            <Button
              type="primary"
              autoFocus
              style={{ height: 38 }}
              onClick={() => {
                const largeNote = item.type === '活動' ? `(大型活動${largeApproved ? '已認可' : '未認可'})` : ''
                message.success(`已核准「${item.name}」${largeNote},送組長關`)
                onClose()
              }}
            >
              核准,送組長關
            </Button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--steel)' }}>
            {item.status === 'rejected' ? '此申請已退回社團修正' : '非本關卡待審單據，僅供查看'}
          </div>
        )
      }
    >
      {/* 有經費才走雙欄:左=基本資料,右=經費逐項核定 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: hasBudget ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
          gap: '8px 28px',
          marginTop: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>基本資料</div>
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

          {item.type === '活動' && (
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--paper)', borderRadius: 6 }}>
              <Checkbox
                checked={largeApproved}
                disabled={!canReview}
                onChange={(e) => setLargeApproved(e.target.checked)}
              >
                認可為大型活動(評鑑行政分 ×3 加權)
              </Checkbox>
              {item.isLarge && (
                <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>社團已申請認定為大型活動</div>
              )}
            </div>
          )}
        </div>

        {hasBudget && (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>經費明細 — 逐項核定</div>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>
                {canReview ? '核定金額由本關填寫' : '核定金額(唯讀)'}
              </div>
            </div>
            <table className="tb dense">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 0 }}>摘要</th>
                  <th className="r">自籌</th>
                  <th className="r">擬請</th>
                  <th className="r" style={{ width: 96, paddingRight: 0 }}>核定</th>
                </tr>
              </thead>
              <tbody>
                {d.budget.map((b) => (
                  <tr key={b.id} className="no-hover">
                    <td style={{ paddingLeft: 0 }}>
                      <div style={{ whiteSpace: 'nowrap' }}>{b.category}</div>
                      <div style={{ fontSize: 12, color: 'var(--steel)' }}>{b.description}</div>
                    </td>
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
                  <td colSpan={2} style={{ borderBottom: 'none', padding: '10px 8px 0 0', fontSize: 12, color: 'var(--steel)', textAlign: 'right' }}>
                    擬請合計 <span className="num" style={{ fontSize: 13, color: 'var(--ink)' }}>{fmtMoney(requestedTotal)}</span>
                  </td>
                  <td colSpan={2} style={{ borderBottom: 'none', padding: '10px 0 0', textAlign: 'right', fontSize: 12, color: 'var(--steel)' }}>
                    核定合計 <span className="num" style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{fmtMoney(approvedTotal)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={rejectOpen}
        title="退回申請"
        okText="確認退回"
        destroyOnHidden
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onOk={submitReject}
        onCancel={closeReject}
      >
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 8 }}>
          退回原因(必填,將顯示於社團的活動列表)
        </div>
        <Input.TextArea
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例:經費明細第 3 項未附估價單"
        />
      </Modal>
    </Modal>
  )
}

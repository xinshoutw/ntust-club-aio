import { useState } from 'react'
import { App, Button, Checkbox, Drawer, Input, InputNumber, Modal } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import StampTrail from '../../components/ui/StampTrail'
import { fmtMoney } from '../activities/types'
import { REVIEW_ITEMS, type ReviewItem } from './reviewMock'

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }

function DetailDrawer({
  item,
  onClose,
}: {
  item: ReviewItem | null
  onClose: () => void
}) {
  const { message } = App.useApp()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const d = item?.detail

  const approvedTotal = d?.budget.reduce((s, b) => s + b.approved, 0) ?? 0
  const requestedTotal = d?.budget.reduce((s, b) => s + b.requested, 0) ?? 0

  const submitReject = () => {
    if (!reason.trim()) {
      message.error('退回原因為必填。')
      return
    }
    message.success(`已退回 ${item?.id}(通知社團修正重送)`)
    setRejectOpen(false)
    setReason('')
    onClose()
  }

  return (
    <Drawer
      open={!!item}
      onClose={onClose}
      size={560}
      title={
        item && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="num" style={{ fontSize: 13, color: 'var(--steel)', fontWeight: 400 }}>{item.id}</span>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{item.name}</span>
            <StatusPill status={item.status} />
          </div>
        )
      }
      footer={
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
              message.success(`已核准 ${item?.id},送組長關`)
              onClose()
            }}
          >
            核准,送組長關
          </Button>
        </div>
      }
    >
      {item && (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <StampTrail
              stages={[
                { char: '輔', label: '輔導老師', state: 'current', note: '審核中' },
                { char: '組', label: '組長', state: 'todo', note: '未到關' },
                { char: '長', label: '學務長', state: 'todo', note: '未到關' },
              ]}
            />
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
              {d?.attachments.map((f, i) => (
                <span key={f}>
                  {i > 0 && ' · '}
                  <a style={{ fontSize: 13 }}>{f}</a>
                </span>
              )) ?? '—'}
            </div>
          </div>

          {d && d.budget.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '22px 0 10px' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>經費明細 — 逐項核定</div>
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>核定金額由本關填寫</div>
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
                    <tr key={b.category + b.description} className="no-hover">
                      <td style={{ paddingLeft: 0, whiteSpace: 'nowrap' }}>{b.category}</td>
                      <td style={{ color: 'var(--steel)' }}>{b.description}</td>
                      <td className="r num">{b.selfFund.toLocaleString()}</td>
                      <td className="r num">{b.requested.toLocaleString()}</td>
                      <td style={{ paddingRight: 0 }}>
                        <InputNumber
                          size="small"
                          style={{ width: '100%' }}
                          min={0}
                          defaultValue={b.approved}
                          controls={false}
                        />
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
            onCancel={() => setRejectOpen(false)}
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
        </>
      )}
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
                  {item.status === 'pending_advisor' ? (
                    <button type="button" className="link-btn primary" onClick={() => setSelected(item)}>
                      審核
                    </button>
                  ) : (
                    <button type="button" className="link-btn" onClick={() => setSelected(item)}>
                      查看
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DetailDrawer item={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

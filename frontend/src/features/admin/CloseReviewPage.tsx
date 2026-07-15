import { useState } from 'react'
import { App, Button, Input, Modal } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'

interface PendingClose {
  id: string
  club: string
  name: string
  date: string
  expense: number
  reflections: number
}

const PENDING: PendingClose[] = [
  { id: 'ACT-114-0014', club: '攝影社', name: '期末影展', date: '2026/06/10', expense: 19500, reflections: 3 },
  { id: 'ACT-114-0016', club: '國際志工社', name: '社區服務日', date: '2026/06/08', expense: 6200, reflections: 4 },
]

const LOCKED = [
  { id: 'ACT-114-0012', club: '資工系學會', name: '程式設計工作坊', deadline: '2026/05/12' },
]

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }

// 結案審核彈窗:輔導老師單關,核准或退回(退回原因必填)
function CloseReviewModal({ item, onClose }: { item: PendingClose; onClose: () => void }) {
  const { message } = App.useApp()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')

  const closeReject = () => {
    setRejectOpen(false)
    setReason('')
  }

  const submitReject = () => {
    if (!reason.trim()) {
      message.error('退回原因為必填。')
      return
    }
    message.success(`已退回結案 ${item.id}(通知社團補正)`)
    closeReject()
    onClose()
  }

  return (
    <Modal
      open
      onCancel={onClose}
      width={560}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 26 }}>
          <span className="num" style={{ fontSize: 13, color: 'var(--steel)', fontWeight: 400 }}>{item.id}</span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{item.name}</span>
          <StatusPill status="closing_pending_advisor" />
        </div>
      }
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--steel)', flex: 1 }}>核准後計入評鑑行政分;退回原因必填。</div>
          <Button danger style={{ height: 38 }} onClick={() => setRejectOpen(true)}>退回…</Button>
          <Button
            type="primary"
            style={{ height: 38 }}
            onClick={() => {
              message.success(`已核准結案 ${item.id}`)
              onClose()
            }}
          >
            核准結案
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: '9px 12px', fontSize: 13, marginTop: 4 }}>
        <div style={detailLabel}>社團</div><div>{item.club}</div>
        <div style={detailLabel}>活動日期</div><div className="num">{item.date}</div>
        <div style={detailLabel}>核銷金額</div><div className="num">${item.expense.toLocaleString()}</div>
        <div style={detailLabel}>學習心得</div><div><span className="num">{item.reflections}</span> 人</div>
      </div>

      <Modal
        open={rejectOpen}
        title="退回結案"
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
          placeholder="例:成果照片不足 5 張且未附影片連結"
        />
      </Modal>
    </Modal>
  )
}

export default function CloseReviewPage() {
  const { message } = App.useApp()
  const [selected, setSelected] = useState<PendingClose | null>(null)

  return (
    <div>
      <PageHeader
        title="結案審核"
        sub={
          <>
            待審 <span className="num">{PENDING.length}</span> 件 · 逾期鎖定 <span className="num">{LOCKED.length}</span> 件
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>待審結案(輔導老師單關)</div>
        <table className="tb dense" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>單號</th>
              <th>社團</th>
              <th>活動</th>
              <th>活動日期</th>
              <th className="r">核銷金額</th>
              <th className="r">心得</th>
              <th aria-label="開啟" style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {PENDING.map((p) => (
              <tr key={p.id} onClick={() => setSelected(p)} style={{ cursor: 'pointer' }}>
                <td className="num" style={{ color: 'var(--steel)' }}>{p.id}</td>
                <td>{p.club}</td>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td className="num">{p.date}</td>
                <td className="r num">${p.expense.toLocaleString()}</td>
                <td className="r num">{p.reflections} 人</td>
                <td className="r"><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
              </tr>
            ))}
            {PENDING.length === 0 && (
              <tr className="no-hover">
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有待審結案。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>逾期未結案(已鎖定)</div>
        <table className="tb dense" style={{ minWidth: 640 }}>
          <tbody>
            {LOCKED.map((l) => (
              <tr key={l.id} className="no-hover">
                <td className="num" style={{ color: 'var(--steel)', width: 150 }}>{l.id}</td>
                <td>{l.club}</td>
                <td style={{ fontWeight: 500 }}>{l.name}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>
                  結案期限 <span className="num">{l.deadline}</span>
                </td>
                <td style={{ width: 110 }}><StatusPill status="locked" /></td>
                <td className="r" style={{ width: 90 }}>
                  <Button size="small" style={{ height: 28 }} onClick={() => message.success(`已解鎖 ${l.id},社團可補送結案`)}>
                    解鎖
                  </Button>
                </td>
              </tr>
            ))}
            {LOCKED.length === 0 && (
              <tr className="no-hover">
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>沒有逾期鎖定的活動。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && <CloseReviewModal key={selected.id} item={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

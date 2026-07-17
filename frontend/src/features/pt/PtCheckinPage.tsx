import { useState } from 'react'
import { App, Button, Input, Modal } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { Pager } from '../../components/ui/tableControls'
import { CHECKED_OUT_LOANS, type PtLoan } from './mock'

const PAGE_SIZE = 20

// 器材歸還點交(工讀生端基礎原型):借出中逐單點收,登記歸還人。mock:確認後本地移除 + toast
export default function PtCheckinPage() {
  const { message } = App.useApp()
  const [rows, setRows] = useState<PtLoan[]>(CHECKED_OUT_LOANS)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<PtLoan | null>(null)
  const [open, setOpen] = useState(false)
  const [returner, setReturner] = useState('')

  const confirm = () => {
    if (!selected) return
    if (!returner.trim()) {
      message.error('請填寫歸還人姓名')
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== selected.id))
    setOpen(false)
    message.success(`${selected.club} ${selected.equipment} ×${selected.qty} 已完成歸還點交`)
  }

  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <PageHeader
        title="器材歸還點交"
        sub={
          <>
            借出中 <span className="num">{rows.length}</span> 件
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb dense" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>社團</th>
              <th>器材</th>
              <th>借用區間</th>
              <th>借用人</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((l) => (
              <tr
                key={l.id}
                className="click-tint"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setSelected(l)
                  setReturner('')
                  setOpen(true)
                }}
              >
                <td>{l.club}</td>
                <td style={{ fontWeight: 500 }}>
                  {l.equipment} <span className="num">×{l.qty}</span>
                </td>
                <td className="num" style={{ fontSize: 13 }}>{l.start} – {l.end}</td>
                <td style={{ fontSize: 13 }}>{l.borrower}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className="no-hover">
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有借出中的器材</td>
              </tr>
            )}
          </tbody>
        </table>
        <Pager page={page} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} />
      </div>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        afterClose={() => setSelected(null)}
        destroyOnHidden
        title={selected ? `歸還點交 — ${selected.club}` : ''}
        footer={
          <Button type="primary" onClick={confirm}>
            確認歸還
          </Button>
        }
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              {selected.equipment} <span className="num">×{selected.qty}</span>
              <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--steel)' }}>
                借用人 {selected.borrower}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>歸還人姓名</div>
              <Input
                autoFocus
                value={returner}
                onChange={(e) => setReturner(e.target.value)}
                placeholder="現場歸還人"
                maxLength={50}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

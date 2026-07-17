import { useState } from 'react'
import { App, Button, Input, Modal } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { Pager } from '../../components/ui/tableControls'
import { APPROVED_LOANS, type PtLoan } from './mock'

const PAGE_SIZE = 20

// 器材借出點交(工讀生端基礎原型):已核准借用逐單點交,登記借用人;
// 「依序點交」器材逐件登記序號。目前 mock:確認後僅本地移除 + toast
export default function PtCheckoutPage() {
  const { message } = App.useApp()
  const [rows, setRows] = useState<PtLoan[]>(APPROVED_LOANS)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<PtLoan | null>(null)
  const [open, setOpen] = useState(false)
  const [borrower, setBorrower] = useState('')
  const [serials, setSerials] = useState<string[]>([])

  const openModal = (loan: PtLoan) => {
    setSelected(loan)
    setBorrower('')
    setSerials(Array.from({ length: loan.needsSerial ? loan.qty : 0 }, () => ''))
    setOpen(true)
  }

  const confirm = () => {
    if (!selected) return
    if (!borrower.trim()) {
      message.error('請填寫借用人姓名')
      return
    }
    if (selected.needsSerial && serials.some((s) => !s.trim())) {
      message.error('依序點交器材需逐件登記序號')
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== selected.id))
    setOpen(false)
    message.success(`${selected.club} ${selected.equipment} ×${selected.qty} 已完成借出點交`)
  }

  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <PageHeader
        title="器材借出點交"
        sub={
          <>
            待點交 <span className="num">{rows.length}</span> 件
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
              <th>點交方式</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((l) => (
              <tr key={l.id} className="click-tint" style={{ cursor: 'pointer' }} onClick={() => openModal(l)}>
                <td>{l.club}</td>
                <td style={{ fontWeight: 500 }}>
                  {l.equipment} <span className="num">×{l.qty}</span>
                </td>
                <td className="num" style={{ fontSize: 13 }}>{l.start} – {l.end}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{l.needsSerial ? '依序點交' : '一般'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className="no-hover">
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有待借出的核准單</td>
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
        title={selected ? `借出點交 — ${selected.club}` : ''}
        footer={
          <Button type="primary" onClick={confirm}>
            確認借出
          </Button>
        }
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              {selected.equipment} <span className="num">×{selected.qty}</span>
              <span className="num" style={{ marginLeft: 12, fontSize: 13, color: 'var(--steel)' }}>
                {selected.start} – {selected.end}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>借用人姓名</div>
              <Input
                autoFocus
                value={borrower}
                onChange={(e) => setBorrower(e.target.value)}
                placeholder="現場領用人"
                maxLength={50}
              />
            </div>
            {selected.needsSerial &&
              serials.map((s, i) => (
                <div key={i}>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>
                    第 <span className="num">{i + 1}</span> 件序號
                  </div>
                  <Input
                    value={s}
                    onChange={(e) =>
                      setSerials((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                    }
                    maxLength={50}
                  />
                </div>
              ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

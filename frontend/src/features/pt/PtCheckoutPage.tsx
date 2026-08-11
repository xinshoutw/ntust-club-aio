import { useState } from 'react'
import { App, Button, Input, Modal } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols, Pager } from '../../components/ui/tableControls'
import { STAFF_PAGE_SIZE, useStaffLoans, useStaffMutations, type StaffLoan } from '../../api/staff'

// 器材借出點交:已核准借用逐單點交,登記借用人;
// 「依序點交」器材逐件登記序號(任一空白擋下,與後端檢核一致)
export default function PtCheckoutPage() {
  const { message } = App.useApp()
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<StaffLoan | null>(null)
  const [open, setOpen] = useState(false)
  const [borrower, setBorrower] = useState('')
  const [serials, setSerials] = useState<string[]>([])
  const listQuery = useStaffLoans('approved', page)
  const { checkout } = useStaffMutations()
  const rows = listQuery.data?.loans ?? []
  const total = listQuery.data?.total ?? 0

  const openModal = (loan: StaffLoan) => {
    setSelected(loan)
    setBorrower('')
    setSerials(Array.from({ length: loan.needsSerial ? loan.qty : 0 }, () => ''))
    setOpen(true)
  }

  const confirm = () => {
    if (!selected) return
    const name = borrower.trim()
    if (!name) {
      message.error('請填寫借用人姓名')
      return
    }
    const cleaned = serials.map((s) => s.trim())
    if (selected.needsSerial && cleaned.some((s) => !s)) {
      message.error('依序點交器材需逐件登記序號')
      return
    }
    checkout.mutate(
      { id: selected.id, borrower: name, serials: selected.needsSerial ? cleaned : undefined },
      {
        onSuccess: () => {
          setOpen(false)
          message.success(`${selected.club} ${selected.equipment} ×${selected.qty} 已完成借出點交`)
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  return (
    <div>
      <PageHeader
        title="器材借出點交"
        sub={
          <>
            待點交 <span className="num">{total}</span> 件
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <LoadingBlock pending={listQuery.isPending}>
          <table className="tb dense fixed" style={{ minWidth: 720 }}>
            <Cols widths={['30%', 'auto', 190, 90]} />
            <thead>
              <tr>
                <th scope="col">社團</th>
                <th scope="col">器材</th>
                <th scope="col">借用區間</th>
                <th scope="col">點交方式</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="click-tint" style={{ cursor: 'pointer' }} onClick={() => openModal(l)}>
                  <td className="cell-clip" title={l.club}>{l.club}</td>
                  {/* 列本身只給滑鼠;鍵盤走器材欄的按鈕(與行政端各表同一種入口) */}
                  <td className="cell-clip" title={`${l.equipment} ×${l.qty}`} style={{ fontWeight: 500 }}>
                    <button
                      type="button"
                      className="row-open-btn"
                      aria-label={`開啟 ${l.club} 的「${l.equipment}」借出點交`}
                      onClick={(e) => {
                        e.stopPropagation()
                        openModal(l)
                      }}
                    >
                      {l.equipment} <span className="num">×{l.qty}</span>
                    </button>
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>{l.start} – {l.end}</td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>{l.needsSerial ? '依序點交' : '一般'}</td>
                </tr>
              ))}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={4}>
                    <QueryError
                      compact
                      title="待點交清單載入失敗"
                      error={listQuery.error}
                      onRetry={() => void listQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && rows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有待借出的核准單</td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager page={page} pageSize={STAFF_PAGE_SIZE} total={total} onChange={setPage} />
        </LoadingBlock>
      </div>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        afterClose={() => setSelected(null)}
        destroyOnHidden
        title={selected ? `借出點交 — ${selected.club}` : ''}
        footer={
          <Button type="primary" loading={checkout.isPending} onClick={confirm}>
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
            {/* 現場點交要看得到用途與聯絡人:器材對不上時得當場打電話 */}
            <div style={{ fontSize: 13, color: 'var(--steel)' }}>
              用途:{selected.purpose || '—'}
              <span className="num" style={{ marginLeft: 12 }}>
                聯絡電話:{selected.phone || '—'}
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

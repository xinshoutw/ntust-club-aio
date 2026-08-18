import { useState } from 'react'
import { countText } from '../../lib/counts'
import { App, Button, Input, Modal } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols, Pager } from '../../components/ui/tableControls'
import { STAFF_PAGE_SIZE, useStaffLoans, useStaffMutations, type StaffLoan } from '../../api/staff'

// 器材歸還點交:借出中逐單點收,登記歸還人(備註選填,如損壞情形)
export default function PtCheckinPage() {
  const { message } = App.useApp()
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<StaffLoan | null>(null)
  const [open, setOpen] = useState(false)
  const [returner, setReturner] = useState('')
  const [note, setNote] = useState('')
  const listQuery = useStaffLoans('checked_out', page)
  const { checkin } = useStaffMutations()
  const rows = listQuery.data?.loans ?? []
  const total = listQuery.data?.total ?? 0

  const openReturn = (loan: StaffLoan) => {
    setSelected(loan)
    setReturner('')
    setNote('')
    setOpen(true)
  }

  const confirm = () => {
    if (!selected) return
    const name = returner.trim()
    if (!name) {
      message.error('請填寫歸還人姓名')
      return
    }
    checkin.mutate(
      { id: selected.id, returner: name, note: note.trim() || undefined },
      {
        onSuccess: () => {
          setOpen(false)
          message.success(`${selected.club} ${selected.equipment} ×${selected.qty} 已完成歸還點交`)
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  return (
    <div>
      <PageHeader
        title="器材歸還點交"
        sub={
          <>
            借出中 <span className="num">{countText(total, listQuery)}</span> 件
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <LoadingBlock pending={listQuery.isPending}>
          <table className="tb dense fixed" style={{ minWidth: 720 }}>
            <Cols widths={['30%', 'auto', 250, 110]} />
            <thead>
              <tr>
                <th scope="col">社團</th>
                <th scope="col">器材</th>
                <th scope="col">借用區間</th>
                <th scope="col">借用人</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr
                  key={l.id}
                  className="click-tint"
                  style={{ cursor: 'pointer' }}
                  onClick={() => openReturn(l)}
                >
                  <td className="cell-clip" title={l.club}>{l.club}</td>
                  {/* 列本身只給滑鼠;鍵盤走器材欄的按鈕(與行政端各表同一種入口) */}
                  <td className="cell-clip" title={`${l.equipment} ×${l.qty}`} style={{ fontWeight: 500 }}>
                    <button
                      type="button"
                      className="row-open-btn"
                      aria-label={`開啟 ${l.club} 的「${l.equipment}」歸還點交`}
                      onClick={(e) => {
                        e.stopPropagation()
                        openReturn(l)
                      }}
                    >
                      {l.equipment} <span className="num">×{l.qty}</span>
                    </button>
                  </td>
                  {/* 逾期單要在點收當下就看得出來(逾期會影響停權與行政分) */}
                  <td className="num" style={{ fontSize: 13 }}>
                    {l.start} – {l.end}
                    {l.overdue && <span style={{ marginLeft: 8 }}><StatusPill status="overdue" /></span>}
                  </td>
                  <td className="cell-clip" title={l.borrower} style={{ fontSize: 13 }}>{l.borrower}</td>
                </tr>
              ))}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={4}>
                    <QueryError
                      compact
                      title="借出中清單載入失敗"
                      error={listQuery.error}
                      onRetry={() => void listQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && rows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有借出中的器材</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
          <Pager page={page} pageSize={STAFF_PAGE_SIZE} total={total} onChange={setPage} />
      </div>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        afterClose={() => setSelected(null)}
        destroyOnHidden
        title={selected ? `歸還點交 — ${selected.club}` : ''}
        footer={
          <Button type="primary" loading={checkin.isPending} onClick={confirm}>
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
              {selected.overdue && <span style={{ marginLeft: 12 }}><StatusPill status="overdue" /></span>}
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
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>備註(選填)</div>
              <Input.TextArea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="如:外觀損傷、配件缺漏"
                rows={2}
                maxLength={200}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

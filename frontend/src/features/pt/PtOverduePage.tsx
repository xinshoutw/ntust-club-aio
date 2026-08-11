import { useState } from 'react'
import { App, Button, Spin, Tooltip } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols, Pager } from '../../components/ui/tableControls'
import { confirmDialog } from '../../lib/confirm'
import { STAFF_PAGE_SIZE, useStaffLoans, useStaffMutations, type StaffLoan } from '../../api/staff'

// 逾期追蹤:逾期=結束日隔天上班日 10:30 未歸還(後端推導;已逾天數前端以台北時區日差計算);
// 停權管理屬行政端 super,此頁僅追蹤與提醒(Discord + 社團聯絡人 Email)
export default function PtOverduePage() {
  const { message, modal } = App.useApp()
  const [page, setPage] = useState(1)
  const listQuery = useStaffLoans('overdue', page)
  const { remind } = useStaffMutations()
  const rows = listQuery.data?.loans ?? []
  const total = listQuery.data?.total ?? 0

  const askRemind = (r: StaffLoan) => {
    confirmDialog(modal, {
      title: '發送歸還提醒',
      content: `將以 Discord 與 Email 通知 ${r.club} 儘速歸還「${r.equipment}」,確定發送?`,
      okText: '發送提醒',
      onOk: () =>
        remind.mutateAsync(r.id).then(
          () => message.success(`已通知 ${r.club} 儘速歸還「${r.equipment}」`),
          (e: Error) => {
            message.error(e.message)
          },
        ),
    })
  }

  return (
    <div>
      <PageHeader
        title="逾期追蹤"
        sub={
          <>
            逾期未歸還 <span className="num">{total}</span> 件
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <Spin spinning={listQuery.isPending}>
          <table className="tb dense fixed" style={{ minWidth: 760 }}>
            <Cols widths={['20%', 'auto', 144, 72, 90, 90, 100]} />
            <thead>
              <tr>
                <th>社團</th>
                <th>器材</th>
                <th>應歸還時限</th>
                <th>已逾</th>
                <th>借用人</th>
                <th>狀態</th>
                <th>動作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="cell-clip" title={r.club}>{r.club}</td>
                  <td className="cell-clip" title={`${r.equipment} ×${r.qty}`} style={{ fontWeight: 500 }}>
                    {r.equipment} <span className="num">×{r.qty}</span>
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>{r.due}</td>
                  <td className="num" style={{ fontSize: 13, color: '#A3341F' }}>{r.daysLate} 天</td>
                  <td className="cell-clip" title={r.phone ? `${r.borrower ?? ''}・${r.phone}` : r.borrower} style={{ fontSize: 13 }}>
                    {r.borrower}
                    {/* 逾期追蹤的動作就是聯絡社團,電話要看得到 */}
                    {r.phone && <div className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>{r.phone}</div>}
                  </td>
                  <td><StatusPill status="overdue" /></td>
                  <td>
                    {r.manual ? (
                      <Tooltip title="行政手動借用無提醒對象">
                        <Button size="small" disabled>發送提醒</Button>
                      </Tooltip>
                    ) : (
                      <Button size="small" disabled={remind.isPending} onClick={() => askRemind(r)}>
                        發送提醒
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={7}>
                    <QueryError
                      compact
                      title="逾期清單載入失敗"
                      error={listQuery.error}
                      onRetry={() => void listQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && rows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有逾期未歸還的器材</td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager page={page} pageSize={STAFF_PAGE_SIZE} total={total} onChange={setPage} />
        </Spin>
      </div>
    </div>
  )
}

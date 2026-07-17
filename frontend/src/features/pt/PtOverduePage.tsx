import { useState } from 'react'
import { App, Button } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { Pager } from '../../components/ui/tableControls'
import { OVERDUE_ROWS } from './mock'

const PAGE_SIZE = 20

// 逾期追蹤(工讀生端基礎原型):逾期=結束日隔天上班日 10:30 未歸還(後端推導);
// 停權管理屬行政端 super,此頁僅追蹤與提醒。mock:提醒僅 toast
export default function PtOverduePage() {
  const { message } = App.useApp()
  const [page, setPage] = useState(1)
  const rows = OVERDUE_ROWS
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <PageHeader
        title="逾期追蹤"
        sub={
          <>
            逾期未歸還 <span className="num">{rows.length}</span> 件
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb dense" style={{ minWidth: 760 }}>
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
            {paged.map((r) => (
              <tr key={r.id}>
                <td>{r.club}</td>
                <td style={{ fontWeight: 500 }}>
                  {r.equipment} <span className="num">×{r.qty}</span>
                </td>
                <td className="num" style={{ fontSize: 13 }}>{r.due}</td>
                <td className="num" style={{ fontSize: 13, color: '#A3341F' }}>{r.daysLate} 天</td>
                <td style={{ fontSize: 13 }}>{r.borrower}</td>
                <td><StatusPill status="overdue" /></td>
                <td>
                  <Button size="small" onClick={() => message.success(`已再次通知 ${r.club} 歸還「${r.equipment}」`)}>
                    發送提醒
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className="no-hover">
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有逾期未歸還的器材</td>
              </tr>
            )}
          </tbody>
        </table>
        <Pager page={page} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} />
      </div>
    </div>
  )
}

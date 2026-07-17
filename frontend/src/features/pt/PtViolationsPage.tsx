import { useMemo, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { Pager } from '../../components/ui/tableControls'
import { VIOLATIONS } from './mock'

const PAGE_SIZE = 20

// 違規紀錄查詢(工讀生端基礎原型):唯讀列表;銷案動作屬行政端
export default function PtViolationsPage() {
  const [page, setPage] = useState(1)

  // 預設:未銷案在前,組內發生日升冪(與行政端違規管理一致)
  const rows = useMemo(
    () =>
      [...VIOLATIONS].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'violation_open' ? -1 : 1
        return a.date.localeCompare(b.date)
      }),
    [],
  )
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <PageHeader
        title="違規紀錄查詢"
        sub={
          <>
            未銷案 <span className="num">{rows.filter((r) => r.status === 'violation_open').length}</span> 筆
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb dense" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>發生日</th>
              <th>社團</th>
              <th>地點</th>
              <th>違規項目</th>
              <th>填寫人</th>
              <th>銷案期限</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((v) => (
              <tr key={v.id}>
                <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                <td>{v.club}</td>
                <td style={{ fontSize: 13 }}>{v.location}</td>
                <td style={{ fontSize: 13 }}>{v.items.join('、')}</td>
                <td style={{ fontSize: 13 }}>{v.filler}</td>
                <td className="num" style={{ fontSize: 13 }}>{v.deadline}</td>
                <td><StatusPill status={v.status} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className="no-hover">
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有違規紀錄</td>
              </tr>
            )}
          </tbody>
        </table>
        <Pager page={page} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} />
      </div>
    </div>
  )
}

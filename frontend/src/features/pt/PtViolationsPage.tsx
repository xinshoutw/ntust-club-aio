import { useState } from 'react'
import { Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Pager } from '../../components/ui/tableControls'
import { STAFF_PAGE_SIZE, useStaffViolations } from '../../api/staff'

// 違規紀錄查詢:唯讀伺服器分頁列表;銷案動作屬行政端。
// 預設排序=後端(未銷案在前、組內發生日升冪,與行政端違規管理一致)
export default function PtViolationsPage() {
  const [page, setPage] = useState(1)
  const listQuery = useStaffViolations(page)
  const rows = listQuery.data?.violations ?? []
  const total = listQuery.data?.total ?? 0

  return (
    <div>
      <PageHeader
        title="違規紀錄查詢"
        sub={
          <>
            共 <span className="num">{total}</span> 筆
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <Spin spinning={listQuery.isPending}>
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
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                  <td>{v.club}</td>
                  <td style={{ fontSize: 13 }}>{v.location}</td>
                  <td style={{ fontSize: 13 }}>
                    <div>{v.items.join('、')}</div>
                    {v.other && <div style={{ fontSize: 12, color: 'var(--steel)' }}>{v.other}</div>}
                  </td>
                  <td style={{ fontSize: 13 }}>{v.filler}</td>
                  <td className="num" style={{ fontSize: 13 }}>{v.deadline}</td>
                  <td><StatusPill status={v.status} /></td>
                </tr>
              ))}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={7}>
                    <QueryError
                      compact
                      title="違規紀錄載入失敗"
                      error={listQuery.error}
                      onRetry={() => void listQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && rows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有違規紀錄</td>
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

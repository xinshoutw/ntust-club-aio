import { useState } from 'react'
import { Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols, MultiSortButton, Pager, sortParam, useMultiSort } from '../../components/ui/tableControls'
import { STAFF_PAGE_SIZE, useStaffViolations } from '../../api/staff'

// 排序鍵=後端 /staff/violations 白名單(社團欄不在白名單,不開排序)
type SortKey = 'date' | 'location' | 'items' | 'filler' | 'deadline' | 'status'

// 違規紀錄查詢:唯讀伺服器分頁列表;銷案動作屬行政端。
// 預設排序=後端(未銷案在前、組內發生日升冪,與行政端違規管理一致);點欄名多欄排序(伺服器端)
export default function PtViolationsPage() {
  const [page, setPage] = useState(1)
  const { entries, stack, toggle } = useMultiSort<SortKey>()
  const listQuery = useStaffViolations(page, sortParam(entries))
  const rows = listQuery.data?.violations ?? []
  const total = listQuery.data?.total ?? 0

  const toggleSort = (key: SortKey) => {
    toggle(key)
    setPage(1)
  }

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
          <table className="tb dense fixed" style={{ minWidth: 760 }}>
            <Cols widths={[100, '20%', '14%', 'auto', 90, 104, 84]} />
            <thead>
              <tr>
                <th>
                  <MultiSortButton label="發生日" sortKey="date" stack={stack} onToggle={toggleSort} />
                </th>
                <th>社團</th>
                <th>
                  <MultiSortButton label="地點" sortKey="location" stack={stack} onToggle={toggleSort} />
                </th>
                <th>
                  <MultiSortButton label="違規項目" sortKey="items" stack={stack} onToggle={toggleSort} />
                </th>
                <th>
                  <MultiSortButton label="填寫人" sortKey="filler" stack={stack} onToggle={toggleSort} />
                </th>
                <th>
                  <MultiSortButton label="銷案期限" sortKey="deadline" stack={stack} onToggle={toggleSort} />
                </th>
                <th>
                  <MultiSortButton label="狀態" sortKey="status" stack={stack} onToggle={toggleSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                  <td className="cell-clip" title={v.club}>{v.club}</td>
                  <td className="cell-clip" title={v.location} style={{ fontSize: 13 }}>{v.location}</td>
                  <td style={{ fontSize: 13 }}>
                    <div>{v.items.join('、')}</div>
                    {v.other && <div style={{ fontSize: 12, color: 'var(--steel)' }}>{v.other}</div>}
                  </td>
                  <td className="cell-clip" title={v.filler} style={{ fontSize: 13 }}>{v.filler}</td>
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

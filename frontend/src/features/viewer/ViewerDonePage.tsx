import { useState } from 'react'
import { Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Pager, SortButton, useSort } from '../../components/ui/tableControls'
import { useViewerDone } from '../../api/viewer'

const PAGE_SIZE = 20

type SortKey = 'award' | 'club' | 'total' | 'submitted_at'

// 已完成評分:伺服器分頁唯讀清單,預設完成時間新在前
export default function ViewerDonePage() {
  const [page, setPage] = useState(1)
  const { sort, toggle } = useSort<SortKey>({ key: 'submitted_at', dir: -1 })
  const query = useViewerDone({
    // 無排序時不帶參數,後端預設 -submitted_at
    sort: sort ? (sort.dir === -1 ? `-${sort.key}` : sort.key) : undefined,
    page,
    pageSize: PAGE_SIZE,
  })
  const rows = query.data?.rows ?? []
  const total = query.data?.total ?? 0

  const toggleSort = (key: SortKey) => {
    toggle(key)
    setPage(1)
  }

  return (
    <div>
      <PageHeader
        title="已完成評分"
        sub={
          <>
            共 <span className="num">{total}</span> 筆
          </>
        }
      />

      <Spin spinning={query.isPending}>
        <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
          <table className="tb dense" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th>
                  <SortButton label="獎項" sortKey="award" sort={sort} onToggle={toggleSort} />
                </th>
                <th>
                  <SortButton label="社團" sortKey="club" sort={sort} onToggle={toggleSort} />
                </th>
                <th>
                  <SortButton label="總分" sortKey="total" sort={sort} onToggle={toggleSort} />
                </th>
                <th>
                  <SortButton label="完成時間" sortKey="submitted_at" sort={sort} onToggle={toggleSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.awardId}-${r.clubId}`}>
                  <td>{r.awardName}</td>
                  <td style={{ fontWeight: 500 }}>{r.clubName}</td>
                  {/* 去除浮點雜訊(細項分數為 float) */}
                  <td className="num">{Math.round(r.total * 100) / 100}</td>
                  <td className="num" style={{ fontSize: 13 }}>{r.submittedAt}</td>
                </tr>
              ))}
              {query.isError && (
                <tr className="no-hover">
                  <td colSpan={4}>
                    <QueryError compact title="已完成評分載入失敗" error={query.error} onRetry={() => void query.refetch()} />
                  </td>
                </tr>
              )}
              {!query.isError && !query.isPending && rows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>尚無已完成的評分</td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </div>
      </Spin>
    </div>
  )
}

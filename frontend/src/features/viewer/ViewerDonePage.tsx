import { useState } from 'react'
import { Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols, MultiSortButton, Pager, sortParam, useMultiSort, type SortEntry } from '../../components/ui/tableControls'
import { useViewerDone } from '../../api/viewer'

const PAGE_SIZE = 20

type SortKey = 'award' | 'club' | 'total' | 'submitted_at'

// 預設排序:完成時間新在前(顯式送 -submitted_at,與後端預設一致)
const DONE_SORT: readonly SortEntry<SortKey>[] = [{ key: 'submitted_at', dir: -1 }]

// 已完成評分:伺服器分頁唯讀清單;點欄名多欄排序(伺服器端)
export default function ViewerDonePage() {
  const [page, setPage] = useState(1)
  const { entries, stack, toggle } = useMultiSort<SortKey>(DONE_SORT)
  const query = useViewerDone({
    sort: sortParam(entries),
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
          <table className="tb dense fixed" style={{ minWidth: 560 }}>
            <Cols widths={['34%', 'auto', 90, 150]} />
            <thead>
              <tr>
                <th>
                  <MultiSortButton label="獎項" sortKey="award" stack={stack} onToggle={toggleSort} />
                </th>
                <th>
                  <MultiSortButton label="社團" sortKey="club" stack={stack} onToggle={toggleSort} />
                </th>
                <th>
                  <MultiSortButton label="總分" sortKey="total" stack={stack} onToggle={toggleSort} />
                </th>
                <th>
                  <MultiSortButton label="完成時間" sortKey="submitted_at" stack={stack} onToggle={toggleSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.awardId}-${r.clubId}`}>
                  <td className="cell-clip" title={r.awardName}>{r.awardName}</td>
                  <td className="cell-clip" title={r.clubName} style={{ fontWeight: 500 }}>{r.clubName}</td>
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

import { useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import { Pager } from '../../components/ui/tableControls'
import { DONE_ROWS } from './mock'

const PAGE_SIZE = 20

// 已完成評分(評審端基礎原型):唯讀清單
export default function ViewerDonePage() {
  const [page, setPage] = useState(1)
  const rows = DONE_ROWS
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <PageHeader
        title="已完成評分"
        sub={
          <>
            共 <span className="num">{rows.length}</span> 筆
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb dense" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>獎項</th>
              <th>社團</th>
              <th>總分</th>
              <th>完成時間</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={`${r.award}-${r.club}`}>
                <td>{r.award}</td>
                <td style={{ fontWeight: 500 }}>{r.club}</td>
                <td className="num">{r.total}</td>
                <td className="num" style={{ fontSize: 13 }}>{r.date}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className="no-hover">
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>尚無已完成的評分</td>
              </tr>
            )}
          </tbody>
        </table>
        <Pager page={page} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} />
      </div>
    </div>
  )
}

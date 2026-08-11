import { useState } from 'react'
import dayjs from 'dayjs'
import { Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols, Pager } from '../../components/ui/tableControls'
import { useViolations } from '../../api/violations'

const PAGE_SIZE = 20

export default function ViolationsPage() {
  const [page, setPage] = useState(1)
  const listQuery = useViolations({ page, pageSize: PAGE_SIZE })
  const violations = listQuery.data?.violations ?? []
  const total = listQuery.data?.total ?? 0

  return (
    <div>
      <PageHeader
        title="違規勸導紀錄"
        sub={
          <>
            共 <span className="num">{total}</span> 筆
          </>
        }
      />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        請於 <span className="num">1</span> 個月內至學務處活動辦理銷案，逾期將不受理
      </div>

      <Spin spinning={listQuery.isPending}>
        <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
          <table className="tb fixed" style={{ minWidth: 720 }}>
            <Cols widths={[110, '22%', 'auto', 180, 100]} />
            <thead>
              <tr>
                <th scope="col">日期</th>
                <th scope="col">地點</th>
                <th scope="col">違規項目</th>
                <th scope="col">銷案期限</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {violations.map((v) => {
                const daysLeft = v.deadline
                  ? dayjs(v.deadline, 'YYYY/MM/DD').diff(dayjs().startOf('day'), 'day')
                  : 0
                return (
                  <tr key={v.id}>
                    <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                    <td>{v.location}</td>
                    <td>
                      <div>{v.items.join('、')}</div>
                      {v.note && <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>{v.note}</div>}
                    </td>
                    <td className="num" style={{ fontSize: 13 }}>
                      {v.status === 'violation_resolved' || !v.deadline ? (
                        <span style={{ color: 'var(--steel)' }}>—</span>
                      ) : v.expired ? (
                        <span style={{ color: '#C13B34', fontWeight: 500 }}>{v.deadline} 已截止</span>
                      ) : (
                        <>
                          {v.deadline}
                          <span style={{ color: 'var(--steel)' }}>{daysLeft > 0 ? `(剩 ${daysLeft} 天)` : '(今日截止)'}</span>
                        </>
                      )}
                    </td>
                    <td><StatusPill status={v.status} /></td>
                  </tr>
                )
              })}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={5}>
                    <QueryError compact title="違規勸導紀錄載入失敗" error={listQuery.error} onRetry={() => listQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!listQuery.isError && !listQuery.isPending && violations.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                    沒有違規勸導紀錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>
      <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} style={{ padding: 0, marginTop: 14 }} />
    </div>
  )
}

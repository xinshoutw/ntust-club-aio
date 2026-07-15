import dayjs from 'dayjs'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { VIOLATIONS, resolveDeadline, resolveExpired } from './mock'

export default function ViolationsPage() {
  const { user } = useAuth()
  const mine = VIOLATIONS.filter((v) => v.club === user?.club)

  return (
    <div>
      <PageHeader
        title="違規勸導紀錄"
        sub={
          <>
            共 <span className="num">{mine.length}</span> 筆
          </>
        }
      />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        請於 <span className="num">1</span> 個月內至學務處活動辦理銷案，逾期將不受理
      </div>

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>日期</th>
              <th>地點</th>
              <th>違規項目</th>
              <th>銷案期限</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {mine.map((v) => {
              const deadline = resolveDeadline(v)
              const expired = resolveExpired(v)
              const daysLeft = dayjs(deadline, 'YYYY/MM/DD').diff(dayjs().startOf('day'), 'day')
              return (
                <tr key={v.id}>
                  <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                  <td>{v.location}</td>
                  <td>
                    <div>{v.items.join('、')}</div>
                    {v.note && <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>{v.note}</div>}
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>
                    {v.status === 'violation_resolved' ? (
                      <span style={{ color: 'var(--steel)' }}>—</span>
                    ) : expired ? (
                      <span style={{ color: '#B03A2E', fontWeight: 500 }}>{deadline} 已截止</span>
                    ) : (
                      <>
                        {deadline}
                        <span style={{ color: 'var(--steel)' }}>{daysLeft > 0 ? `(剩 ${daysLeft} 天)` : '(今日截止)'}</span>
                      </>
                    )}
                  </td>
                  <td><StatusPill status={v.status} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

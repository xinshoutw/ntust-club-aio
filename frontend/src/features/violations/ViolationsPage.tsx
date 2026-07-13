import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { VIOLATIONS } from './mock'

export default function ViolationsPage() {
  const { user } = useAuth()
  const mine = VIOLATIONS.filter((v) => v.club === user?.club)

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader
        title="違規勸導紀錄"
        sub={
          <>
            {user?.club} · 共 <span className="num">{mine.length}</span> 筆
          </>
        }
      />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        未銷案紀錄請洽課外活動指導組辦理銷案(如愛校服務)。
      </div>

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>單號</th>
              <th>日期</th>
              <th>地點</th>
              <th>違規項目</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {mine.map((v) => (
              <tr key={v.id}>
                <td className="num" style={{ color: 'var(--steel)' }}>{v.id}</td>
                <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                <td>{v.location}</td>
                <td>
                  <div>{v.items.join('、')}</div>
                  {v.note && <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>{v.note}</div>}
                </td>
                <td><StatusPill status={v.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { EQUIPMENT_LOANS, ROOM_REQUESTS, VENUE_BOOKINGS } from './mock'

export default function BookingOverviewPage() {
  const { user } = useAuth()
  const mine = user?.club
  const rooms = ROOM_REQUESTS.filter((r) => r.club === mine)
  const venues = VENUE_BOOKINGS.filter((v) => v.club === mine)
  const loans = EQUIPMENT_LOANS.filter((l) => l.club === mine)

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader title="借用總覽" sub={mine} />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>固定場地</div>
        <table className="tb" style={{ minWidth: 640 }}>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id}>
                <td className="num" style={{ color: 'var(--steel)', width: 150 }}>{r.id}</td>
                <td style={{ fontWeight: 500 }}>{r.room}</td>
                <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                  {r.entries.map((e) => `${e.date} 第${e.period}節`).join('、')}
                </td>
                <td style={{ width: 120 }}><StatusPill status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>臨時場地</div>
        <table className="tb" style={{ minWidth: 640 }}>
          <tbody>
            {venues.map((v) => (
              <tr key={v.id}>
                <td className="num" style={{ color: 'var(--steel)', width: 150 }}>{v.id}</td>
                <td style={{ fontWeight: 500 }}>{v.venue}</td>
                <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                <td style={{ color: 'var(--steel)', fontSize: 13 }}>第 {v.periods.join('、')} 節 · {v.purpose}</td>
                <td style={{ width: 120 }}><StatusPill status={v.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>器材(含歸還狀態)</div>
        <table className="tb" style={{ minWidth: 720 }}>
          <tbody>
            {loans.map((l) => (
              <tr key={l.id}>
                <td className="num" style={{ color: 'var(--steel)', width: 150 }}>{l.id}</td>
                <td style={{ fontWeight: 500 }}>
                  {l.equipment} <span className="num">×{l.qty}</span>
                </td>
                <td className="num" style={{ fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                  {l.status === 'checked_out' && l.returnDue ? `歸還期限 ${l.returnDue}` : l.purpose}
                </td>
                <td style={{ width: 120 }}><StatusPill status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--steel)' }}>
        器材應於借用結束日之隔天上班日 10:30 前歸還;逾期將影響社團借用權益。
      </div>
    </div>
  )
}

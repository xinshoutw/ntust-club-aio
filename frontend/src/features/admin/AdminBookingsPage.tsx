import { App } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { EQUIPMENT_LOANS, VENUE_BOOKINGS } from '../bookings/mock'

export default function AdminBookingsPage() {
  const { message } = App.useApp()
  const pendingVenues = VENUE_BOOKINGS.filter((v) => v.status === 'pending')
  const pendingLoans = EQUIPMENT_LOANS.filter((l) => l.status === 'pending')

  const actions = (id: string) => (
    <td className="r" style={{ whiteSpace: 'nowrap' }}>
      <button type="button" className="link-btn primary" onClick={() => message.success(`已核准 ${id}`)}>核准</button>
      <button type="button" className="link-btn" onClick={() => message.info('退回需填原因(接後端後啟用)')}>退回…</button>
    </td>
  )

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader
        title="臨時場地器材借用"
        sub={
          <>
            待審 <span className="num">{pendingVenues.length + pendingLoans.length}</span> 件
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>場地</div>
        <table className="tb dense" style={{ minWidth: 720 }}>
          <tbody>
            {pendingVenues.map((v) => (
              <tr key={v.id}>
                <td className="num" style={{ color: 'var(--steel)', width: 140 }}>{v.id}</td>
                <td>{v.club}</td>
                <td style={{ fontWeight: 500 }}>{v.venue}</td>
                <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>第 {v.periods.join('、')} 節 · {v.purpose}</td>
                <td style={{ width: 90 }}><StatusPill status={v.status} /></td>
                {actions(v.id)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>器材</div>
        <table className="tb dense" style={{ minWidth: 720 }}>
          <tbody>
            {pendingLoans.map((l) => (
              <tr key={l.id}>
                <td className="num" style={{ color: 'var(--steel)', width: 140 }}>{l.id}</td>
                <td>{l.club}</td>
                <td style={{ fontWeight: 500 }}>
                  {l.equipment} <span className="num">×{l.qty}</span>
                </td>
                <td className="num" style={{ fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{l.purpose}</td>
                <td style={{ width: 90 }}><StatusPill status={l.status} /></td>
                {actions(l.id)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

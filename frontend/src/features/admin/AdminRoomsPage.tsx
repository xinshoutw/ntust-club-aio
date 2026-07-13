import { App } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { ROOM_REQUESTS } from '../bookings/mock'

export default function AdminRoomsPage() {
  const { message } = App.useApp()
  const pending = ROOM_REQUESTS.filter((r) => r.status === 'pending')

  // 標出互相衝突的時段(同教室同日期同節次)
  const conflictKeys = new Set<string>()
  const seen = new Map<string, string>()
  for (const r of pending) {
    for (const e of r.entries) {
      const key = `${r.room}|${e.date}|${e.period}`
      if (seen.has(key)) {
        conflictKeys.add(key)
      } else {
        seen.set(key, r.id)
      }
    }
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader
        title="教室固定借用"
        sub={
          <>
            待審 <span className="num">{pending.length}</span> 件
          </>
        }
      />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        紅字時段與其他申請衝突,請擇一核准或協調換時段。
      </div>

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb dense" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>單號</th>
              <th>社團</th>
              <th>教室</th>
              <th>時段</th>
              <th>用途</th>
              <th>狀態</th>
              <th className="r">動作</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => (
              <tr key={r.id}>
                <td className="num" style={{ color: 'var(--steel)' }}>{r.id}</td>
                <td>{r.club}</td>
                <td style={{ fontWeight: 500 }}>{r.room}</td>
                <td style={{ fontSize: 13 }}>
                  {r.entries.map((e, i) => {
                    const conflict = conflictKeys.has(`${r.room}|${e.date}|${e.period}`)
                    return (
                      <span key={`${e.date}-${e.period}`} className="num" style={{ color: conflict ? '#C13B34' : undefined, fontWeight: conflict ? 500 : undefined }}>
                        {i > 0 && '、'}
                        {e.date} 第{e.period}節
                        {conflict && <span style={{ fontSize: 12 }}>(衝突)</span>}
                      </span>
                    )
                  })}
                </td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{r.note}</td>
                <td><StatusPill status={r.status} /></td>
                <td className="r" style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="link-btn primary" onClick={() => message.success(`已核准 ${r.id}`)}>核准</button>
                  <button type="button" className="link-btn" onClick={() => message.info('退回需填原因(接後端後啟用)')}>退回…</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

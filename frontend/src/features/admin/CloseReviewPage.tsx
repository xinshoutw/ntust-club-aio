import { App, Button } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'

const PENDING = [
  { id: 'ACT-114-0014', club: '攝影社', name: '期末影展', date: '2026/06/10', expense: 19500, reflections: 3 },
  { id: 'ACT-114-0016', club: '國際志工社', name: '社區服務日', date: '2026/06/08', expense: 6200, reflections: 4 },
]

const LOCKED = [
  { id: 'ACT-114-0012', club: '資工系學會', name: '程式設計工作坊', deadline: '2026/05/12' },
]

export default function CloseReviewPage() {
  const { message } = App.useApp()

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader
        title="結案審核"
        sub={
          <>
            待審 <span className="num">{PENDING.length}</span> 件 · 逾期鎖定 <span className="num">{LOCKED.length}</span> 件
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>待審結案(輔導老師單關)</div>
        <table className="tb dense" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>單號</th>
              <th>社團</th>
              <th>活動</th>
              <th>活動日期</th>
              <th className="r">核銷金額</th>
              <th className="r">心得</th>
              <th className="r">動作</th>
            </tr>
          </thead>
          <tbody>
            {PENDING.map((p) => (
              <tr key={p.id}>
                <td className="num" style={{ color: 'var(--steel)' }}>{p.id}</td>
                <td>{p.club}</td>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td className="num">{p.date}</td>
                <td className="r num">${p.expense.toLocaleString()}</td>
                <td className="r num">{p.reflections} 人</td>
                <td className="r" style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="link-btn primary" onClick={() => message.success(`已核准結案 ${p.id}(計入評鑑行政分)`)}>核准結案</button>
                  <button type="button" className="link-btn" onClick={() => message.info('退回結案需填原因(接後端後啟用)')}>退回…</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>逾期未結案(已鎖定)</div>
        <table className="tb dense" style={{ minWidth: 640 }}>
          <tbody>
            {LOCKED.map((l) => (
              <tr key={l.id}>
                <td className="num" style={{ color: 'var(--steel)', width: 150 }}>{l.id}</td>
                <td>{l.club}</td>
                <td style={{ fontWeight: 500 }}>{l.name}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>
                  結案期限 <span className="num">{l.deadline}</span>
                </td>
                <td style={{ width: 110 }}><StatusPill status="locked" /></td>
                <td className="r" style={{ width: 90 }}>
                  <Button size="small" style={{ height: 28 }} onClick={() => message.success(`已解鎖 ${l.id},社團可補送結案`)}>
                    解鎖
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

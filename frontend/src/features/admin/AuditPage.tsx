import PageHeader from '../../components/ui/PageHeader'

const LOGS = [
  { time: '2026/07/13 16:42', who: '王組長', role: '管理員', action: '解鎖逾期結案', detail: 'ACT-114-0012 程式設計工作坊' },
  { time: '2026/07/13 15:10', who: '王家豪', role: '輔導老師', action: '核准活動申請', detail: 'ACT-114-0031 機器人組裝工作坊(核定 $6,000)' },
  { time: '2026/07/12 11:03', who: '林淑芬', role: '組長', action: '退回活動申請', detail: 'ACT-114-0019 電競友誼賽:經費明細未附估價單' },
  { time: '2026/07/12 09:30', who: '李承辦', role: '管理員', action: '發布公告', detail: '114-2 社團評鑑報名開始(全校)' },
  { time: '2026/07/11 14:22', who: '王組長', role: '管理員', action: '停權社團', detail: '機械系學會 至 2026/07/15:器材損壞未賠償' },
  { time: '2026/07/11 10:05', who: '李工讀', role: '工讀生', action: '器材借出點交', detail: 'EQP-114-0092 摺疊桌 ×10(資工系學會)' },
]

export default function AuditPage() {
  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="稽核軌跡" sub="高風險操作紀錄(唯讀)" />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb dense" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>時間</th>
              <th>操作者</th>
              <th>角色</th>
              <th>動作</th>
              <th>內容</th>
            </tr>
          </thead>
          <tbody>
            {LOGS.map((l) => (
              <tr key={l.time + l.action}>
                <td className="num" style={{ fontSize: 13, color: 'var(--steel)', whiteSpace: 'nowrap' }}>{l.time}</td>
                <td style={{ fontWeight: 500 }}>{l.who}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{l.role}</td>
                <td>{l.action}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

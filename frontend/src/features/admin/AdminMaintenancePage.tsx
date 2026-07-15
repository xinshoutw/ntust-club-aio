import { App, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'

type MaintenanceStatus = 'pending' | 'in_progress' | 'done'

const QUEUE: { id: string; club: string; location: string; items: string; date: string; status: MaintenanceStatus }[] = [
  { id: 'MNT-114-0023', club: '資工系學會', location: '社團大樓 3F S304 音樂教室', items: '天花板漏水、燈管不亮', date: '2026/06/16', status: 'in_progress' },
  { id: 'MNT-114-0024', club: '美術社', location: '社辦 S207', items: '窗戶卡死', date: '2026/06/18', status: 'pending' },
  { id: 'MNT-114-0019', club: '資工系學會', location: '社辦 S312', items: '門鎖損壞', date: '2026/05/02', status: 'done' },
]

export default function AdminMaintenancePage() {
  const { message } = App.useApp()

  return (
    <div>
      <PageHeader
        title="維修管理"
        sub={
          <>
            待處理 <span className="num">{QUEUE.filter((q) => q.status === 'pending').length}</span> 件
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb dense" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>單號</th>
              <th>社團</th>
              <th>地點</th>
              <th>項目</th>
              <th>申請日</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {QUEUE.map((q) => (
              <tr key={q.id}>
                <td className="num" style={{ color: 'var(--steel)' }}>{q.id}</td>
                <td>{q.club}</td>
                <td style={{ fontWeight: 500 }}>{q.location}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{q.items}</td>
                <td className="num" style={{ fontSize: 13 }}>{q.date}</td>
                <td style={{ width: 150 }}>
                  {q.status === 'done' ? (
                    <StatusPill status="done" />
                  ) : (
                    <Select<MaintenanceStatus>
                      size="small"
                      value={q.status}
                      style={{ width: 110 }}
                      onChange={(v) => message.success(`${q.id} 狀態已更新為「${v === 'done' ? '已完成' : v === 'in_progress' ? '處理中' : '待處理'}」`)}
                      options={[
                        { value: 'pending', label: '待處理' },
                        { value: 'in_progress', label: '處理中' },
                        { value: 'done', label: '已完成' },
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
            {QUEUE.length === 0 && (
              <tr className="no-hover">
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有維修申請。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

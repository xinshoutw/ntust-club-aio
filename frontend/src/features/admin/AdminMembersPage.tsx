import { useState } from 'react'
import { Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { MEMBERS } from '../members/mock'

const CLUBS = ['資工系學會', '電機系學會', '機械系學會', '學生會', '機器人研究社', '美術社']

export default function AdminMembersPage() {
  const [club, setClub] = useState(CLUBS[0])

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader
        title="成員管理"
        extra={
          <Select
            value={club}
            onChange={setClub}
            style={{ width: 200 }}
            options={CLUBS.map((c) => ({ value: c, label: c }))}
          />
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>姓名</th>
              <th>學號</th>
              <th>身分</th>
              <th>職稱</th>
              <th>更新時間</th>
            </tr>
          </thead>
          <tbody>
            {MEMBERS.map((m) => (
              <tr key={m.id}>
                <td style={{ fontWeight: 500 }}>{m.name}</td>
                <td className="num" style={{ color: 'var(--steel)' }}>{m.studentId}</td>
                <td>{m.kind}</td>
                <td>{m.title ?? '—'}</td>
                <td className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>{m.updatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--steel)' }}>
        名單由社團自行維護;行政僅供查閱與匯出({club})。
      </div>
    </div>
  )
}

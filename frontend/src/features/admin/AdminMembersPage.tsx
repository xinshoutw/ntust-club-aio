import { useState } from 'react'
import { Pagination, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { MEMBERS } from '../members/mock'

const CLUBS = ['資工系學會', '電機系學會', '機械系學會', '學生會', '機器人研究社', '美術社']
const PAGE_SIZE = 50

export default function AdminMembersPage() {
  const [club, setClub] = useState(CLUBS[0])
  const [page, setPage] = useState(1)
  const paged = MEMBERS.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <PageHeader
        title="成員管理"
        extra={
          <Select
            value={club}
            onChange={(v) => {
              setClub(v)
              setPage(1)
            }}
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
            {paged.map((m) => (
              <tr key={m.id}>
                <td style={{ fontWeight: 500 }}>{m.name}</td>
                <td className="num" style={{ color: 'var(--steel)' }}>{m.studentId}</td>
                <td>{m.kind}</td>
                <td>{m.title ?? '—'}</td>
                <td className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>{m.updatedAt}</td>
              </tr>
            ))}
            {MEMBERS.length === 0 && (
              <tr className="no-hover">
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                  {club} 尚未建立成員名單。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {MEMBERS.length > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <Pagination current={page} pageSize={PAGE_SIZE} total={MEMBERS.length} onChange={setPage} showSizeChanger={false} />
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--steel)' }}>
        名單由社團自行維護;行政僅供查閱與匯出({club})。
      </div>
    </div>
  )
}

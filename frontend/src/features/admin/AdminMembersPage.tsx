import { useEffect, useState } from 'react'
import { App, Button, Pagination, Select } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { CURRENT_SEMESTER, semesterOptions } from '../../lib/semester'
import { MEMBERS } from '../members/mock'
import ClubSelect from './ClubSelect'
import { useAdminClub } from './clubContext'

const PAGE_SIZE = 50

// 唯讀:名單由社團自行維護,行政僅查閱;可選學期、匯出 CSV(比照社團端成員列表)
export default function AdminMembersPage() {
  const { club } = useAdminClub()
  const { message } = App.useApp()
  const [page, setPage] = useState(1)
  const [semester, setSemester] = useState<string>(CURRENT_SEMESTER)
  useEffect(() => setPage(1), [club, semester])

  // mock 僅資工系學會有名單
  const all = club === '資工系學會' ? MEMBERS : []
  const list = all.filter((m) => semester === 'all' || m.semester === semester)
  const paged = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const exportCsv = () => {
    if (!list.length) {
      message.error(`${club} 沒有成員可匯出`)
      return
    }
    // 與社團端匯入格式相容(無標題列);職稱補空字串讓各列欄數一致
    const text = list.map((m) => [m.name, m.studentId, m.kind, m.title ?? ''].join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `成員名單_${club}_${semester === 'all' ? '全部學期' : semester}.csv`
    a.click()
    URL.revokeObjectURL(url)
    message.success(`已匯出 ${list.length} 名成員`)
  }

  return (
    <div>
      <PageHeader
        title="成員列表"
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            <Select
              value={semester}
              onChange={setSemester}
              style={{ width: 120 }}
              options={semesterOptions(all.map((m) => m.semester), true)}
            />
            <Button style={{ height: 36 }} icon={<DownloadOutlined />} onClick={exportCsv}>
              匯出 CSV
            </Button>
            <ClubSelect />
          </div>
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
            {list.length === 0 && (
              <tr className="no-hover">
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                  {club} 尚未建立成員名單。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {list.length > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <Pagination current={page} pageSize={PAGE_SIZE} total={list.length} onChange={setPage} showSizeChanger={false} />
        </div>
      )}
    </div>
  )
}

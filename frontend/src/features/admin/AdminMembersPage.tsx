import { useEffect, useState } from 'react'
import { App, Button, Select, Spin } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { Pager, SortButton } from '../../components/ui/tableControls'
import { downloadCsv } from '../../lib/csv'
import { kindLabel } from '../../lib/roles'
import { CURRENT_SEMESTER, semesterOptions } from '../../lib/semester'
import { fetchAllAdminMembers, useAdminClubMembers } from '../../api/adminClubs'
import ClubSelect from './ClubSelect'
import { useAdminClub } from './clubContext'

const PAGE_SIZE = 50

// 唯讀:名單由社團自行維護,行政僅查閱;可選學期、排序、匯出 CSV(比照社團端成員列表)
// 學期下拉:admin 端無 semesters 子端點,先以「當前學期+全部學期」簡化
export default function AdminMembersPage() {
  const { club, clubId, clubKind } = useAdminClub()
  const { message } = App.useApp()
  const [page, setPage] = useState(1)
  const [semester, setSemester] = useState<string>(CURRENT_SEMESTER)
  const [sort, setSort] = useState<{ key: 'kind' | 'title'; dir: 1 | -1 } | null>(null)
  const [exporting, setExporting] = useState(false)
  useEffect(() => setPage(1), [clubId, semester])

  const listQuery = useAdminClubMembers(clubId, {
    semester: semester === 'all' ? undefined : semester,
    sort: sort ? `${sort.dir === -1 ? '-' : ''}${sort.key}` : undefined,
    page,
    pageSize: PAGE_SIZE,
  })
  const members = listQuery.data?.members ?? []
  const total = listQuery.data?.total ?? 0

  const toggleSort = (key: 'kind' | 'title') =>
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }))

  const exportCsv = async () => {
    if (clubId == null) return
    setExporting(true)
    try {
      const rows = await fetchAllAdminMembers(clubId, semester === 'all' ? undefined : semester)
      if (!rows.length) {
        message.error(`${club} 沒有成員可匯出`)
        return
      }
      // 與社團端匯入格式相容(無標題列;後端 csv.reader 支援引號跳脫);身份以顯示詞輸出;職稱補空字串讓各列欄數一致
      downloadCsv(
        `成員名單_${club}_${semester === 'all' ? '全部學期' : semester}.csv`,
        rows.map((m) => [m.name, m.studentId, kindLabel(m.kind, clubKind), m.title ?? '', m.phone ?? '']),
      )
      message.success(`已匯出 ${rows.length} 名成員`)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '匯出失敗')
    } finally {
      setExporting(false)
    }
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
              options={semesterOptions([], true)}
            />
            <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportCsv()}>
              匯出 CSV
            </Button>
            <ClubSelect />
          </div>
        }
      />

      <Spin spinning={clubId != null && listQuery.isPending}>
        <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
          <table className="tb" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                <th>姓名</th>
                <th>學號</th>
                <th>
                  <SortButton label="身份" sortKey="kind" sort={sort} onToggle={toggleSort} />
                </th>
                <th>
                  <SortButton label="職稱" sortKey="title" sort={sort} onToggle={toggleSort} />
                </th>
                <th>電話</th>
                <th>學期</th>
                <th>更新時間</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.name}</td>
                  <td className="num" style={{ color: 'var(--steel)' }}>{m.studentId}</td>
                  <td>{kindLabel(m.kind, clubKind)}</td>
                  <td>{m.title ?? '—'}</td>
                  <td className="num">{m.phone ?? '—'}</td>
                  <td className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>{m.semester}</td>
                  <td className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>{m.updatedAt}</td>
                </tr>
              ))}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={7} style={{ textAlign: 'center', color: '#B03A2E', padding: 24 }}>
                    載入失敗:{listQuery.error.message}
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && members.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                    {club} 尚未建立成員名單
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>
      <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} style={{ padding: 0, marginTop: 14 }} />
    </div>
  )
}

import { useState } from 'react'
import { App, Select } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import {
  Cols,
  MultiSortButton,
  Pager,
  sortParam,
  useMultiSort,
  type SortEntry,
} from '../../components/ui/tableControls'
import {
  MAINTENANCE_PAGE_SIZE,
  NEXT_STATUS,
  useAdminMaintenance,
  useMaintenanceStatusMutation,
  usePendingMaintenanceTotal,
  type MaintenanceItem,
  type MaintenanceStatus,
} from '../../api/adminMaintenance'
import { fileDownloadUrl } from '../../api/adminFiles'

const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  pending: '待處理',
  in_progress: '處理中',
  done: '已完成',
}

// 排序鍵=後端 /admin/maintenance 白名單(status 依處理進度排,不是列舉字面值)
type SortKey = 'location' | 'created_at' | 'status'

// 預設排序:待處理 → 處理中 → 已完成,各組內照申請日順序(與後端預設一致)
const DEFAULT_SORT: SortEntry<SortKey>[] = [
  { key: 'status', dir: 1 },
  { key: 'created_at', dir: 1 },
]

export default function AdminMaintenancePage() {
  const { message } = App.useApp()
  const { entries, toggle } = useMultiSort<SortKey>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const listQuery = useAdminMaintenance(sortParam(entries), page)
  const rows = listQuery.data?.rows ?? []
  const total = listQuery.data?.total ?? 0
  const pendingTotal = usePendingMaintenanceTotal()
  const updateStatus = useMaintenanceStatusMutation()

  const toggleSort = (key: SortKey) => {
    toggle(key)
    setPage(1) // 伺服器端分頁:換排序回到第 1 頁
  }

  // 狀態機僅允許單步前進(待處理→處理中→已完成):下拉只開放下一步選項
  const onChangeStatus = (q: MaintenanceItem, status: MaintenanceStatus) => {
    updateStatus.mutate(
      { id: q.id, status },
      {
        onSuccess: () => message.success(`${q.location} 狀態已更新為「${STATUS_LABELS[status]}」`),
        onError: (e) => message.error(e.message),
      },
    )
  }

  return (
    <div>
      <PageHeader
        title="維修管理"
        sub={
          <>
            待處理 <span className="num">{pendingTotal.data ?? '—'}</span> 件
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <LoadingBlock pending={listQuery.isPending}>
          <table className="tb dense fixed" style={{ minWidth: 760 }}>
            {/* 社團/地點截斷、項目吃剩餘寬且允許換行;申請日/狀態固定 px(狀態含單步推進下拉) */}
            <Cols widths={['18%', '18%', 'auto', 150, 96, 150]} />
            <thead>
              <tr>
                <th scope="col">社團</th>
                <th scope="col"><MultiSortButton label="地點" sortKey="location" entries={entries} onToggle={toggleSort} /></th>
                <th scope="col">項目</th>
                <th scope="col">佐證</th>
                <th scope="col"><MultiSortButton label="申請日" sortKey="created_at" entries={entries} onToggle={toggleSort} /></th>
                <th scope="col"><MultiSortButton label="狀態" sortKey="status" entries={entries} onToggle={toggleSort} /></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id}>
                  <td className="cell-clip" title={q.club}>{q.club}</td>
                  <td className="cell-clip" title={q.location} style={{ fontWeight: 500 }}>{q.location}</td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>{q.items}</td>
                  {/* 照片/影片是最主要的判斷依據,不該只在檔案管理找得到 */}
                  <td className="cell-clip" style={{ fontSize: 13 }} title={q.evidence.map((f) => f.name).join('、')}>
                    {q.evidence.length
                      ? q.evidence.map((f, i) => (
                          <span key={f.id}>
                            {i > 0 && ' · '}
                            <a href={fileDownloadUrl(f.id)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--focus)' }}>
                              {f.name}
                            </a>
                          </span>
                        ))
                      : <span style={{ color: 'var(--steel)' }}>—</span>}
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>{q.date}</td>
                  <td>
                    {q.status === 'done' ? (
                      <StatusPill status="done" />
                    ) : (
                      <Select<MaintenanceStatus>
                        size="small"
                        value={q.status}
                        style={{ width: 110 }}
                        disabled={updateStatus.isPending}
                        onChange={(v) => onChangeStatus(q, v)}
                        options={(Object.keys(STATUS_LABELS) as MaintenanceStatus[]).map((s) => ({
                          value: s,
                          label: STATUS_LABELS[s],
                          // 僅目前狀態與單步前進的下一狀態可選
                          disabled: s !== q.status && NEXT_STATUS[q.status] !== s,
                        }))}
                      />
                    )}
                  </td>
                </tr>
              ))}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={6}>
                    <QueryError
                      compact
                      title="維修申請載入失敗"
                      error={listQuery.error}
                      onRetry={() => listQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && rows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>無維修申請</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
          <Pager page={page} pageSize={MAINTENANCE_PAGE_SIZE} total={total} onChange={setPage} />
      </div>
    </div>
  )
}

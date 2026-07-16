import { useMemo } from 'react'
import { App, Select, Spin } from 'antd'
import dayjs from 'dayjs'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { SortButton, useSort } from '../../components/ui/tableControls'
import {
  NEXT_STATUS,
  useAdminMaintenance,
  useMaintenanceStatusMutation,
  type MaintenanceItem,
  type MaintenanceStatus,
} from '../../api/adminMaintenance'

const STATUS_ORDER: Record<MaintenanceStatus, number> = { pending: 0, in_progress: 1, done: 2 }
const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  pending: '待處理',
  in_progress: '處理中',
  done: '已完成',
}

type SortKey = 'location' | 'date'

export default function AdminMaintenancePage() {
  const { message } = App.useApp()
  const { sort, toggle } = useSort<SortKey>()
  const listQuery = useAdminMaintenance()
  const queue = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const updateStatus = useMaintenanceStatusMutation()

  const rows = useMemo(() => {
    if (sort) {
      return [...queue].sort((a, b) => sort.dir * a[sort.key].localeCompare(b[sort.key], 'zh-Hant'))
    }
    // 預設排序:待處理 → 處理中 → 已完成,各組內照申請日順序(與後端預設一致)
    return [...queue].sort((a, b) => {
      if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      return dayjs(a.date, 'YYYY/MM/DD').valueOf() - dayjs(b.date, 'YYYY/MM/DD').valueOf()
    })
  }, [queue, sort])

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
            待處理 <span className="num">{queue.filter((q) => q.status === 'pending').length}</span> 件
          </>
        }
      />

      <Spin spinning={listQuery.isPending}>
        <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
          <table className="tb dense" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>社團</th>
                <th><SortButton label="地點" sortKey="location" sort={sort} onToggle={toggle} /></th>
                <th>項目</th>
                <th><SortButton label="申請日" sortKey="date" sort={sort} onToggle={toggle} /></th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id}>
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
                  <td colSpan={5}>
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
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有維修申請</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>
    </div>
  )
}

import { useState } from 'react'
import { App, Form, Input, Modal, Tooltip } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import {
  Cols,
  FilterButton,
  MultiSortButton,
  Pager,
  sortParam,
  useMultiSort,
  type SortEntry,
} from '../../components/ui/tableControls'
import { useOpenViolationTotal } from '../../api/adminActivities'
import {
  ALL_VIOLATION_STATUSES,
  DEADLINE_LABELS,
  VIOLATION_STATUS_LABEL,
  useAdminViolations,
  useResolveViolation,
  useViolationOptions,
  violationFilterParams,
  type AdminViolation,
} from '../../api/adminViolations'

const PAGE_SIZE = 50

// 排序鍵=後端 /admin/violations 白名單(社團欄不在白名單,不開排序)
type SortKey = 'date' | 'location' | 'items' | 'filler' | 'deadline' | 'status'

const STATUS_LABELS = ALL_VIOLATION_STATUSES.map((s) => VIOLATION_STATUS_LABEL[s])

// 預設排序:未銷案在最上,各組內照發生日順序(銷案期限最近的先;= 後端 status,date 升冪)
const DEFAULT_SORT: SortEntry<SortKey>[] = [
  { key: 'status', dir: 1 },
  { key: 'date', dir: 1 },
]

export default function AdminViolationsPage() {
  const { message } = App.useApp()
  const [resolving, setResolving] = useState<AdminViolation | null>(null)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [form] = Form.useForm()
  const { entries, toggle } = useMultiSort<SortKey>(DEFAULT_SORT)
  const [itemFilter, setItemFilter] = useState<string[]>([])
  const [fillerFilter, setFillerFilter] = useState<string[]>([])
  const [deadlineFilter, setDeadlineFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [page, setPage] = useState(1)

  // 篩選選項取自實際紀錄(不是這一頁的列):承辦不必先翻到某頁才篩得到
  const optionsQuery = useViolationOptions()
  const fillerOptions = optionsQuery.data?.fillers ?? []
  const itemOptions = optionsQuery.data?.items ?? []

  const { statuses, expired, fillerIds } = violationFilterParams({
    statusLabels: statusFilter,
    deadlineLabels: deadlineFilter,
    fillerNames: fillerFilter,
    fillers: fillerOptions,
  })

  // 狀態交集為空=使用者選了不可能同時成立的條件,沒有列可回,也就不必打 API
  const enabled = statuses.length > 0
  const listQuery = useAdminViolations(
    {
      items: itemFilter.length ? itemFilter : undefined,
      fillerIds,
      statuses,
      expired,
      sort: sortParam(entries),
      page,
      pageSize: PAGE_SIZE,
    },
    { enabled },
  )
  // 未啟用的查詢恆為 isPending,不能直接當 loading 旗標
  const loading = enabled && listQuery.isPending
  const rows = enabled ? (listQuery.data?.rows ?? []) : []
  const total = enabled ? (listQuery.data?.total ?? 0) : 0
  const openTotal = useOpenViolationTotal()

  const resolve = useResolveViolation()

  const withPageReset =
    <T,>(set: (next: T) => void) =>
    (next: T) => {
      set(next)
      setPage(1)
    }
  const toggleSort = (key: SortKey) => {
    toggle(key)
    setPage(1) // 伺服器端分頁:換排序回到第 1 頁
  }

  const askResolve = (v: AdminViolation) => {
    setResolving(v)
    setResolveOpen(true)
  }

  const onResolve = (values: { note: string }) => {
    if (!resolving) return
    resolve.mutate(
      { id: resolving.id, note: values.note },
      {
        onSuccess: () => {
          message.success(`已銷案 ${resolving.club} ${resolving.date} 的違規紀錄`)
          setResolveOpen(false)
          form.resetFields()
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  const filtered = Boolean(
    itemFilter.length || fillerFilter.length || deadlineFilter.length || statusFilter.length,
  )

  return (
    <div>
      <PageHeader
        title="違規管理"
        sub={
          <>
            未銷案 <span className="num">{openTotal.data ?? '—'}</span> 筆
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <LoadingBlock pending={loading}>
          <table className="tb dense fixed" aria-label="違規勸導紀錄" style={{ minWidth: 760 }}>
            {/* 社團/地點截斷、項目吃剩餘寬且允許換行;日期/填寫/期限/狀態/動作固定 px */}
            <Cols widths={['13%', 96, '11%', 'auto', 88, 132, 90, 84]} />
            <thead>
              <tr>
                <th scope="col">社團</th>
                <th scope="col"><MultiSortButton label="日期" sortKey="date" entries={entries} onToggle={toggleSort} /></th>
                <th scope="col"><MultiSortButton label="地點" sortKey="location" entries={entries} onToggle={toggleSort} /></th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <MultiSortButton label="項目" sortKey="items" entries={entries} onToggle={toggleSort} />
                    <FilterButton options={itemOptions} selected={itemFilter} onChange={withPageReset(setItemFilter)} label="篩選項目" />
                  </span>
                </th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <MultiSortButton label="填寫" sortKey="filler" entries={entries} onToggle={toggleSort} />
                    <FilterButton options={fillerOptions.map((f) => f.name)} selected={fillerFilter} onChange={withPageReset(setFillerFilter)} label="篩選填寫人" />
                  </span>
                </th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <MultiSortButton label="銷案期限" sortKey="deadline" entries={entries} onToggle={toggleSort} />
                    <FilterButton options={DEADLINE_LABELS} selected={deadlineFilter} onChange={withPageReset(setDeadlineFilter)} label="篩選期限" />
                  </span>
                </th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <MultiSortButton label="狀態" sortKey="status" entries={entries} onToggle={toggleSort} />
                    <FilterButton options={STATUS_LABELS} selected={statusFilter} onChange={withPageReset(setStatusFilter)} label="篩選狀態" />
                  </span>
                </th>
                <th scope="col" className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="cell-clip" title={v.club}>{v.club}</td>
                  <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                  <td className="cell-clip" title={v.location}>{v.location}</td>
                  <td style={{ fontSize: 13 }}>
                    <div>{v.items.join('、')}</div>
                    {v.other && <div style={{ fontSize: 12, color: 'var(--steel)' }}>{v.other}</div>}
                    {v.resolveNote && <div style={{ fontSize: 12, color: 'var(--steel)' }}>銷案:{v.resolveNote}</div>}
                  </td>
                  <td className="cell-clip" title={v.filler} style={{ fontSize: 13, color: 'var(--steel)' }}>{v.filler}</td>
                  <td className="num" style={{ fontSize: 13, color: v.expired ? '#C13B34' : undefined }}>
                    {v.status === 'violation_resolved' ? '—' : v.expired ? `${v.deadline} 已截止` : v.deadline}
                  </td>
                  <td><StatusPill status={v.status} /></td>
                  <td className="r">
                    {v.status === 'violation_open' &&
                      (v.expired ? (
                        <Tooltip title="已逾 1 個月銷案期限,不再受理銷案">
                          <span style={{ fontSize: 13, color: 'var(--steel)' }}>已截止</span>
                        </Tooltip>
                      ) : (
                        <button type="button" className="link-btn primary" onClick={() => askResolve(v)}>
                          銷案…
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
              {/* 選項失敗也要說出來:漏斗會靜靜地變成空選單,看起來像「沒有任何項目」 */}
              {(listQuery.isError || optionsQuery.isError) && (
                <tr className="no-hover">
                  <td colSpan={8}>
                    <QueryError
                      compact
                      title={listQuery.isError ? '違規勸導紀錄載入失敗' : '篩選選項載入失敗'}
                      error={listQuery.error ?? optionsQuery.error}
                      onRetry={() => {
                        if (listQuery.isError) void listQuery.refetch()
                        if (optionsQuery.isError) void optionsQuery.refetch()
                      }}
                    />
                  </td>
                </tr>
              )}
              {!loading && !listQuery.isError && !optionsQuery.isError && rows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                    {filtered ? '沒有符合篩選條件的紀錄' : '目前沒有違規勸導紀錄'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
          <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </div>

      <Modal
        open={resolveOpen}
        afterClose={() => {
          setResolving(null)
          form.resetFields()
        }}
        title="銷案"
        okText="確認銷案"
        confirmLoading={resolve.isPending}
        destroyOnHidden
        onOk={() => form.submit()}
        onCancel={() => setResolveOpen(false)}
      >
        <Form form={form} layout="vertical" onFinish={onResolve}>
          <Form.Item name="note" label="銷案說明" rules={[{ required: true, message: '簡述原因' }]}>
            <Input.TextArea rows={2} placeholder="已完成愛校服務 2 小時" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

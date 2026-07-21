import { useMemo, useState } from 'react'
import { App, Form, Input, Modal, Spin, Tooltip } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import {
  FilterButton,
  MultiSortButton,
  sortRows,
  useMultiSort,
  type SortEntry,
} from '../../components/ui/tableControls'
import { useAdminViolations, useResolveViolation, type AdminViolation } from '../../api/adminViolations'

type SortKey = 'date' | 'location' | 'items' | 'filler' | 'deadline' | 'status'

const statusLabel = (v: AdminViolation): string => (v.status === 'violation_open' ? '未銷案' : '已銷案')
const deadlineLabel = (v: AdminViolation): string =>
  v.status === 'violation_resolved' ? '—' : v.expired ? '已截止' : '未逾期'

// 各鍵一律寫升冪比較器,方向由 sortRows 依排序鏈翻轉;
// status 升冪=未銷案在前(業務語意,非標籤字典序);deadline 已銷案(無期限)視為最小值
const CMPS: Record<SortKey, (a: AdminViolation, b: AdminViolation) => number> = {
  date: (a, b) => a.date.localeCompare(b.date),
  location: (a, b) => a.location.localeCompare(b.location, 'zh-Hant'),
  items: (a, b) => a.items.join('、').localeCompare(b.items.join('、'), 'zh-Hant'),
  filler: (a, b) => a.filler.localeCompare(b.filler, 'zh-Hant'),
  deadline: (a, b) =>
    (a.status === 'violation_resolved' ? '' : a.deadline).localeCompare(
      b.status === 'violation_resolved' ? '' : b.deadline,
    ),
  status: (a, b) =>
    (a.status === 'violation_open' ? 0 : 1) - (b.status === 'violation_open' ? 0 : 1),
}

// 預設排序:未銷案在最上,各組內照發生日順序(銷案期限最近的先;與後端預設一致)
const DEFAULT_SORT: SortEntry<SortKey>[] = [
  { key: 'status', dir: 1 },
  { key: 'date', dir: 1 },
]

export default function AdminViolationsPage() {
  const { message } = App.useApp()
  const [resolving, setResolving] = useState<AdminViolation | null>(null)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [form] = Form.useForm()
  const { entries, stack, toggle } = useMultiSort<SortKey>(DEFAULT_SORT)
  const [itemFilter, setItemFilter] = useState<string[]>([])
  const [fillerFilter, setFillerFilter] = useState<string[]>([])
  const [deadlineFilter, setDeadlineFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])

  // 後端排序/篩選為單值參數,與多選漏斗不合:抓全量後沿用前端排序/篩選(見 api/adminViolations)
  const listQuery = useAdminViolations()
  const violations = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const resolve = useResolveViolation()

  const fillerOptions = [...new Set(violations.map((v) => v.filler))]
  const itemOptions = [...new Set(violations.flatMap((v) => v.items))]

  const rows = useMemo(() => {
    let list = violations
    if (itemFilter.length) list = list.filter((v) => v.items.some((i) => itemFilter.includes(i)))
    if (fillerFilter.length) list = list.filter((v) => fillerFilter.includes(v.filler))
    if (deadlineFilter.length) list = list.filter((v) => deadlineFilter.includes(deadlineLabel(v)))
    if (statusFilter.length) list = list.filter((v) => statusFilter.includes(statusLabel(v)))
    return sortRows(list, entries, CMPS)
  }, [violations, entries, itemFilter, fillerFilter, deadlineFilter, statusFilter])

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

  return (
    <div>
      <PageHeader
        title="違規管理"
        sub={
          <>
            未銷案 <span className="num">{violations.filter((v) => v.status === 'violation_open').length}</span> 筆
          </>
        }
      />

      <Spin spinning={listQuery.isPending}>
        <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
          <table className="tb dense" aria-label="違規勸導紀錄" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>社團</th>
                <th><MultiSortButton label="日期" sortKey="date" stack={stack} onToggle={toggle} /></th>
                <th><MultiSortButton label="地點" sortKey="location" stack={stack} onToggle={toggle} /></th>
                <th>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <MultiSortButton label="項目" sortKey="items" stack={stack} onToggle={toggle} />
                    <FilterButton options={itemOptions} selected={itemFilter} onChange={setItemFilter} label="篩選項目" />
                  </span>
                </th>
                <th>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <MultiSortButton label="填寫" sortKey="filler" stack={stack} onToggle={toggle} />
                    <FilterButton options={fillerOptions} selected={fillerFilter} onChange={setFillerFilter} label="篩選填寫人" />
                  </span>
                </th>
                <th>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <MultiSortButton label="銷案期限" sortKey="deadline" stack={stack} onToggle={toggle} />
                    <FilterButton options={['未逾期', '已截止']} selected={deadlineFilter} onChange={setDeadlineFilter} label="篩選期限" />
                  </span>
                </th>
                <th>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <MultiSortButton label="狀態" sortKey="status" stack={stack} onToggle={toggle} />
                    <FilterButton options={['未銷案', '已銷案']} selected={statusFilter} onChange={setStatusFilter} label="篩選狀態" />
                  </span>
                </th>
                <th className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td>{v.club}</td>
                  <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                  <td>{v.location}</td>
                  <td style={{ fontSize: 13 }}>
                    <div>{v.items.join('、')}</div>
                    {v.other && <div style={{ fontSize: 12, color: 'var(--steel)' }}>{v.other}</div>}
                    {v.resolveNote && <div style={{ fontSize: 12, color: 'var(--steel)' }}>銷案:{v.resolveNote}</div>}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>{v.filler}</td>
                  <td className="num" style={{ fontSize: 13, color: v.expired ? '#B03A2E' : undefined }}>
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
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={8}>
                    <QueryError
                      compact
                      title="違規勸導紀錄載入失敗"
                      error={listQuery.error}
                      onRetry={() => listQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && rows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有違規勸導紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>

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

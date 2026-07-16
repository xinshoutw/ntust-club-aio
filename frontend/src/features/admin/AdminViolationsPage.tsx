import { useMemo, useState } from 'react'
import { App, Form, Input, Modal, Spin, Tooltip } from 'antd'
import dayjs from 'dayjs'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { FilterButton, SortButton, useSort } from '../../components/ui/tableControls'
import { useAdminViolations, useResolveViolation, type AdminViolation } from '../../api/adminViolations'

type SortKey = 'date' | 'location' | 'items' | 'filler' | 'deadline' | 'status'

const statusLabel = (v: AdminViolation): string => (v.status === 'violation_open' ? '未銷案' : '已銷案')
const deadlineLabel = (v: AdminViolation): string =>
  v.status === 'violation_resolved' ? '—' : v.expired ? '已截止' : '未逾期'

function sortValue(v: AdminViolation, key: SortKey): string {
  if (key === 'items') return v.items.join('、')
  if (key === 'deadline') return v.status === 'violation_resolved' ? '' : v.deadline
  if (key === 'status') return statusLabel(v)
  return v[key]
}

export default function AdminViolationsPage() {
  const { message } = App.useApp()
  const [resolving, setResolving] = useState<AdminViolation | null>(null)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [form] = Form.useForm()
  const { sort, toggle } = useSort<SortKey>()
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
    if (sort) {
      return [...list].sort(
        (a, b) => sort.dir * String(sortValue(a, sort.key)).localeCompare(String(sortValue(b, sort.key)), 'zh-Hant'),
      )
    }
    // 預設排序:未銷案在最上,各組內照時間順序(與後端預設一致)
    return [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'violation_open' ? -1 : 1
      return dayjs(a.date, 'YYYY/MM/DD').valueOf() - dayjs(b.date, 'YYYY/MM/DD').valueOf()
    })
  }, [violations, sort, itemFilter, fillerFilter, deadlineFilter, statusFilter])

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
          <table className="tb dense" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>社團</th>
                <th><SortButton label="日期" sortKey="date" sort={sort} onToggle={toggle} /></th>
                <th><SortButton label="地點" sortKey="location" sort={sort} onToggle={toggle} /></th>
                <th>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <SortButton label="項目" sortKey="items" sort={sort} onToggle={toggle} />
                    <FilterButton options={itemOptions} selected={itemFilter} onChange={setItemFilter} label="篩選項目" />
                  </span>
                </th>
                <th>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <SortButton label="填寫" sortKey="filler" sort={sort} onToggle={toggle} />
                    <FilterButton options={fillerOptions} selected={fillerFilter} onChange={setFillerFilter} label="篩選填寫人" />
                  </span>
                </th>
                <th>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <SortButton label="銷案期限" sortKey="deadline" sort={sort} onToggle={toggle} />
                    <FilterButton options={['未逾期', '已截止']} selected={deadlineFilter} onChange={setDeadlineFilter} label="篩選期限" />
                  </span>
                </th>
                <th>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <SortButton label="狀態" sortKey="status" sort={sort} onToggle={toggle} />
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
                          <span style={{ fontSize: 13, color: 'var(--muted)' }}>已截止</span>
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

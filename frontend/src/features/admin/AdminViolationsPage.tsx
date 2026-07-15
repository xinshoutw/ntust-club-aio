import { useMemo, useState } from 'react'
import { App, Form, Input, Modal, Tooltip } from 'antd'
import dayjs from 'dayjs'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { FilterButton, SortButton, useSort } from '../../components/ui/tableControls'
import { VIOLATIONS, VIOL_ITEMS, resolveDeadline, resolveExpired, type Violation } from '../violations/mock'

type SortKey = 'date' | 'location' | 'items' | 'filler' | 'deadline' | 'status'

const statusLabel = (v: Violation): string => (v.status === 'violation_open' ? '未銷案' : '已銷案')
const deadlineLabel = (v: Violation): string =>
  v.status === 'violation_resolved' ? '—' : resolveExpired(v) ? '已截止' : '未逾期'

function sortValue(v: Violation, key: SortKey): string {
  if (key === 'items') return v.items.join('、')
  if (key === 'deadline') return v.status === 'violation_resolved' ? '' : resolveDeadline(v)
  if (key === 'status') return statusLabel(v)
  return v[key]
}

export default function AdminViolationsPage() {
  const { message } = App.useApp()
  const [resolving, setResolving] = useState<Violation | null>(null)
  const [form] = Form.useForm()
  const { sort, toggle } = useSort<SortKey>()
  const [itemFilter, setItemFilter] = useState<string[]>([])
  const [fillerFilter, setFillerFilter] = useState<string[]>([])
  const [deadlineFilter, setDeadlineFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])

  const fillerOptions = [...new Set(VIOLATIONS.map((v) => v.filler))]

  const rows = useMemo(() => {
    let list = VIOLATIONS
    if (itemFilter.length) list = list.filter((v) => v.items.some((i) => itemFilter.includes(i)))
    if (fillerFilter.length) list = list.filter((v) => fillerFilter.includes(v.filler))
    if (deadlineFilter.length) list = list.filter((v) => deadlineFilter.includes(deadlineLabel(v)))
    if (statusFilter.length) list = list.filter((v) => statusFilter.includes(statusLabel(v)))
    if (sort) {
      return [...list].sort(
        (a, b) => sort.dir * String(sortValue(a, sort.key)).localeCompare(String(sortValue(b, sort.key)), 'zh-Hant'),
      )
    }
    // 預設排序:未銷案在最上,各組內照時間順序
    return [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'violation_open' ? -1 : 1
      return dayjs(a.date, 'YYYY/MM/DD').valueOf() - dayjs(b.date, 'YYYY/MM/DD').valueOf()
    })
  }, [sort, itemFilter, fillerFilter, deadlineFilter, statusFilter])

  return (
    <div>
      <PageHeader
        title="違規管理"
        sub={
          <>
            未銷案 <span className="num">{VIOLATIONS.filter((v) => v.status === 'violation_open').length}</span> 筆
          </>
        }
      />

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
                  <FilterButton options={VIOL_ITEMS} selected={itemFilter} onChange={setItemFilter} label="篩選項目" />
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
            {rows.map((v) => {
              const expired = resolveExpired(v)
              return (
                <tr key={v.id}>
                  <td>{v.club}</td>
                  <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                  <td>{v.location}</td>
                  <td style={{ fontSize: 13 }}>
                    <div>{v.items.join('、')}</div>
                    {v.note && <div style={{ fontSize: 12, color: 'var(--steel)' }}>{v.note}</div>}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>{v.filler}</td>
                  <td className="num" style={{ fontSize: 13, color: expired ? '#B03A2E' : undefined }}>
                    {v.status === 'violation_resolved' ? '—' : expired ? `${resolveDeadline(v)} 已截止` : resolveDeadline(v)}
                  </td>
                  <td><StatusPill status={v.status} /></td>
                  <td className="r">
                    {v.status === 'violation_open' &&
                      (expired ? (
                        <Tooltip title="已逾 1 個月銷案期限,不再受理銷案">
                          <span style={{ fontSize: 13, color: 'var(--muted)' }}>已截止</span>
                        </Tooltip>
                      ) : (
                        <button type="button" className="link-btn primary" onClick={() => setResolving(v)}>
                          銷案…
                        </button>
                      ))}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr className="no-hover">
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有違規勸導紀錄</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!resolving}
        title="銷案"
        okText="確認銷案"
        destroyOnHidden
        onOk={() => form.submit()}
        onCancel={() => {
          setResolving(null)
          form.resetFields()
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values: { note: string }) => {
            message.success(`已銷案 ${resolving?.club} ${resolving?.date} 的違規紀錄:${values.note}`)
            setResolving(null)
            form.resetFields()
          }}
        >
          <Form.Item name="note" label="銷案說明" rules={[{ required: true, message: '簡述原因' }]}>
            <Input.TextArea rows={2} placeholder="已完成愛校服務 2 小時" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

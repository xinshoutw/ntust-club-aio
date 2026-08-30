import { useState } from 'react'
import { Button, DatePicker, message } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { DownloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols, FilterButton, Pager } from '../../components/ui/tableControls'
import { downloadCsv } from '../../lib/csv'
import {
  ROLE_OPTIONS,
  actionKeyOf,
  fetchAllAuditLogs,
  roleKeyOf,
  useAuditLogs,
  useAuditOptions,
} from '../../api/adminAudit'

const PAGE_SIZE = 20

// 後端篩選為單值參數(user_id/role/action):漏斗為單選,點另一項即切換、再點取消
const pickSingle = (prev: string | null, next: string[]): string | null => {
  if (next.length === 0) return null
  return next.find((k) => k !== prev) ?? prev
}

export default function AuditPage() {
  const [whoFilter, setWhoFilter] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState<string | null>(null)
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const options = useAuditOptions()
  const operators = options.data?.operators ?? new Map<string, number>()

  const filters = {
    // 選了操作者但對照表未就緒/名稱失效 → 強制空集,不可 fail-open 回全部操作者的紀錄
    // (漏斗是紅的、選單還顯示著勾選,看起來就是在看某一人的紀錄)
    userId: whoFilter ? operators.get(whoFilter) ?? -1 : undefined,
    role: roleFilter ? roleKeyOf(roleFilter) : undefined,
    action: actionFilter ? actionKeyOf(actionFilter) : undefined,
    dateFrom: range?.[0].format('YYYY-MM-DD'),
    dateTo: range?.[1].format('YYYY-MM-DD'),
  }
  const listQuery = useAuditLogs({ ...filters, page, pageSize: PAGE_SIZE })
  const logs = listQuery.data?.logs ?? []
  const total = listQuery.data?.total ?? 0

  const whoOptions = [...operators.keys()]

  const setFilter = (setter: (next: string | null) => void, current: string | null) => (next: string[]) => {
    setter(pickSingle(current, next))
    setPage(1)
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      const rows = await fetchAllAuditLogs(filters)
      if (!rows.length) {
        message.error('沒有符合篩選條件的紀錄可匯出')
        return
      }
      // 表格排不下 IP,但事後追查最需要它
      downloadCsv(`稽核紀錄_${dayjs().format('YYYYMMDD')}.csv`, [
        ['時間', '操作者', '角色', '動作', '內容', '來源 IP'],
        ...rows.map((l) => [l.time, l.who, l.roleLabel, l.actionLabel, l.detail, l.ip ?? '']),
      ])
      message.success(`已匯出 ${rows.length} 筆`)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '匯出失敗')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="稽核紀錄"
        extra={
          <>
            <DatePicker.RangePicker
              value={range}
              onChange={(v) => {
                setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)
                setPage(1)
              }}
              format="YYYY/MM/DD"
              allowClear
            />
            <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportCsv()}>
              匯出 CSV
            </Button>
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <LoadingBlock pending={listQuery.isPending}>
          <table className="tb dense fixed" style={{ minWidth: 760 }}>
            {/* 操作者截斷、內容吃剩餘寬且允許換行;時間/角色/動作固定 px */}
            <Cols widths={[140, '13%', 90, 130, 'auto']} />
            <thead>
              <tr>
                <th scope="col">時間</th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    操作者
                    <FilterButton
                      options={whoOptions}
                      selected={whoFilter ? [whoFilter] : []}
                      onChange={setFilter(setWhoFilter, whoFilter)}
                      label="篩選操作者"
                    />
                  </span>
                </th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    角色
                    <FilterButton
                      options={ROLE_OPTIONS}
                      selected={roleFilter ? [roleFilter] : []}
                      onChange={setFilter(setRoleFilter, roleFilter)}
                      label="篩選角色"
                    />
                  </span>
                </th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    動作
                    <FilterButton
                      options={options.data?.actionLabels ?? []}
                      selected={actionFilter ? [actionFilter] : []}
                      onChange={setFilter(setActionFilter, actionFilter)}
                      label="篩選動作"
                    />
                  </span>
                </th>
                <th scope="col">內容</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="num" style={{ fontSize: 13, color: 'var(--steel)', whiteSpace: 'nowrap' }}>{l.time}</td>
                  <td className="cell-clip" title={l.who} style={{ fontWeight: 500 }}>{l.who}</td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>{l.roleLabel}</td>
                  <td>{l.actionLabel}</td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>{l.detail}</td>
                </tr>
              ))}
              {options.isError && (
                <tr className="no-hover">
                  <td colSpan={5}>
                    {/* 選項掛掉時漏斗只會是空的,不講就等於默默少了兩個篩選 */}
                    <QueryError
                      compact
                      title="篩選選項載入失敗"
                      error={options.error}
                      onRetry={() => options.refetch()}
                    />
                  </td>
                </tr>
              )}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={5}>
                    <QueryError compact title="稽核紀錄載入失敗" error={listQuery.error} onRetry={() => listQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && logs.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                    {/* 沒下篩選時新庫或窄區間本來就可能一筆都沒有,別說成「不符篩選條件」 */}
                    {whoFilter || roleFilter || actionFilter || range
                      ? '無符合篩選條件的紀錄'
                      : '無稽核紀錄'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
          <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </div>
    </div>
  )
}

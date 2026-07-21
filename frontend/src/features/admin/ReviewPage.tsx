import { useMemo, useState } from 'react'
import { Button, Spin } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import LargeBadge from '../../components/ui/LargeBadge'
import { FilterButton, Pager, SortButton, useSort } from '../../components/ui/tableControls'
import { STATUS } from '../../lib/status'
import { useAuth } from '../../app/auth'
import { fmtMoney } from '../activities/types'
import {
  canActOn,
  useAdminActivities,
  useAdminActivitiesPaged,
  useAdminActivityDetail,
  useAdminActivityMutations,
  type AdminActivity,
  type AdminActivityStatus,
} from '../../api/adminActivities'
import { useClubOptions } from '../../api/adminClubs'
import ActivityReviewModal from './ActivityReviewModal'

const PAGE_SIZE = 20
const ALL_STATUSES: AdminActivityStatus[] = [
  'pending_advisor',
  'pending_chief',
  'pending_dean',
  'approved',
  'rejected',
  'closing_pending_advisor',
  'closed',
]

// 類型篩選由後端推導(「大型活動」=類型活動且已認可或申請中未被否准);
// 排序亦為伺服器端白名單(type 排序以原始類型為準,大型不獨立成一級)
const TYPE_OPTIONS = ['社課或會議', '活動', '大型活動']

type SortKey = 'club' | 'name' | 'type' | 'date' | 'status' | 'reviewed_at'

export default function ReviewPage() {
  const { user } = useAuth()
  const [current, setCurrent] = useState<AdminActivity | null>(null)
  const [open, setOpen] = useState(false)
  const { sort, toggle } = useSort<SortKey>()
  const toggleSort = (k: SortKey) => {
    toggle(k)
    setPage(1) // 伺服器端分頁:換排序回到第 1 頁
  }
  const [clubFilter, setClubFilter] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [page, setPage] = useState(1)

  // 待審佇列:僅撈登入者可簽核的狀態(小結果集);最近審核表改伺服器端分頁,
  // 不再整批撈取 14k+ 筆(2026-07-21 需求方:SQL 存取必須分批)
  const queueStatuses = useMemo(
    () => ALL_STATUSES.filter((st) => canActOn(user, st)),
    [user],
  )
  const queueQuery = useAdminActivities(
    { statuses: queueStatuses },
    { enabled: queueStatuses.length > 0 },
  )
  const queue = useMemo(
    () =>
      [...(queueQuery.data ?? [])].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)),
    [queueQuery.data],
  )

  // 篩選:社團名 → id(選項自最小社團主檔);狀態標籤 → 狀態值(待審三關同標籤合併)
  const othersStatuses = useMemo(
    () => ALL_STATUSES.filter((st) => !canActOn(user, st)),
    [user],
  )
  const clubsQuery = useClubOptions()
  const clubOptions = (clubsQuery.data ?? []).map((c) => c.name)
  const statusOptions = [...new Set(othersStatuses.map((st) => STATUS[st].label))]

  const clubIdMatches = clubFilter.length
    ? (clubsQuery.data ?? []).filter((c) => clubFilter.includes(c.name)).map((c) => c.id)
    : undefined
  // 有選社團但主檔未載入/名稱失效 → 強制空集,不可 fail-open 回全部
  const clubIds = clubIdMatches && clubIdMatches.length === 0 ? [-1] : clubIdMatches
  const statuses = statusFilter.length
    ? othersStatuses.filter((st) => statusFilter.includes(STATUS[st].label))
    : othersStatuses
  const listQuery = useAdminActivitiesPaged({
    statuses,
    clubIds,
    types: typeFilter.length ? typeFilter : undefined,
    // 預設審核時間新→舊(明確帶 sort;無審核紀錄者殿後);點欄位排序即覆蓋,清除排序回到預設
    sort: sort ? `${sort.dir === -1 ? '-' : ''}${sort.key}` : '-reviewed_at',
    page,
    pageSize: PAGE_SIZE,
  })
  const pagedRows = listQuery.data?.rows ?? []
  const total = listQuery.data?.total ?? 0

  // 點列即抓詳情(經費/附件),載入完成後彈窗自動補齊
  const detailQuery = useAdminActivityDetail(current?.activityId)
  const { approve, reject } = useAdminActivityMutations()

  const openItem = (item: AdminActivity) => {
    setCurrent(item)
    setOpen(true)
  }

  const resetPage = () => setPage(1)

  return (
    <div>
      <PageHeader
        title="申請審核"
        sub={
          <>
            待本關 <span className="num">{queue.length}</span> 件
          </>
        }
      />

      <Spin spinning={queueQuery.isLoading || listQuery.isPending}>
        {/* 待審佇列:本關可簽核的單據,送件早的在前 */}
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 6px' }}>待審佇列</div>
          {queue.map((item) => (
            <div
              key={item.id}
              className="click-tint"
              role="button"
              tabIndex={0}
              onClick={() => openItem(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openItem(item)
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '13px 20px',
                borderTop: '1px solid var(--line)',
                cursor: 'pointer',
                flexWrap: 'wrap',
                ...(current?.id === item.id && open ? { background: 'var(--seal-tint)' } : {}),
              }}
            >
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</span>
                  <LargeBadge applied={item.isLarge} approved={item.largeApproved} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>
                  {item.club} · {item.type} · 送件 <span className="num">{item.submittedAt}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>活動日期</div>
                <div className="num" style={{ fontSize: 13, marginTop: 2 }}>{item.date}</div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 84 }}>
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>擬請補助</div>
                <div className="num" style={{ fontSize: 13, marginTop: 2 }}>{fmtMoney(item.requested)}</div>
              </div>
              <Button
                type="primary"
                size="small"
                style={{ height: 30 }}
                onClick={(e) => {
                  e.stopPropagation()
                  openItem(item)
                }}
              >
                審核
              </Button>
            </div>
          ))}
          {queue.length === 0 && (
            <div style={{ padding: '20px 20px 24px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--steel)' }}>
              {queueQuery.isError ? `載入失敗:${queueQuery.error.message}` : '沒有待本關簽核的申請'}
            </div>
          )}
        </div>

        {/* 最近審核(他關審核中/已核准/已退回):供查閱與追蹤,預設審核時間新→舊 */}
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近審核</div>
          <table className="tb dense" style={{ minWidth: 880 }} aria-label="最近審核的活動申請">
            <thead>
              <tr>
                <th>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <SortButton label="社團" sortKey="club" sort={sort} onToggle={toggleSort} />
                    <FilterButton
                      options={clubOptions}
                      selected={clubFilter}
                      onChange={(next) => {
                        setClubFilter(next)
                        resetPage()
                      }}
                      label="篩選社團"
                    />
                  </span>
                </th>
                <th><SortButton label="活動名稱" sortKey="name" sort={sort} onToggle={toggleSort} /></th>
                <th>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <SortButton label="類型" sortKey="type" sort={sort} onToggle={toggleSort} />
                    <FilterButton
                      options={TYPE_OPTIONS}
                      selected={typeFilter}
                      onChange={(next) => {
                        setTypeFilter(next)
                        resetPage()
                      }}
                      label="篩選類型"
                    />
                  </span>
                </th>
                <th><SortButton label="活動日期" sortKey="date" sort={sort} onToggle={toggleSort} /></th>
                <th className="r">擬請補助</th>
                <th>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <SortButton label="狀態" sortKey="status" sort={sort} onToggle={toggleSort} />
                    <FilterButton
                      options={statusOptions}
                      selected={statusFilter}
                      onChange={(next) => {
                        setStatusFilter(next)
                        resetPage()
                      }}
                      label="篩選狀態"
                    />
                  </span>
                </th>
                <th><SortButton label="審核時間" sortKey="reviewed_at" sort={sort} onToggle={toggleSort} /></th>
                <th aria-label="開啟" style={{ width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => openItem(item)}
                  style={{ cursor: 'pointer', ...(current?.id === item.id && open ? { background: 'var(--seal-tint)' } : {}) }}
                >
                  <td>{item.club}</td>
                  <td style={{ fontWeight: 500 }}>
                    <button
                      type="button"
                      className="row-open-btn"
                      aria-label={`開啟「${item.name || '未命名活動'}」詳情`}
                      onClick={(e) => {
                        e.stopPropagation()
                        openItem(item)
                      }}
                    >
                      {item.name}
                    </button>
                  </td>
                  <td>
                    {item.type}
                    <LargeBadge applied={item.isLarge} approved={item.largeApproved} />
                  </td>
                  <td className="num">{item.date}</td>
                  <td className="r num">{fmtMoney(item.requested)}</td>
                  <td><StatusPill status={item.status} /></td>
                  <td className="num">{item.reviewedAt ?? '—'}</td>
                  <td className="r"><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
                </tr>
              ))}
              {!listQuery.isPending && pagedRows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>無符合篩選條件的申請</td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </div>
      </Spin>

      {/* Modal 常駐待關閉動畫結束(afterClose)才卸載;key 依單據重掛,核定金額與退回原因不殘留;
          詳情載入完成後以完整資料(經費/附件/經費來源)替換列表列 */}
      {current && (
        <ActivityReviewModal
          key={current.id}
          item={detailQuery.data ?? current}
          open={open}
          onClose={() => setOpen(false)}
          afterClose={() => setCurrent(null)}
          onApprove={(p) =>
            approve.mutateAsync({
              id: current.activityId,
              // 僅第一關送核定內容;組長/學務長關空 body 過關(後端規則)
              fundSource: current.status === 'pending_advisor' ? p.fundSource : undefined,
              budget: current.status === 'pending_advisor' ? p.budget : [],
              isLargeApproved:
                current.status === 'pending_advisor' && current.type === '活動' ? p.largeApproved : undefined,
            })
          }
          onReject={(reason) => reject.mutateAsync({ id: current.activityId, reason })}
        />
      )}
    </div>
  )
}

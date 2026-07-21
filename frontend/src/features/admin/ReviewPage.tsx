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
  useAdminActivityDetail,
  useAdminActivityMutations,
  type AdminActivity,
} from '../../api/adminActivities'
import ActivityReviewModal from './ActivityReviewModal'

const PAGE_SIZE = 20

// 類型的篩選/排序值:有「大」標記者(申請中或已認可)視為大型活動;
// 申請被否准(largeApproved===false)以一般活動計 — 解讀待需求方確認
const typeKey = (item: AdminActivity): string =>
  item.type === '活動' && (item.largeApproved === true || (item.isLarge && item.largeApproved !== false))
    ? '大型活動'
    : item.type
const TYPE_OPTIONS = ['社課或會議', '活動', '大型活動']

type SortKey = 'club' | 'name' | 'type' | 'date' | 'status'

function sortValue(item: AdminActivity, key: SortKey): string {
  if (key === 'type') return typeKey(item)
  if (key === 'status') return STATUS[item.status].label
  return item[key]
}

export default function ReviewPage() {
  const { user } = useAuth()
  const [current, setCurrent] = useState<AdminActivity | null>(null)
  const [open, setOpen] = useState(false)
  const { sort, toggle } = useSort<SortKey>()
  const [clubFilter, setClubFilter] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [page, setPage] = useState(1)

  const listQuery = useAdminActivities()
  const items = useMemo(() => listQuery.data ?? [], [listQuery.data])
  // 點列即抓詳情(經費/附件),載入完成後彈窗自動補齊
  const detailQuery = useAdminActivityDetail(current?.activityId)
  const { approve, reject } = useAdminActivityMutations()

  const openItem = (item: AdminActivity) => {
    setCurrent(item)
    setOpen(true)
  }

  // 待本關簽核的佇列:依登入者簽核鍵(approve_advisor/chief/dean)推導,送件早的在前
  const queue = useMemo(
    () =>
      items
        .filter((i) => canActOn(user, i.status))
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)),
    [items, user],
  )
  const others = useMemo(() => items.filter((i) => !canActOn(user, i.status)), [items, user])

  const clubOptions = [...new Set(others.map((i) => i.club))]
  const statusOptions = [...new Set(others.map((i) => STATUS[i.status].label))]

  const rows = useMemo(() => {
    let list = others
    if (clubFilter.length) list = list.filter((i) => clubFilter.includes(i.club))
    if (typeFilter.length) list = list.filter((i) => typeFilter.includes(typeKey(i)))
    if (statusFilter.length) list = list.filter((i) => statusFilter.includes(STATUS[i.status].label))
    if (sort) {
      list = [...list].sort(
        (a, b) => sort.dir * String(sortValue(a, sort.key)).localeCompare(String(sortValue(b, sort.key)), 'zh-Hant'),
      )
    }
    return list
  }, [others, clubFilter, typeFilter, statusFilter, sort])
  const pagedRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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

      <Spin spinning={listQuery.isPending}>
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
              {listQuery.isError ? `載入失敗:${listQuery.error.message}` : '沒有待本關簽核的申請'}
            </div>
          )}
        </div>

        {/* 其他狀態(他關審核中/已核准/已退回):供查閱與追蹤 */}
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>其他狀態</div>
          <table className="tb dense" style={{ minWidth: 800 }} aria-label="其他狀態的活動申請">
            <thead>
              <tr>
                <th>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <SortButton label="社團" sortKey="club" sort={sort} onToggle={toggle} />
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
                <th><SortButton label="活動名稱" sortKey="name" sort={sort} onToggle={toggle} /></th>
                <th>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <SortButton label="類型" sortKey="type" sort={sort} onToggle={toggle} />
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
                <th><SortButton label="活動日期" sortKey="date" sort={sort} onToggle={toggle} /></th>
                <th className="r">擬請補助</th>
                <th>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <SortButton label="狀態" sortKey="status" sort={sort} onToggle={toggle} />
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
                  <td className="r"><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
                </tr>
              ))}
              {!listQuery.isPending && pagedRows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>無符合篩選條件的申請</td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager page={page} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} />
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

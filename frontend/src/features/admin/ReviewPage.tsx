import { useEffect, useMemo, useState } from 'react'
import { countText } from '../../lib/counts'
import { Button } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import QueryError from '../../components/ui/QueryError'
import { RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import LargeBadge from '../../components/ui/LargeBadge'
import { Cols, FilterButton, MultiSortButton, Pager, sortParam, useMultiSort } from '../../components/ui/tableControls'
import { clampPage } from '../../lib/paging'
import { STATUS } from '../../lib/status'
import { useAuth } from '../../app/auth'
import { LISTED_STATUSES, fmtMoney } from '../activities/types'
import {
  canActOn,
  useAdminActivities,
  useAdminActivitiesPaged,
  useAdminActivityDetail,
  useAdminActivityMutations,
  type AdminActivity,
} from '../../api/adminActivities'
import { useClubOptions } from '../../api/adminClubs'
import ActivityReviewModal from './ActivityReviewModal'
import { clickableProps } from '../../lib/clickable'

// 待審佇列是整批撈回來的小結果集(僅本關可簽核者),分頁在前端切;最近審核走伺服器分頁
const QUEUE_PAGE_SIZE = 8
const RECENT_PAGE_SIZE = 10
// 顯示狀態(含推導的 'locked'),與社團端活動列表同一份。
// 少了 'locked' 這一項,逾期鎖定的單會從最近審核整批消失 —— 後端的 approved
// 篩的是**畫面上的**已核准,不含顯示為「已逾期」的那些,而漏斗選項也是由這份推導的,
// 承辦連把它們找回來的入口都沒有
const ALL_STATUSES = LISTED_STATUSES

// 類型篩選由後端推導(「大型活動」=類型活動且已認可或申請中未被否准);
// 排序亦為伺服器端白名單(type 排序以原始類型為準,大型不獨立成一級)
const TYPE_OPTIONS = ['社課或會議', '活動', '大型活動']

type SortKey = 'club' | 'name' | 'type' | 'date' | 'status' | 'reviewed_at'

export default function ReviewPage() {
  const { user } = useAuth()
  const [current, setCurrent] = useState<AdminActivity | null>(null)
  const [open, setOpen] = useState(false)
  // 預設審核時間新→舊(無審核紀錄者殿後);點欄位依點擊序疊加多鍵,全清除後回到預設
  const { entries, toggle } = useMultiSort<SortKey>([{ key: 'reviewed_at', dir: -1 }])
  const toggleSort = (k: SortKey) => {
    toggle(k)
    setPage(1) // 伺服器端分頁:換排序回到第 1 頁
  }
  const [queuePage, setQueuePage] = useState(1)
  const [clubFilter, setClubFilter] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [page, setPage] = useState(1)

  // 待審佇列:僅撈登入者可簽核的狀態(小結果集);最近審核表改伺服器端分頁,
  // 14k+ 筆必須分批,不得整批撈取
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

  // 簽掉一件後佇列變短,停在末頁會看到空卡片;clampPage 對合法頁碼回傳原值。
  // 收斂的結果要寫回 state,否則佇列之後又變長(新送件)會把承辦彈回它原本停的那一頁
  const queuePageNow = clampPage(queuePage, queue.length, QUEUE_PAGE_SIZE)
  useEffect(() => setQueuePage(queuePageNow), [queuePageNow])
  const pagedQueue = queue.slice((queuePageNow - 1) * QUEUE_PAGE_SIZE, queuePageNow * QUEUE_PAGE_SIZE)

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
    // 顯式預設(-reviewed_at)寫在 useMultiSort defaults:entries 一律非空,固定帶 sort
    sort: sortParam(entries),
    page,
    pageSize: RECENT_PAGE_SIZE,
  })
  const pagedRows = listQuery.data?.rows ?? []
  const total = listQuery.data?.total ?? 0
  // 別關簽掉一件就會讓最近審核少一筆;停在末頁只會看到「無審核紀錄」。
  // 失敗時 total 也是 0,一起 clamp 會把錯誤說明洗掉,所以只在成功後收斂
  const listLoaded = listQuery.isSuccess
  useEffect(() => {
    if (listLoaded) setPage((p) => clampPage(p, total, RECENT_PAGE_SIZE))
  }, [listLoaded, total])

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
            待本關 <span className="num">{countText(queue.length, { isPending: queueQuery.isLoading, isError: queueQuery.isError })}</span> 件
          </>
        }
      />

      {/* 待審佇列:本關可簽核的單據,送件早的在前 */}
      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 6px' }}>待審佇列</div>
        <LoadingBlock pending={queueQuery.isLoading} rows={3}>
          {pagedQueue.map((item) => (
            <div
              key={item.id}
              className="click-tint"
              {...clickableProps(() => openItem(item))}
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
            <div style={{ borderTop: '1px solid var(--line)' }}>
              {queueQuery.isError ? (
                <QueryError
                  compact
                  title="待審佇列載入失敗"
                  error={queueQuery.error}
                  onRetry={() => void queueQuery.refetch()}
                />
              ) : (
                <div style={{ padding: '20px 20px 24px', fontSize: 13, color: 'var(--steel)' }}>
                  沒有待本關簽核的申請
                </div>
              )}
            </div>
          )}
        </LoadingBlock>
        <Pager page={queuePageNow} pageSize={QUEUE_PAGE_SIZE} total={queue.length} onChange={setQueuePage} />
      </div>

      {/* 最近審核(他關審核中/已核准/已退回):供查閱與追蹤,預設審核時間新→舊 */}
      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近審核</div>
        <LoadingBlock pending={listQuery.isPending} rows={6}>
          <table className="tb dense fixed" style={{ minWidth: 880 }} aria-label="最近審核的活動申請">
            {/* 社團/名稱吃剩餘寬並截斷;類型允許換行(含大型徽章);日期/金額/狀態/審核時間固定 px */}
            <Cols widths={['18%', 'auto', 130, 104, 90, 100, 140, 32]} />
            <thead>
              <tr>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <MultiSortButton label="社團" sortKey="club" entries={entries} onToggle={toggleSort} />
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
                <th scope="col"><MultiSortButton label="活動名稱" sortKey="name" entries={entries} onToggle={toggleSort} /></th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <MultiSortButton label="類型" sortKey="type" entries={entries} onToggle={toggleSort} />
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
                <th scope="col"><MultiSortButton label="活動日期" sortKey="date" entries={entries} onToggle={toggleSort} /></th>
                <th scope="col" className="r">擬請補助</th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <MultiSortButton label="狀態" sortKey="status" entries={entries} onToggle={toggleSort} />
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
                <th scope="col"><MultiSortButton label="審核時間" sortKey="reviewed_at" entries={entries} onToggle={toggleSort} /></th>
                <th scope="col" aria-label="開啟" />
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => openItem(item)}
                  style={{ cursor: 'pointer', ...(current?.id === item.id && open ? { background: 'var(--seal-tint)' } : {}) }}
                >
                  <td className="cell-clip" title={item.club}>{item.club}</td>
                  <td className="cell-clip" title={item.name} style={{ fontWeight: 500 }}>
                    <button
                      type="button"
                      className="row-open-btn"
                      aria-label={`開啟「${item.name || '未命名活動'}」詳細資訊`}
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
              {/* 兩種失敗都要有出口:列表失敗時 isPending 已為 false、pagedRows 是空陣列,
                  不說出來就會顯示成「無符合篩選條件的申請」;社團選項失敗則讓漏斗靜靜地空著 */}
              {(listQuery.isError || clubsQuery.isError) && (
                <tr className="no-hover">
                  <td colSpan={8}>
                    <QueryError
                      compact
                      title={listQuery.isError ? '最近審核載入失敗' : '篩選選項載入失敗'}
                      error={listQuery.error ?? clubsQuery.error}
                      onRetry={() => {
                        if (listQuery.isError) void listQuery.refetch()
                        if (clubsQuery.isError) void clubsQuery.refetch()
                      }}
                    />
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && !clubsQuery.isError && pagedRows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                    {/* 沒下篩選時說「無符合篩選條件」是在指責使用者的操作:新學期本來就一筆都沒有 */}
                    {clubFilter.length || typeFilter.length || statusFilter.length
                      ? '無符合篩選條件的申請'
                      : '無審核紀錄'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
        <Pager page={page} pageSize={RECENT_PAGE_SIZE} total={total} onChange={setPage} />
      </div>

      {/* Modal 常駐待關閉動畫結束(afterClose)才卸載;key 依單據重掛,核定金額與退回原因不殘留;
          詳情載入完成後以完整資料(經費/附件/經費來源)替換列表列 */}
      {current && (
        <ActivityReviewModal
          key={current.id}
          item={detailQuery.data ?? current}
          detailError={detailQuery.error}
          onRetryDetail={() => void detailQuery.refetch()}
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

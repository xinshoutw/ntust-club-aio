import { useEffect, useState } from 'react'
import { countText } from '../../lib/counts'
import { App, Button } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { useAuth } from '../../app/auth'
import { fmtMoney } from '../activities/types'
import { Cols, Pager } from '../../components/ui/tableControls'
import {
  useAdminActivitiesPaged,
  useAdminActivityDetail,
  useAdminActivityMutations,
  type AdminActivity,
} from '../../api/adminActivities'
import ActivityReviewModal from './ActivityReviewModal'
import { clickableProps } from '../../lib/clickable'
import { clampPage } from '../../lib/paging'

// 兩張表各自分頁:待審是逐件處理的佇列,逾期是追蹤用的清單
const PENDING_PAGE_SIZE = 8
const OVERDUE_PAGE_SIZE = 10


// 結案審核彈窗 = 統一的活動彈窗(ActivityReviewModal)+ 結案簽核回呼:
// 承辦人單關,核准時一併寫三個繳交確認。內容與申請審核、所有活動同一份版面
function CloseReviewModal({
  item,
  open,
  onClose,
  afterClose,
}: {
  item: AdminActivity
  open: boolean
  onClose: () => void
  afterClose: () => void
}) {
  const detailQuery = useAdminActivityDetail(item.activityId)
  const { closeApprove, closeReject } = useAdminActivityMutations()
  const detail = detailQuery.data
  // 手上還沒有詳情才算失敗:背景重抓失敗時 TanStack 保留既有 data,內容與按鈕都照舊
  const detailFailed = detailQuery.isError && !detail
  // 手上這份可能不是最新的:重抓在途或重抓失敗都不給核准 —— 繳交確認是從它推導的,
  // 而核准一次寫死三個旗標並轉 closed,沒有第二條路能改
  const detailStale = detailQuery.isError && !!detail ? 'error' : detailQuery.isFetching && 'fetching'

  return (
    <ActivityReviewModal
      item={detail ?? item}
      detailError={detailFailed ? detailQuery.error : undefined}
      onRetryDetail={() => void detailQuery.refetch()}
      detailStale={detailStale}
      open={open}
      onClose={onClose}
      afterClose={afterClose}
      onCloseApprove={(checks) =>
        closeApprove.mutateAsync({
          id: item.activityId,
          photosConfirmed: checks.photos,
          reportConfirmed: checks.report,
          reflectionsConfirmed: checks.reflections,
        })
      }
      onCloseReject={(reason) => closeReject.mutateAsync({ id: item.activityId, reason })}
    />
  )
}


export default function CloseReviewPage() {
  const { message } = App.useApp()
  const { user } = useAuth()
  // 解鎖是本頁唯一只認 aclose 的動作(核准/退回另有 approve_advisor 這條路,
  // decisions.md D-08);持 approve_advisor 而無 aclose 的帳號進得了頁,按下去必 403
  const canUnlock = !!user && (user.isSuper || user.permissions.includes('aclose'))
  // 看得到逾期表的條件比解鎖寬:後端只要求「看得到 approved」,而 areview 也看得到
  const canSeeOverdue =
    !!user && (user.isSuper || ['aclose', 'areview'].some((k) => user.permissions.includes(k)))
  const [selected, setSelected] = useState<AdminActivity | null>(null)
  const [open, setOpen] = useState(false)
  // 逾期列另開 ActivityReviewModal(唯讀活動詳情),與待審結案的 CloseReviewModal 各自獨立
  const [overdueItem, setOverdueItem] = useState<AdminActivity | null>(null)
  const [overdueOpen, setOverdueOpen] = useState(false)

  const [pendingPage, setPendingPage] = useState(1)
  const [overduePage, setOverduePage] = useState(1)
  // 伺服器端分頁+排序:活動時間新在前
  const pendingQuery = useAdminActivitiesPaged({
    statuses: ['closing_pending_advisor'],
    sort: '-date',
    page: pendingPage,
    pageSize: PENDING_PAGE_SIZE,
  })
  // 逾期未結案:後端推導過濾,含已鎖定與已解鎖(overdue=true 不分鎖定與否);
  // 活動日新在前=剛逾期的先追,追得回來的就是這些(拖了兩年的舊案排在後面)
  const overdueQuery = useAdminActivitiesPaged({
    overdue: true,
    sort: '-date',
    page: overduePage,
    pageSize: OVERDUE_PAGE_SIZE,
    // 逾期清單全是 approved:看不到該狀態的帳號送出去只會拿 403,
    // 畫面上就是每次開頁一片紅字。本頁對 approve_advisor 也開放,而它看不到 approved
    enabled: canSeeOverdue,
  })
  const { unlock } = useAdminActivityMutations()

  const pending = pendingQuery.data?.rows ?? []
  const pendingTotal = pendingQuery.data?.total ?? 0
  const overdue = overdueQuery.data?.rows ?? []
  const overdueTotal = overdueQuery.data?.total ?? 0

  // 伺服器分頁:簽掉一件後總數變少,停在末頁會看到空卡片(空狀態只在真的 0 筆時才對)
  const pendingLoaded = pendingQuery.isSuccess
  const overdueLoaded = overdueQuery.isSuccess
  useEffect(() => {
    if (pendingLoaded) setPendingPage((p) => clampPage(p, pendingTotal, PENDING_PAGE_SIZE))
  }, [pendingLoaded, pendingTotal])
  useEffect(() => {
    if (overdueLoaded) setOverduePage((p) => clampPage(p, overdueTotal, OVERDUE_PAGE_SIZE))
  }, [overdueLoaded, overdueTotal])

  // 點列即抓詳情,載入完成後彈窗自動補齊(照 ReviewPage 的立即開窗模式)
  const overdueDetailQuery = useAdminActivityDetail(overdueItem?.activityId)

  const openItem = (p: AdminActivity) => {
    setSelected(p)
    setOpen(true)
  }

  const openOverdue = (l: AdminActivity) => {
    setOverdueItem(l)
    setOverdueOpen(true)
  }

  const doUnlock = (l: AdminActivity) => {
    unlock.mutate(l.activityId, {
      onSuccess: () => message.success(`已解鎖「${l.name}」`),
      onError: (e) => message.error(e.message),
    })
  }

  return (
    <div>
      <PageHeader
        title="結案審核"
        sub={
          <>
            待審 <span className="num">{countText(pendingTotal, pendingQuery)}</span> 件
            {canSeeOverdue && (
              <>
                {' · '}逾期未結案{' '}
                <span className="num">{countText(overdueTotal, overdueQuery)}</span> 件
              </>
            )}
          </>
        }
      />

      {/* 待審佇列:申請早的在前 */}
      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 6px' }}>待審結案</div>
        <LoadingBlock pending={pendingQuery.isPending}>
          {pending.map((p) => (
            <div
              key={p.id}
              className="click-tint"
              {...clickableProps(() => openItem(p))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '13px 20px',
                borderTop: '1px solid var(--line)',
                cursor: 'pointer',
                flexWrap: 'wrap',
                ...(selected?.id === p.id && open ? { background: 'var(--seal-tint)' } : {}),
              }}
            >
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>
                  {p.club} · 活動 <span className="num">{p.date}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 84 }}>
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>核定補助</div>
                <div className="num" style={{ fontSize: 13, marginTop: 2 }}>{fmtMoney(p.approvedTotal ?? 0)}</div>
              </div>
              <Button
                type="primary"
                size="small"
                style={{ height: 30 }}
                onClick={(e) => {
                  e.stopPropagation()
                  openItem(p)
                }}
              >
                審核
              </Button>
            </div>
          ))}
          {pending.length === 0 && (
            <div style={{ borderTop: '1px solid var(--line)' }}>
              {pendingQuery.isError ? (
                <QueryError
                  compact
                  title="待審結案載入失敗"
                  error={pendingQuery.error}
                  onRetry={() => void pendingQuery.refetch()}
                />
              ) : (
                <div style={{ padding: '20px 20px 24px', fontSize: 13, color: 'var(--steel)' }}>無待審結案</div>
              )}
            </div>
          )}
        </LoadingBlock>
          <Pager page={pendingPage} pageSize={PENDING_PAGE_SIZE} total={pendingTotal} onChange={setPendingPage} />
      </div>

      {/* 逾期未結案:已鎖定與已解鎖皆列出,整列可點開活動詳情。整段都是逾期件,不另立狀態欄
          ——「解鎖」鈕只出現在仍鎖定的列,已解鎖者因此是沒有動作的那幾列。
          整段只給看得到 approved 的帳號 —— 停用的查詢恆為 isPending,留著會永遠鋪 Skeleton */}
      {canSeeOverdue && (
      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>逾期未結案</div>
        <LoadingBlock pending={overdueQuery.isPending}>
          <table className="tb dense fixed" style={{ minWidth: 640 }} aria-label="逾期未結案活動">
            {/* 社團/名稱吃剩餘寬並截斷;期限/動作固定 px */}
            <Cols widths={['26%', 'auto', 110, 90]} />
            <thead>
              <tr>
                <th scope="col">社團</th>
                <th scope="col">活動名稱</th>
                <th scope="col">結案期限</th>
                <th scope="col" aria-label="動作" />
              </tr>
            </thead>
            <tbody>
              {overdue.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => openOverdue(l)}
                  style={{
                    cursor: 'pointer',
                    ...(overdueItem?.id === l.id && overdueOpen ? { background: 'var(--seal-tint)' } : {}),
                  }}
                >
                  <td className="cell-clip" title={l.club}>{l.club}</td>
                  <td className="cell-clip" title={l.name} style={{ fontWeight: 500 }}>
                    <button
                      type="button"
                      className="row-open-btn"
                      aria-label={`開啟「${l.name || '未命名活動'}」詳細資訊`}
                      onClick={(e) => {
                        e.stopPropagation()
                        openOverdue(l)
                      }}
                    >
                      {l.name}
                    </button>
                  </td>
                  <td className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>
                    {l.closeDeadline ?? '—'}
                  </td>
                  <td className="r">
                    {l.closeLocked ? (
                      canUnlock && (
                        <Button
                          size="small"
                          style={{ height: 28 }}
                          loading={unlock.isPending && unlock.variables === l.activityId}
                          onClick={(e) => {
                            e.stopPropagation()
                            doUnlock(l)
                          }}
                        >
                          解鎖
                        </Button>
                      )
                    ) : (
                      // 沒有狀態欄之後,空白的動作欄有兩種意思(已解鎖 / 鎖定中但無權解鎖),
                      // 已解鎖的那一種要說出來 —— 期限已過卻不再擋社團,是這張表裡的例外
                      <span style={{ fontSize: 12, color: 'var(--steel)' }}>已解鎖</span>
                    )}
                  </td>
                </tr>
              ))}
              {overdueQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={4}>
                    <QueryError
                      compact
                      title="逾期未結案載入失敗"
                      error={overdueQuery.error}
                      onRetry={() => void overdueQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {!overdueQuery.isPending && !overdueQuery.isError && overdue.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                    沒有逾期的活動
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
          <Pager page={overduePage} pageSize={OVERDUE_PAGE_SIZE} total={overdueTotal} onChange={setOverduePage} />
      </div>
      )}

      {/* Modal 常駐至關閉動畫結束(afterClose)才卸載 */}
      {selected && (
        <CloseReviewModal
          key={selected.id}
          item={selected}
          open={open}
          onClose={() => setOpen(false)}
          afterClose={() => setSelected(null)}
        />
      )}
      {/* 逾期列:重用 ActivityReviewModal 唯讀模式(不帶 onApprove/onReject,僅供查看);
          詳情載入完成後以完整資料(經費/附件)替換列表列 */}
      {overdueItem && (
        <ActivityReviewModal
          key={overdueItem.id}
          item={overdueDetailQuery.data ?? overdueItem}
          detailError={overdueDetailQuery.error}
          onRetryDetail={() => void overdueDetailQuery.refetch()}
          open={overdueOpen}
          onClose={() => setOverdueOpen(false)}
          afterClose={() => setOverdueItem(null)}
        />
      )}
    </div>
  )
}

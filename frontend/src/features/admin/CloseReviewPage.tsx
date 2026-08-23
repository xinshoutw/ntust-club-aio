import { useEffect, useState } from 'react'
import { countText } from '../../lib/counts'
import { App, Button, Checkbox, Input, Modal, Skeleton } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { approvedText, fmtMoney, showsApproved } from '../activities/types'
import { Cols, Pager } from '../../components/ui/tableControls'
import { useModalAutoFocus } from '../../components/ui/useModalAutoFocus'
import SectionTitle from '../../components/ui/SectionTitle'
import {
  canActOnClose,
  useAdminActivitiesPaged,
  useAdminActivityDetail,
  useAdminActivityMutations,
  type AdminActivity,
} from '../../api/adminActivities'
import ActivityReviewModal from './ActivityReviewModal'
import DownloadMenu from '../activities/DownloadMenu'
import { downloadEvalFile } from '../eval/files'
import { activityApplyPdf } from '../../api/activities'
import { clickableProps } from '../../lib/clickable'
import { SUBMISSION_CHECKS, defaultConfirmations, type CheckKey } from './closeChecks'
import { clampPage } from '../../lib/paging'
import { MIN_PHOTOS, MIN_REFLECTIONS } from '../activities/types'

// 兩張表各自分頁:待審是逐件處理的佇列,逾期是追蹤用的清單
const PENDING_PAGE_SIZE = 8
const OVERDUE_PAGE_SIZE = 10

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }


// 結案審核彈窗:承辦人單關;完整結案資料(GET /admin/activities/{id})+繳交確認,
// 核准或退回(退回原因必填)
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
  const { message } = App.useApp()
  const { user } = useAuth()
  const detailQuery = useAdminActivityDetail(item.activityId)
  const { closeApprove, closeReject } = useAdminActivityMutations()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const approveRef = useModalAutoFocus(open)
  // 只存承辦手動改過的項目,其餘跟著推導走:詳情是非同步載入的,
  // 用 state 存預設值就得等 effect 補寫,中間那一刻的值會是錯的
  const [override, setOverride] = useState<Partial<Record<CheckKey, boolean>>>({})

  const detail = detailQuery.data
  const report = detail?.report
  const photos = detail?.photos ?? []
  // 手上還沒有詳情才算失敗:背景重抓失敗時 TanStack 保留既有 data,
  // 內容與按鈕都照舊(同 ActivityReviewModal)
  const detailFailed = detailQuery.isError && !detail
  // 手上這份可能不是最新的:重抓在途或重抓失敗都不給核准 —— 繳交確認是從它推導的,
  // 而核准一次寫死三個旗標並轉 closed,沒有第二條路能改
  const detailStale = detailQuery.isFetching || (detailQuery.isError && !!detail)
  const autoChecks = defaultConfirmations(report, photos.length)
  const checks = { ...autoChecks, ...override }
  const canReview = item.status === 'closing_pending_advisor' && canActOnClose(user)

  const closeReject_ = () => {
    setRejectOpen(false)
    setReason('')
  }

  const submitApprove = () => {
    closeApprove.mutate(
      {
        id: item.activityId,
        photosConfirmed: checks.photos,
        reportConfirmed: checks.report,
        reflectionsConfirmed: checks.reflections,
      },
      {
        onSuccess: () => {
          message.success(`已核准「${item.name}」結案`)
          onClose()
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  const submitReject = () => {
    if (!reason.trim()) {
      message.error('退回原因為必填')
      return
    }
    closeReject.mutate(
      { id: item.activityId, reason: reason.trim() },
      {
        onSuccess: () => {
          message.success(`已退回「${item.name}」結案`)
          closeReject_()
          onClose()
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  // 核定補助:有申請補助,或雖沒申請但確實核了錢(遷移資料有這種列)才顯示。
  // 有申請卻還沒核定時 approvedTotal 是 null —— `?? 0` 會把「還沒核定」說成「核定 0 元」,
  // 連帶讓超支判定拿一個假的上限去比
  const hasSubsidy = showsApproved(item.requested, item.approvedTotal)
  const approvedKnown = item.requested === 0 || item.approvedTotal != null
  // 實際支出含自籌:與「自籌+核定補助」的總經費比較才可比(僅比核定補助幾乎必超)
  const totalBudget = item.selfFundTotal + (item.approvedTotal ?? 0)
  const overBudget = !!report && approvedKnown && report.expense > totalBudget
  const photoShort = !!detail && !!report && photos.length < MIN_PHOTOS && !report.videoUrl
  const dateRange = item.endDate !== item.date ? `${item.date} – ${item.endDate}` : item.date

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      width={760}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 26 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{item.name}</span>
          <StatusPill status={item.status} />
          <span style={{ flex: 1 }} />
          <DownloadMenu
            items={[{ key: 'apply', label: '下載社團活動申請表' }]}
            onClick={() => downloadEvalFile(activityApplyPdf(item, 'admin'))}
          />
        </div>
      }
      footer={
        // 讀不到結案內容就不給簽核鈕:看不到照片與心得就沒有東西可核實,
        // 繳交確認也只會是空詳情推導出來的值;退回也不該在讀不到內容時按
        detailFailed ? (
          <div style={{ fontSize: 12, color: 'var(--steel)' }}>
            詳細資訊載入失敗，請重試{canReview ? '後再審核' : ''}
          </div>
        ) : canReview ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
            {detail && detailStale && (
              <span style={{ fontSize: 12, color: 'var(--steel)', marginRight: 'auto' }}>
                {detailQuery.isError ? (
                  <>
                    結案內容更新失敗{' '}
                    <Button type="link" size="small" style={{ padding: 0 }} onClick={() => void detailQuery.refetch()}>
                      重試
                    </Button>
                  </>
                ) : (
                  '結案內容更新中'
                )}
              </span>
            )}
            <Button danger style={{ height: 38 }} disabled={closeApprove.isPending} onClick={() => setRejectOpen(true)}>
              退回
            </Button>
            <Button
              type="primary"
              ref={approveRef}
              style={{ height: 38 }}
              disabled={!report || detailStale}
              loading={closeApprove.isPending}
              onClick={submitApprove}
            >
              核准結案
            </Button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--steel)' }}>
            {item.status === 'closing_pending_advisor' ? '無結案簽核權限，僅供查看' : '僅供查看'}
          </div>
        )
      }
    >
      {detailQuery.isPending ? (
        <Skeleton active paragraph={{ rows: 8 }} style={{ marginTop: 12 }} />
      ) : detailFailed ? (
        <div style={{ marginTop: 12 }}>
          <QueryError compact title="結案詳細資訊載入失敗" error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />
        </div>
      ) : !report ? (
        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--steel)' }}>此活動尚無結案資料</div>
      ) : (
        <>
          <SectionTitle first>結案成果</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: '9px 12px', fontSize: 13 }}>
            <div style={detailLabel}>社團</div><div>{item.club}</div>
            <div style={detailLabel}>活動日期</div><div className="num">{dateRange}</div>
            <div style={detailLabel}>實際時間</div>
            <div className="num">{report.actualStart}–{report.actualEnd}</div>
            <div style={detailLabel}>實際地點</div><div>{report.actualLocation}</div>
            <div style={detailLabel}>實際人數</div>
            <div>
              社員 <span className="num">{report.memberCount}</span> · 非社員{' '}
              <span className="num">{report.nonMemberCount}</span>
            </div>
            <div style={detailLabel}>申請</div><div className="num">{report.submittedAt}</div>
            <div style={detailLabel}>經費</div>
            <div>
              {hasSubsidy && (
                <>
                  核定補助 <span className="num">{approvedText(item.approvedTotal, fmtMoney)}</span> ·{' '}
                </>
              )}
              自籌 <span className="num">{fmtMoney(item.selfFundTotal)}</span> · 實支{' '}
              <span className="num" style={overBudget ? { color: '#C13B34', fontWeight: 500 } : undefined}>
                {fmtMoney(report.expense)}
              </span>
              {overBudget && <span style={{ color: '#C13B34', fontSize: 12 }}>(超出核定總經費)</span>}
            </div>
            <div style={detailLabel}>成果</div>
            <div>
              照片 <span className="num" style={photoShort ? { color: '#C13B34' } : undefined}>{photos.length}</span> 張
              {report.videoUrl ? (
                <>
                  {' '}·{' '}
                  <a href={report.videoUrl} target="_blank" rel="noopener noreferrer">影片連結</a>
                </>
              ) : (
                ' · 無影片連結'
              )}
              {' '}· 心得 <span className="num">{report.reflections.length}</span> 人
              {photoShort && (
                <div style={{ color: '#C13B34', fontSize: 12 }}>照片未達 {MIN_PHOTOS} 張且無影片</div>
              )}
            </div>
            <div style={detailLabel}>活動重點</div><div style={{ lineHeight: 1.7 }}>{report.highlights}</div>
            <div style={detailLabel}>達成目標</div><div style={{ lineHeight: 1.7 }}>{report.goals}</div>
            {report.others && (
              <>
                <div style={detailLabel}>其他成果</div><div style={{ lineHeight: 1.7 }}>{report.others}</div>
              </>
            )}
            {report.reviewMeeting && (
              <>
                <div style={detailLabel}>檢討會議</div>
                <div style={{ lineHeight: 1.7 }}>
                  <span className="num">{report.reviewDate}</span> · 與會{' '}
                  <span className="num">{report.reviewAttendees}</span> 人
                  <div style={{ fontSize: 12, color: 'var(--steel)' }}>討論:{report.reviewTopics}</div>
                  <div style={{ fontSize: 12, color: 'var(--steel)' }}>決議:{report.reviewConclusion}</div>
                </div>
              </>
            )}
          </div>

          {/* 照片縮圖:點擊開原圖(GET /files/{id}) */}
          {photos.length > 0 && (
            <div>
              <SectionTitle>活動照片(<span className="num">{photos.length}</span> 張)</SectionTitle>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {photos.map((p) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" title={p.name}>
                    <img
                      src={p.url}
                      alt={p.name}
                      loading="lazy"
                      width={96}
                      height={72}
                      style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 學習心得全文:審核者須核實內容 */}
          <div>
            <SectionTitle>學習心得(<span className="num">{report.reflections.length}</span> 人)</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
              {report.reflections.map((r, i) => (
                <div key={i} style={{ padding: '8px 12px', background: 'var(--paper)', borderRadius: 6, fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  <span style={{ color: 'var(--steel)', fontSize: 12 }}>({r.dept})</span>
                  <div style={{ lineHeight: 1.7, marginTop: 2 }}>{r.text}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 繳交確認:未勾選之項目評鑑以 0 分計 */}
          {canReview && (
            <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--paper)', borderRadius: 6 }}>
              <SectionTitle first>繳交確認</SectionTitle>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                {SUBMISSION_CHECKS.map((c) => (
                  <Checkbox
                    key={c.key}
                    checked={checks[c.key]}
                    onChange={(e) => setOverride((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                  >
                    {c.label}
                  </Checkbox>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 8, lineHeight: 1.7 }}>
                <span>照片未達 <span className="num">{MIN_PHOTOS}</span> 張且無影片、心得未達 <span className="num">{MIN_REFLECTIONS}</span> 篇、或原本就未確認的項目，已自動取消勾選；核實無誤可自行勾回</span>
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        open={rejectOpen}
        title="退回結案"
        okText="確認退回"
        destroyOnHidden
        confirmLoading={closeReject.isPending}
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onOk={submitReject}
        onCancel={closeReject_}
      >
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 8 }}>
          退回原因
        </div>
        <Input.TextArea
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={`例：成果照片不足 ${MIN_PHOTOS} 張且未附影片連結`}
        />
      </Modal>
    </Modal>
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
  // 活動日舊在前=逾期最久的先處理(期限=活動日+鎖定天數,單調)
  const overdueQuery = useAdminActivitiesPaged({
    overdue: true,
    sort: 'date',
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
      onSuccess: () => message.success(`已解鎖「${l.name}」,社團可補送結案`),
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

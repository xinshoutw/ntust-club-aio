import { useState } from 'react'
import { App, Button, Checkbox, Input, Modal, Skeleton, Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { fmtMoney } from '../activities/types'
import { Cols, Pager } from '../../components/ui/tableControls'
import { useModalAutoFocus } from '../../components/ui/useModalAutoFocus'
import {
  canActOnClose,
  useAdminActivitiesPaged,
  useAdminActivityDetail,
  useAdminActivityMutations,
  type AdminActivity,
} from '../../api/adminActivities'
import ActivityReviewModal from './ActivityReviewModal'
import { clickableProps } from '../../lib/clickable'

// 一頁最多 25 筆(50 筆太長,減半)、活動時間新在前
const PAGE_SIZE = 25

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }

// 繳交確認:承辦人逐項確認;未確認之項目評鑑以 0 分計(核准時隨 body 落庫)
const SUBMISSION_CHECKS = [
  { key: 'photos', label: '活動照片' },
  { key: 'report', label: '成果報告表' },
  { key: 'reflections', label: '學習心得' },
] as const
type CheckKey = (typeof SUBMISSION_CHECKS)[number]['key']

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
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>({ photos: true, report: true, reflections: true })

  const detail = detailQuery.data
  const report = detail?.report
  const photos = detail?.photos ?? []
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
          const missing = SUBMISSION_CHECKS.filter((c) => !checks[c.key]).map((c) => c.label)
          message.success(
            missing.length
              ? `已核准「${item.name}」結案(${missing.join('、')}未繳,該項以 0 分計)`
              : `已核准「${item.name}」結案`,
          )
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

  const approvedBudget = item.approvedTotal ?? 0
  // 實際支出含自籌:與「自籌+核定補助」的總經費比較才可比(僅比核定補助幾乎必超)
  const totalBudget = item.selfFundTotal + approvedBudget
  const overBudget = !!report && report.expense > totalBudget
  const photoShort = !!detail && photos.length < 5 && !report?.videoUrl
  const dateRange = item.endDate !== item.date ? `${item.date} – ${item.endDate}` : item.date

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      width={640}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 26 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{item.name}</span>
          <StatusPill status={item.status} />
        </div>
      }
      footer={
        canReview ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
            <Button danger style={{ height: 38 }} disabled={closeApprove.isPending} onClick={() => setRejectOpen(true)}>
              退回
            </Button>
            <Button
              type="primary"
              ref={approveRef}
              style={{ height: 38 }}
              disabled={!report}
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
      ) : detailQuery.isError ? (
        <div style={{ marginTop: 16, fontSize: 13, color: '#C13B34' }}>載入失敗:{detailQuery.error.message}</div>
      ) : !report ? (
        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--steel)' }}>此活動尚無結案資料</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: '9px 12px', fontSize: 13, marginTop: 4 }}>
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
            <div style={detailLabel}>送件</div><div className="num">{report.submittedAt}</div>
            <div style={detailLabel}>經費</div>
            <div>
              核定補助 <span className="num">{fmtMoney(approvedBudget)}</span> · 自籌{' '}
              <span className="num">{fmtMoney(item.selfFundTotal)}</span> · 實支{' '}
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
              {photoShort && <div style={{ color: '#C13B34', fontSize: 12 }}>照片未達 5 張且無影片連結,成果照片項不計分</div>}
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
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>活動照片</div>
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
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>學習心得</div>
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
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>繳交確認(未確認項目評鑑以 0 分計)</div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                {SUBMISSION_CHECKS.map((c) => (
                  <Checkbox
                    key={c.key}
                    checked={checks[c.key]}
                    onChange={(e) => setChecks((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                  >
                    {c.label}
                  </Checkbox>
                ))}
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
          退回原因(必填,將顯示於社團的活動列表)
        </div>
        <Input.TextArea
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例:成果照片不足 5 張且未附影片連結"
        />
      </Modal>
    </Modal>
  )
}

export default function CloseReviewPage() {
  const { message } = App.useApp()
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
    pageSize: PAGE_SIZE,
  })
  // 逾期未結案:後端推導過濾,含已鎖定與已解鎖(overdue=true 不分鎖定與否);
  // 活動日舊在前=逾期最久的先處理(期限=活動日+鎖定月數,單調)
  const overdueQuery = useAdminActivitiesPaged({
    overdue: true,
    sort: 'date',
    page: overduePage,
    pageSize: PAGE_SIZE,
  })
  const { unlock } = useAdminActivityMutations()

  const pending = pendingQuery.data?.rows ?? []
  const pendingTotal = pendingQuery.data?.total ?? 0
  const overdue = overdueQuery.data?.rows ?? []
  const overdueTotal = overdueQuery.data?.total ?? 0

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
            待審 <span className="num">{pendingTotal}</span> 件 · 逾期未結案 <span className="num">{overdueTotal}</span> 件
          </>
        }
      />

      {/* 待審佇列:送件早的在前 */}
      <Spin spinning={pendingQuery.isPending}>
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 6px' }}>待審結案</div>
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
            <div style={{ padding: '20px 20px 24px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--steel)' }}>
              {pendingQuery.isError ? `載入失敗:${pendingQuery.error.message}` : '目前沒有待審結案'}
            </div>
          )}
          <Pager page={pendingPage} pageSize={PAGE_SIZE} total={pendingTotal} onChange={setPendingPage} />
        </div>
      </Spin>

      {/* 逾期未結案:已鎖定與已解鎖皆列出(狀態欄區分),整列可點開活動詳情 */}
      <Spin spinning={overdueQuery.isPending}>
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>逾期未結案</div>
          <table className="tb dense fixed" style={{ minWidth: 640 }} aria-label="逾期未結案活動">
            {/* 社團/名稱吃剩餘寬並截斷;期限/狀態/動作固定 px */}
            <Cols widths={['26%', 'auto', 110, 96, 90]} />
            <thead>
              <tr>
                <th scope="col">社團</th>
                <th scope="col">活動名稱</th>
                <th scope="col">結案期限</th>
                <th scope="col">狀態</th>
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
                      aria-label={`開啟「${l.name || '未命名活動'}」詳情`}
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
                  <td>
                    <StatusPill status={l.closeLocked ? 'locked' : 'unlocked'} />
                  </td>
                  <td className="r">
                    {l.closeLocked && (
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
                    )}
                  </td>
                </tr>
              ))}
              {!overdueQuery.isPending && overdue.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                    {overdueQuery.isError ? `載入失敗:${overdueQuery.error.message}` : '沒有逾期的活動'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager page={overduePage} pageSize={PAGE_SIZE} total={overdueTotal} onChange={setOverduePage} />
        </div>
      </Spin>

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
          open={overdueOpen}
          onClose={() => setOverdueOpen(false)}
          afterClose={() => setOverdueItem(null)}
        />
      )}
    </div>
  )
}

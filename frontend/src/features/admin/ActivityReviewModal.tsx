import { useEffect, useRef, useState } from 'react'
import { App, Button, Checkbox, Input, InputNumber, Modal, Skeleton } from 'antd'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import SectionTitle from '../../components/ui/SectionTitle'
import LargeBadge from '../../components/ui/LargeBadge'
import { Cols } from '../../components/ui/tableControls'
import StampTrail, { type StampStage } from '../../components/ui/StampTrail'
import { useModalAutoFocus } from '../../components/ui/useModalAutoFocus'
import WorkTable from '../activities/WorkTable'
import { numColWidth } from '../activities/types'
import { useAuth } from '../../app/auth'
import { canActOn, stageOfStatus, type ReviewItem } from '../../api/adminActivities'

// .tb.dense td 的左右內距(index.css);核定欄的 td 右內距歸零、改由 InputNumber 自己的
// 內距與邊框佔掉,兩者分開算才不會少估而讓數字換行
const CELL_PAD = 24
const INPUT_CHROME = 18

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }

// 章軌由單據狀態推導;僅三關(有申請補助)畫章軌——
// 無補助=承辦人單關即核准(後端規則),單關不畫章軌
function stagesOf(status: ReviewItem['status']): StampStage[] {
  const mk = (advisor: StampStage['state'], chief: StampStage['state'], dean: StampStage['state']): StampStage[] => [
    { char: '承', label: '承辦人', state: advisor, note: noteOf(advisor) },
    { char: '組', label: '組長', state: chief, note: noteOf(chief) },
    { char: '長', label: '學務長', state: dean, note: noteOf(dean) },
  ]
  switch (status) {
    case 'pending_advisor':
      return mk('current', 'todo', 'todo')
    case 'pending_chief':
      return mk('done', 'current', 'todo')
    case 'pending_dean':
      return mk('done', 'done', 'current')
    case 'approved':
    case 'closed':
    // 結案流程中/待結案/逾期未結案皆為三關已核後的狀態(行政端社團總覽以唯讀開啟)
    case 'closing_pending_advisor':
    case 'closing_due':
    case 'locked':
      return mk('done', 'done', 'done')
    case 'rejected':
      return mk('rejected', 'todo', 'todo')
    default:
      return mk('todo', 'todo', 'todo')
  }
}

function noteOf(state: StampStage['state']): string | undefined {
  switch (state) {
    case 'current':
      return '審核中'
    case 'todo':
      return '未到關'
    case 'done':
      return '已核'
    case 'rejected':
      return '已退回'
  }
}

/** 第一關核准送出的內容:經費來源、逐項核定金額、大型活動認可 */
export interface ActivityApprovePayload {
  fundSource: string
  budget: { itemId: number; approvedSubsidy: number }[]
  largeApproved: boolean
}

// 活動申請審核彈窗(申請審核頁與行政端社團總覽共用):
// 章軌、基本資料、經費來源與逐項核定、大型活動認可;待本關者可簽核/退回,其餘唯讀
// onApprove/onReject:接 API 的頁面傳入 mutateAsync 回呼(成功 message+關彈窗、失敗 message.error)
// item 可為 null:點擊即開彈窗、詳情到位前顯示 Skeleton(不等網路才開窗)
export default function ActivityReviewModal({
  item,
  pendingName,
  detailError,
  onRetryDetail,
  open,
  onClose,
  afterClose,
  onApprove,
  onReject,
}: {
  item: ReviewItem | null
  /** item 尚未載入時標題列顯示的名稱(通常=列表列的活動名) */
  pendingName?: string
  /** 詳情查詢的錯誤:非 null 時內容改為錯誤呈現(Skeleton 沒有終點,不接就是永遠轉圈) */
  detailError?: unknown
  onRetryDetail?: () => void
  open: boolean
  onClose: () => void
  afterClose: () => void
  onApprove?: (payload: ActivityApprovePayload) => Promise<unknown>
  onReject?: (reason: string) => Promise<unknown>
}) {
  const { message } = App.useApp()
  const { user } = useAuth()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // item 到位才聚焦:骨架模式(item=null)開窗時核准鈕尚未 render,
  // 待詳情補齊、footer 換上按鈕後再聚焦,Enter 送出才有效
  const approveRef = useModalAutoFocus(open && !!item)
  // 大型活動:社團申請或管理員逕行核定;認可後行政分才享 ×3 加權。
  // 未處理的申請預設不勾(空心=待處理),認可須管理員明確勾選,避免順手核准即誤放 ×3
  const [largeApproved, setLargeApproved] = useState(item?.largeApproved ?? false)
  // 經費來源:有申請補助的案件由第一關認定(後端必填)
  const [fundSource, setFundSource] = useState(item?.fundSource ?? '')
  const d = item?.detail
  // 失敗但手上已有詳情 = 背景重抓失敗(TanStack 的 error 態保留既有 data,而重開同一列
  // staleTime 0 就會重抓):內容照舊、按鈕照舊,否則等於把讀得到的單變成不能簽,
  // 而且按「重試」畫面毫無變化(data 還在,error 不會被清掉)
  const detailFailed = detailError != null && !d
  // 核定金額:controlled,依預算列 id 管理
  const [approvals, setApprovals] = useState<Record<number, number>>(() =>
    Object.fromEntries((d?.budget ?? []).map((b) => [b.id, b.approved])),
  )
  // 接線頁面開彈窗時詳情可能尚未載入:budget 到位後一次性回填核定金額。
  // 只補 approvals——fundSource/largeApproved 列表列已帶,且可能已被使用者編輯,不得覆寫。
  // 以 null 開窗(社團總覽)則首筆資料到位時連 largeApproved/fundSource 一併補種
  const startedNull = useRef(item == null)
  const seeded = useRef(!!item?.detail)
  useEffect(() => {
    if (!item) return
    if (startedNull.current) {
      startedNull.current = false
      setLargeApproved(item.largeApproved ?? false)
      setFundSource(item.fundSource ?? '')
    }
    if (seeded.current || !item.detail) return
    seeded.current = true
    setApprovals(Object.fromEntries(item.detail.budget.map((b) => [b.id, b.approved])))
  }, [item])

  // 「本關」:接 API 的頁面(有 onApprove)依登入者簽核鍵推導;mock 展示維持第一關可簽
  const canReview = item ? (onApprove ? canActOn(user, item.status) : item.status === 'pending_advisor') : false
  // 經費來源/逐項核定/大型認可僅第一關(承辦人)可編輯;組長/學務長關唯讀核准
  const isFirstStage = item?.status === 'pending_advisor'
  const canEdit = canReview && isFirstStage
  const selfFundTotal = d?.budget.reduce((s, b) => s + b.selfFund, 0) ?? 0
  const requestedTotal = d?.budget.reduce((s, b) => s + b.requested, 0) ?? item?.requested ?? 0
  const approvedTotal = d?.budget.reduce((s, b) => s + (approvals[b.id] ?? 0), 0) ?? 0
  const singleStage = requestedTotal === 0 // 無補助 → 承辦人單關即核准
  const nextStageNote =
    isFirstStage && !singleStage ? ',送組長關' : item?.status === 'pending_chief' ? ',送學務長關' : ''

  const closeReject = () => {
    setRejectOpen(false)
    setReason('')
  }

  const submitApprove = async () => {
    if (!item) return
    const largeNote = isFirstStage && item.type === '活動' ? `(大型活動${largeApproved ? '已認可' : '未認可'})` : ''
    if (onApprove) {
      if (isFirstStage && requestedTotal > 0 && !fundSource.trim()) {
        message.error('有申請補助的案件必須認定經費來源')
        return
      }
      setSubmitting(true)
      try {
        await onApprove({
          fundSource: fundSource.trim(),
          budget: (d?.budget ?? []).map((b) => ({ itemId: b.id, approvedSubsidy: approvals[b.id] ?? 0 })),
          largeApproved,
        })
      } catch (e) {
        message.error(e instanceof Error ? e.message : '操作失敗')
        return
      } finally {
        setSubmitting(false)
      }
    }
    message.success(`已核准「${item.name}」${largeNote}${nextStageNote}`)
    onClose()
  }

  const submitReject = async () => {
    if (!item) return
    if (!reason.trim()) {
      message.error('退回原因為必填')
      return
    }
    if (onReject) {
      setSubmitting(true)
      try {
        await onReject(reason.trim())
      } catch (e) {
        message.error(e instanceof Error ? e.message : '操作失敗')
        return
      } finally {
        setSubmitting(false)
      }
    }
    message.success(`已退回「${item.name}」`)
    closeReject()
    onClose()
  }

  const hasBudget = !!d && d.budget.length > 0
  // 接線資料帶可下載連結;mock 僅檔名
  const files = d?.attachmentFiles

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      width={hasBudget ? 1080 : 640}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 26 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{item?.name ?? pendingName ?? ''}</span>
          {item && (
            <>
              {/* 本關可簽核時,徽章即時反映下方「認可為大型活動」勾選 */}
              <LargeBadge applied={item.isLarge} approved={canEdit ? largeApproved : item.largeApproved} />
              <StatusPill status={item.status} />
            </>
          )}
          <span style={{ flex: 1 }} />
          {/* 單關(無補助)不畫章軌:只有一顆章沒有資訊量,徒佔標題列空間 */}
          {item && !singleStage && <StampTrail stages={stagesOf(item.status)} />}
        </div>
      }
      footer={
        // 看不到詳情就不給簽核鈕:核准要靠 detail 的 budget(否則整單核定 0 元),
        // 退回也不該在讀不到申請內容的情況下按。唯讀開窗(逾期列、已核准或非本關的單)
        // 本來就沒有鈕,別叫人去審核 —— 頁面對每一列都傳 onApprove,判準只能是 canReview
        detailFailed ? (
          <div style={{ fontSize: 12, color: 'var(--steel)' }}>
            詳情載入失敗,請重試{canReview ? '後再審核' : ''}
          </div>
        ) : canReview ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
            <Button danger style={{ height: 38 }} disabled={submitting} onClick={() => setRejectOpen(true)}>
              退回
            </Button>
            <Button
              type="primary"
              ref={approveRef}
              style={{ height: 38 }}
              // 接線頁面詳情未載入前不可核准(經費逐項核定要靠 detail 的 budget)
              disabled={!!onApprove && !item?.detail}
              loading={submitting && !rejectOpen}
              onClick={() => void submitApprove()}
            >
              核准{nextStageNote}
            </Button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--steel)' }}>
            {!item
              ? '載入中…'
              : item.status === 'rejected'
                ? '此申請已退回社團修正'
                : stageOfStatus(item.status)
                  ? '非本關卡待審單據，僅供查看'
                  : '僅供查看'}
          </div>
        )
      }
    >
      {/* 詳情載入失敗:整塊改為錯誤呈現。Skeleton 沒有終點,不接錯誤就是永遠轉圈;
          而列表列那半份基本資料也不能留 —— 經費逐項與附件都不在,「地點 —」看起來就像沒填 */}
      {detailFailed && (
        <div style={{ marginTop: 8 }}>
          <QueryError compact title="活動詳情載入失敗" error={detailError} onRetry={onRetryDetail} />
        </div>
      )}
      {/* 詳情未到位先鋪 Skeleton(彈窗立即開啟,內容漸進補齊) */}
      {!item && !detailFailed && <Skeleton active paragraph={{ rows: 6 }} style={{ marginTop: 8 }} />}
      {/* 有經費才走雙欄:左=基本資料,右=經費逐項核定 */}
      {item && !detailFailed && (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: hasBudget ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
          gap: '8px 28px',
          marginTop: 8,
        }}
      >
        <div>
          <SectionTitle first>基本資料</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '8px 12px', fontSize: 13 }}>
            <div style={detailLabel}>社團</div><div>{item.club}</div>
            <div style={detailLabel}>類型</div><div>{item.type}</div>
            <div style={detailLabel}>日期時間</div><div className="num">{d?.timeRange ?? item.date}</div>
            <div style={detailLabel}>地點</div><div>{d?.location ?? '—'}</div>
            <div style={detailLabel}>參加人數</div>
            <div>
              社員 <span className="num">{d?.participantsIn ?? '—'}</span> · 非社員{' '}
              <span className="num">{d?.participantsOut ?? '—'}</span>
            </div>
            <div style={detailLabel}>送件</div>
            <div>
              <span className="num">{d?.submittedAt ?? '—'}</span>
              {d?.submittedBy ? ` · ${d.submittedBy}` : ''}
            </div>
            {d?.content && (
              <>
                <div style={detailLabel}>內容</div>
                <div style={{ lineHeight: 1.7 }}>{d.content}</div>
              </>
            )}
            {!!d?.works?.length && (
              <>
                <div style={detailLabel}>工作分配</div>
                <WorkTable works={d.works} />
              </>
            )}
            <div style={detailLabel}>附件</div>
            <div>
              {files?.length
                ? files.map((f, i) => (
                    <span key={f.id}>
                      {i > 0 && ' · '}
                      <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--focus)' }}>
                        {f.name}
                      </a>
                    </span>
                  ))
                : d?.attachments.length
                  ? d.attachments.map((f, i) => (
                      <span key={f}>
                        {i > 0 && ' · '}
                        <button type="button" className="link-btn" style={{ color: 'var(--focus)', padding: 0 }}>
                          {f}
                        </button>
                      </span>
                    ))
                  : '—'}
            </div>
          </div>

          {item.type === '活動' && (
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--paper)', borderRadius: 6 }}>
              <Checkbox
                checked={largeApproved}
                disabled={!canEdit}
                onChange={(e) => setLargeApproved(e.target.checked)}
              >
                認可為大型活動
              </Checkbox>
              {item.isLarge && (
                <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>社團已申請認定為大型活動</div>
              )}
            </div>
          )}
        </div>

        {hasBudget && (
          <div>
            <SectionTitle first>經費明細</SectionTitle>
            {/* 經費來源:有申請補助時第一關必填認定 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13 }}>
              <span style={{ color: 'var(--steel)', whiteSpace: 'nowrap' }}>經費來源</span>
              {canEdit ? (
                <Input
                  size="small"
                  value={fundSource}
                  onChange={(e) => setFundSource(e.target.value)}
                  placeholder="xxx補助"
                />
              ) : (
                <span>{item.fundSource || '—'}</span>
              )}
            </div>
            <table className="tb dense fixed">
              {/* table-layout: fixed 要有明確寬度,但寬度由資料決定:自籌/擬請各看自己的最大值,
                  核定跟擬請同寬(核定 ≤ 擬請)再加輸入框的內距與邊框。其餘全給摘要 —— 遷移資料的說明很長 */}
              <Cols
                widths={[
                  'auto',
                  numColWidth(d.budget.map((b) => b.selfFund), CELL_PAD),
                  numColWidth(d.budget.map((b) => b.requested), CELL_PAD),
                  numColWidth(d.budget.map((b) => b.requested), CELL_PAD + INPUT_CHROME),
                ]}
              />
              <thead>
                <tr>
                  <th scope="col" style={{ paddingLeft: 0 }}>摘要</th>
                  <th scope="col" className="r">自籌</th>
                  <th scope="col" className="r">擬請</th>
                  <th scope="col" className="r" style={{ paddingRight: 0 }}>核定</th>
                </tr>
              </thead>
              <tbody>
                {d.budget.map((b) => (
                  <tr key={b.id} className="no-hover">
                    <td style={{ paddingLeft: 0 }}>
                      <div style={{ whiteSpace: 'nowrap' }}>{b.category}</div>
                      <div style={{ fontSize: 12, color: 'var(--steel)' }}>{b.description}</div>
                    </td>
                    <td className="r num">{b.selfFund.toLocaleString()}</td>
                    <td className="r num">{b.requested.toLocaleString()}</td>
                    <td style={{ paddingRight: 0 }}>
                      {canEdit ? (
                        <InputNumber
                          size="small"
                          style={{ width: '100%' }}
                          min={0}
                          max={b.requested}
                          precision={0}
                          value={approvals[b.id]}
                          onChange={(v) => setApprovals((prev) => ({ ...prev, [b.id]: v ?? 0 }))}
                          controls={false}
                        />
                      ) : (
                        <div className="r num" style={{ textAlign: 'right' }}>{(approvals[b.id] ?? 0).toLocaleString()}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* 合計落在各自欄位正下方 —— 併格的話「核定合計」會壓在擬請欄上,對不回欄名 */}
              <tfoot>
                <tr>
                  <th scope="row" style={{ borderBottom: 'none', padding: '10px 8px 0 0', fontSize: 12, fontWeight: 400, color: 'var(--steel)', textAlign: 'right' }}>
                    合計
                  </th>
                  <td className="r num" style={{ borderBottom: 'none', padding: '10px 8px 0 0' }}>
                    {selfFundTotal.toLocaleString()}
                  </td>
                  <td className="r num" style={{ borderBottom: 'none', padding: '10px 8px 0 0' }}>
                    {requestedTotal.toLocaleString()}
                  </td>
                  <td className="r num" style={{ borderBottom: 'none', padding: '10px 0 0', fontWeight: 600 }}>
                    {approvedTotal.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      )}

      <Modal
        open={rejectOpen}
        title="退回申請"
        okText="確認退回"
        destroyOnHidden
        confirmLoading={submitting}
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onOk={() => void submitReject()}
        onCancel={closeReject}
      >
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 8 }}>
          退回原因(必填,將顯示於社團的活動列表)
        </div>
        <Input.TextArea
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例:經費明細第 3 項未附估價單"
        />
      </Modal>
    </Modal>
  )
}

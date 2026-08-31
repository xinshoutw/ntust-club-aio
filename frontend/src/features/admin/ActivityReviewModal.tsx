import { useEffect, useRef, useState } from 'react'
import { App, Button, Checkbox, Input, InputNumber, Modal, Segmented, Skeleton, Tooltip } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import SectionTitle from '../../components/ui/SectionTitle'
import LargeBadge from '../../components/ui/LargeBadge'
import { Cols } from '../../components/ui/tableControls'
import StampTrail, { type StampStage, type StampState } from '../../components/ui/StampTrail'
import { useModalAutoFocus } from '../../components/ui/useModalAutoFocus'
import WorkTable from '../activities/WorkTable'
import DownloadMenu from '../activities/DownloadMenu'
import { useFilePreview } from '../eval/useFilePreview'
import { downloadEvalFile, downloadPhotosZip } from '../eval/files'
import { activityApplyPdf } from '../../api/activities'
import {
  MIN_PHOTOS,
  approvedText,
  fmtMoney,
  highlightsLabel,
  numColWidth,
  showsApproved,
} from '../activities/types'
import { useAuth } from '../../app/auth'
import {
  canActOn,
  canActOnClose,
  stageOfStatus,
  toEvalFile,
  type AdminFileRef,
  type ReviewApproval,
  type ReviewItem,
  type ReviewStage,
} from '../../api/adminActivities'
import { SUBMISSION_CHECKS, defaultConfirmations, type CheckKey } from './closeChecks'

// .tb.dense td 的左右內距(index.css);核定欄的 td 右內距歸零、改由 InputNumber 自己的
// 內距與邊框佔掉,兩者分開算才不會少估而讓數字換行
const CELL_PAD = 24
const INPUT_CHROME = 18

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }

/** 與申請不一致的實際值:直接取代申請值並以色彩標示,hover 顯示預計值 */
export function ActualValue({ actual, planned }: { actual: React.ReactNode; planned: string }) {
  return (
    <Tooltip mouseEnterDelay={0} title={<span style={{ fontSize: 14 }}>預計 {planned}</span>}>
      <span className="num" style={{ color: '#8A5A00', borderBottom: '1px dotted #8A5A00', cursor: 'help' }}>
        {actual}
      </span>
    </Tooltip>
  )
}

// 經費來源:幾乎都是學務處補助,有申請補助又還沒認定過的單先預填(承辦人可改)。
// 沒申請補助的單留空 —— 那一欄會原樣印進申請表的意見回饋,寫一句沒動到的錢是說謊
const DEFAULT_FUND_SOURCE = '學務處補助'
const seedFundSource = (item: ReviewItem | null): string =>
  item?.fundSource || ((item?.requested ?? 0) > 0 ? DEFAULT_FUND_SOURCE : '')

// 簽核紀錄的決議顯示詞(approval_records.decision;對外不得漏出英文鍵)
const DECISION_LABEL: Record<string, string> = {
  approve: '核准',
  reject: '退回',
  unlock: '解鎖',
  revoke: '撤銷',
}

// 簽核紀錄的關卡顯示詞(行政端用語,與後端 _STAGE_LABEL 一致)
const STAGE_LABEL: Record<string, string> = {
  advisor: '承辦人',
  chief: '組長',
  dean: '學務長',
}

const DECISION_COLOR: Record<string, string> = {
  approve: '#1F6B45',
  reject: '#B03A2E',
  unlock: '#1D5A9E',
  revoke: '#B03A2E',
}

/** 簽核紀錄:每一次核准/退回逐列印出,含關卡、簽核者、時間與**退回原因**。
 *
 * 依 `subject_type` 分到兩個頁籤 —— 申請的簽核歸申請側、結案的歸結案側;
 * 章軌只印每一關最後一次核准,退回與退回重送再核的那幾次都不在軌上,
 * 而那正是要查「這張單被卡在哪」時要看的。
 */
function ApprovalLog({ rows }: { rows: ReviewApproval[] }) {
  if (!rows.length) return <div style={{ fontSize: 13, color: 'var(--steel)' }}>—</div>
  return (
    <div>
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '72px minmax(0, 1fr) auto',
            gap: '4px 12px',
            fontSize: 13,
            padding: '8px 0 8px 10px',
            borderLeft: `2px solid ${DECISION_COLOR[r.decision] ?? 'var(--line)'}`,
            borderTop: i ? '1px dashed var(--line)' : undefined,
          }}
        >
          <div style={{ color: 'var(--steel)' }}>{STAGE_LABEL[r.stage] ?? r.stage}</div>
          <div>
            {/* 社團端拿不到簽核者姓名(後端刻意不給):印一格 '—' 看起來像資料掉了 */}
            {r.actor && <span style={{ fontWeight: 500 }}>{r.actor}</span>}
            <span className="num" style={{ color: 'var(--steel)' }}>{r.actor ? ' · ' : ''}{r.at}</span>
          </div>
          <div style={{ color: DECISION_COLOR[r.decision], fontWeight: 500 }}>
            {DECISION_LABEL[r.decision] ?? r.decision}
          </div>
          {r.reason && (
            <div
              style={{
                gridColumn: '2 / -1',
                background: '#FBE9E7',
                borderRadius: 4,
                padding: '6px 10px',
                fontSize: 12,
                lineHeight: 1.7,
                color: '#7D2B22',
              }}
            >
              <b style={{ color: '#B03A2E', marginRight: 4 }}>退回原因</b>
              {r.reason}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** 申請附件與結案附件:同一種呈現,檔名點開站內預覽彈窗(不另開分頁),右側附下載鈕。
 *  下載鈕不能省:預覽窗只給**不能線上看**的檔(zip、舊 .doc)下載入口,
 *  圖片與 PDF 走預覽分支,少了這顆就完全沒有地方把附件存下來 */
function FileLinks({
  files,
  onPreview,
}: {
  files: AdminFileRef[]
  onPreview: (f: AdminFileRef) => void
}) {
  if (!files.length) return <>—</>
  return (
    <>
      {files.map((f, i) => (
        <span key={f.id}>
          {i > 0 && ' · '}
          <button
            type="button"
            className="link-btn"
            style={{ color: 'var(--focus)', padding: 0 }}
            onClick={() => onPreview(f)}
          >
            {f.name}
          </button>
          <button
            type="button"
            className="link-btn"
            aria-label={`下載 ${f.name}`}
            style={{ padding: '0 4px' }}
            onClick={() => downloadEvalFile(toEvalFile(f))}
          >
            <DownloadOutlined style={{ fontSize: 12, color: 'var(--steel)' }} />
          </button>
        </span>
      ))}
    </>
  )
}

// 章面的關卡字 —— 章下方那行留給簽核者姓名,關卡名(承辦人/組長/學務長)由這個字表示
const STAGE_CHARS: [ReviewStage, string][] = [
  ['advisor', '承'],
  ['chief', '組'],
  ['dean', '長'],
]

// 章軌:**蓋不蓋章看 stamps,不看單據狀態**。
// 兩者曾各推一次 —— 狀態說「已核准」就把三顆全點亮,而姓名取自簽核紀錄,
// 舊系統遷入的 53 件只留了 1–2 位簽核者,組長與學務長那兩格就是亮的、卻沒有人名。
// status 在這裡只回答一件事:現在輪到誰(pending_* / rejected)。
// 僅三關(有申請補助)畫章軌 —— 無補助=承辦人單關即核准(後端規則),單關不畫
function stagesOf(item: ReviewItem): StampStage[] {
  const stamps = item.detail?.stamps ?? []
  const pending = stageOfStatus(item.status)
  // 退回件:第一個沒簽到的關就是被退回的那一關(組長退回時,承辦人那關已經簽過了)
  const rejectedAt =
    item.status === 'rejected'
      ? STAGE_CHARS.findIndex(([stage]) => !stamps.some((x) => x.stage === stage))
      : -1
  const all: StampStage[] = STAGE_CHARS.map(([stage, char], i) => {
    const stamp = stamps.find((x) => x.stage === stage)
    const state: StampState = stamp
      ? 'done'
      : i === rejectedAt
        ? 'rejected'
        : pending === stage
          ? 'current'
          : 'todo'
    return {
      char,
      // 還沒簽到的關卡不印關卡名 —— 那一格是留給簽核者的。
      // 退回的那一關不是在等,是已經有結論了(退回件按定義不會有核准章)
      label: state === 'rejected' ? '已退回' : stamp?.name || '等待中',
      state,
      note: stamp?.at,
      noteTitle: stamp?.atFull,
    }
  })
  // 還在跑的單子畫滿三格(後面兩關真的還會發生);已終結的只畫到最後一格有動作的關卡 ——
  // 核定 0 元即當場核准(D-16),後兩關永遠不會有人簽,標成「等待中」是等一件不會來的事
  if (pending) return all
  const last = all.map((x) => x.state !== 'todo').lastIndexOf(true)
  return all.slice(0, last + 1)
}

/** 第一關核准送出的內容:經費來源、逐項核定金額、大型活動認可;備註任一關都送 */
export interface ActivityApprovePayload {
  fundSource: string
  /** 審核備註(空字串=清空) */
  adminNote: string
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
  onCloseApprove,
  onCloseReject,
  detailStale,
  viewer = 'admin',
  onEdit,
  onGoClose,
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
  /** 結案單關:核准帶三個繳交確認;缺這兩個回呼即無結案簽核鈕(唯讀開窗) */
  onCloseApprove?: (checks: Record<CheckKey, boolean>) => Promise<unknown>
  onCloseReject?: (reason: string) => Promise<unknown>
  /** 手上的詳情不確定是最新的:繳交確認是從它推導的,不給核准。
   *  'error' 另附重試 —— 補件重送後舊快取會把新繳的算成沒繳,而那會永久落庫 */
  detailStale?: 'fetching' | 'error' | false
  /** 社團端開自己的單:收掉審核用的東西(章軌、大型認可、繳交確認、關卡說明),
   *  footer 換成社團自己的動作,申請表 PDF 走社團端端點 */
  viewer?: 'admin' | 'club'
  /** 僅 viewer='club':草稿/退回件的「繼續編輯」與已結束活動的「前往結案」 */
  onEdit?: () => void
  onGoClose?: () => void
}) {
  const { message } = App.useApp()
  const { user } = useAuth()
  // 社團端開自己的單:全程唯讀(頁面本來就不傳簽核回呼),差別在收掉哪些審核用的東西
  const isClub = viewer === 'club'
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // item 到位才聚焦:骨架模式(item=null)開窗時核准鈕尚未 render,
  // 待詳情補齊、footer 換上按鈕後再聚焦,Enter 送出才有效
  const approveRef = useModalAutoFocus(open && !!item)
  const filePreview = useFilePreview()
  // 大型活動:社團申請或管理員逕行核定;認可後行政分才享 ×3 加權。
  // 未處理的申請預設不勾(空心=待處理),認可須管理員明確勾選,避免順手核准即誤放 ×3
  const [largeApproved, setLargeApproved] = useState(item?.largeApproved ?? false)
  // 經費來源:核定了補助的案件由第一關認定(後端在核定總額 >0 時必填)
  const [fundSource, setFundSource] = useState(() => seedFundSource(item))
  // 預填值與承辦人自己打的字要分得開:核定 0 元的單只送後者(見 submitApprove)
  const [fundTouched, setFundTouched] = useState(false)
  // 審核備註:留給社團看的話,任一關都寫得動(不是第一關的認定)
  const [adminNote, setAdminNote] = useState(item?.adminNote ?? '')
  // 頁籤:結案側有東西才切得過去;null = 還沒手動切過,跟著狀態走
  const [tab, setTab] = useState<'apply' | 'close' | null>(null)
  // 繳交確認只存承辦手動改過的項目,其餘跟著推導走(詳情是非同步載入的)
  const [override, setOverride] = useState<Partial<Record<CheckKey, boolean>>>({})
  const d = item?.detail
  // 失敗但手上已有詳情 = 背景重抓失敗(TanStack 的 error 態保留既有 data,而重開同一列
  // staleTime 0 就會重抓):內容照舊、按鈕照舊,否則等於把讀得到的單變成不能簽,
  // 而且按「重試」畫面毫無變化(data 還在,error 不會被清掉)
  const detailFailed = detailError != null && !d
  // 第一關輸入框的預填:未核定即帶擬請金額(承辦幾乎都是照給或往下砍)
  const prefill = (b: { requested: number; approved: number | null }) => b.approved ?? b.requested
  // 核定金額:controlled,依預算列 id 管理
  const [approvals, setApprovals] = useState<Record<number, number>>(() =>
    Object.fromEntries((d?.budget ?? []).map((b) => [b.id, prefill(b)])),
  )
  // 補種依**單據 id**,不依物件識別:各頁都靠 key 重掛來換單,但漏掛一處而重開同一列時
  // `item` 識別不變、effect 不重跑,上一張單的經費來源與大型認可就會留在畫面上
  // (largeApproved 被留成 false 等於靜靜清掉 ×3 加權)。
  // 身分欄位每張單種一次(列表列已帶,詳情到位不覆寫,使用者編輯過的更不能覆寫);
  // 核定金額等 detail 到位才種
  const seededId = useRef<string | null>(null)
  const seededBudget = useRef<string | null>(null)
  useEffect(() => {
    if (!item) return
    if (seededId.current !== item.id) {
      seededId.current = item.id
      setLargeApproved(item.largeApproved ?? false)
      setFundSource(seedFundSource(item))
      setAdminNote(item.adminNote ?? '')
      setOverride({})
      setTab(null)
    }
    if (item.detail && seededBudget.current !== item.id) {
      seededBudget.current = item.id
      setApprovals(Object.fromEntries(item.detail.budget.map((b) => [b.id, prefill(b)])))
    }
  }, [item])

  const report = item?.report
  const photos = item?.photos ?? []
  const closeDocs = item?.closeDocs ?? []
  // 結案側:有結案資料,或有結案的簽核列(逾期手動解鎖寫的是 activity_close,
  // 那種單多半還沒送過結案 —— 只看 report 的話「誰解了這張單的鎖」兩側都看不到)
  const closeRows = (item?.detail?.approvals ?? []).filter((r) => r.isClose)
  const hasCloseSide = !!report || closeRows.length > 0
  // 預設優先開結案側;只有解鎖紀錄、還沒送結案的單留在申請側(那才是承辦要看的)
  const activeTab: 'apply' | 'close' =
    hasCloseSide ? (tab ?? (report ? 'close' : 'apply')) : 'apply'

  // 「本關」:**沒有簽核回呼就沒有簽核鈕**。這裡曾有一條「沒 onApprove 就看狀態」的展示用
  // 退路,而唯讀頁(社團活動列表、逾期清單)傳的是真資料 —— 待審的單會長出可按的核准鈕,
  // 按下去因為沒有回呼而直接跳成功訊息,一個字都沒送到後端
  const canReview = !!onApprove && !!item && canActOn(user, item.status)
  // 結案單關:與申請關卡分開判定,兩者不會同時成立(狀態互斥)
  const canCloseReview =
    !!onCloseApprove && item?.status === 'closing_pending_advisor' && canActOnClose(user)
  // 判準是**這張單簽完了沒有**,不是「我現在能不能簽」:
  // 已結案 → 顯示落庫值本身(承辦核實後勾回去的那一勾就是 ad2–ad4 的依據,
  //          再拿內容門檻篩一次會把已核准的單顯示成「沒繳」);
  // 尚未結案 → 三個旗標還是欄位預設的 true 佔位值,顯示它等於替沒人看過的單背書,
  //            一律走推導初值(落庫值 **且** 內容達門檻)+ 承辦手動改過的部分
  const decided = item?.status === 'closed'
  const checks: Record<CheckKey, boolean> =
    report && decided
      ? {
          photos: report.photosConfirmed,
          report: report.reportConfirmed,
          reflections: report.reflectionsConfirmed,
        }
      : { ...defaultConfirmations(report, photos.length), ...override }
  // 結案側:與申請值不同的實際值標色,hover 出預計值(與社團端詳情同一支 ActualValue)
  const actualTime = report ? `${report.actualStart}–${report.actualEnd}` : ''
  const timeChanged = !!report && !!d?.timeRange && !d.timeRange.includes(actualTime)
  const locationChanged = !!report && !!d?.location && report.actualLocation !== d.location
  const plannedCounts = `社員 ${d?.participantsIn ?? '—'} · 非社員 ${d?.participantsOut ?? '—'}`
  const actualCounts = report ? `社員 ${report.memberCount} · 非社員 ${report.nonMemberCount}` : ''
  const countChanged = !!report && plannedCounts !== actualCounts
  // 有申請補助,或雖沒申請但確實核了錢(遷移資料有這種列)才顯示核定;
  // 有申請卻還沒核定時 approvedTotal 是 null —— `?? 0` 會把「還沒核定」說成「核定 0 元」,
  // 連帶讓超支判定拿一個假的上限去比
  const closeHasSubsidy = showsApproved(item?.requested ?? 0, item?.approvedTotal)
  const approvedKnown = (item?.requested ?? 0) === 0 || item?.approvedTotal != null
  const overBudget =
    !!report &&
    approvedKnown &&
    report.expense > (item?.selfFundTotal ?? 0) + (item?.approvedTotal ?? 0)
  const photoShort = !!report && photos.length < MIN_PHOTOS && !report.videoUrl
  // 經費來源/逐項核定/大型認可僅第一關(承辦人)可編輯;組長/學務長關唯讀核准
  const isFirstStage = item?.status === 'pending_advisor'
  const canEdit = canReview && isFirstStage
  const selfFundTotal = d?.budget.reduce((s, b) => s + b.selfFund, 0) ?? 0
  const requestedTotal = d?.budget.reduce((s, b) => s + b.requested, 0) ?? item?.requested ?? 0
  // **唯讀欄不讀 `approvals`**:那是編輯用的 state,一開窗就被預填值(未核定=擬請)灌滿,
  // 拿它顯示等於把「還沒核定」印成「核定=擬請」——清單列與社團端同一筆都印 `—`
  const approvedTotal = (d?.budget ?? []).reduce(
    (sum, b) => sum + (canEdit ? (approvals[b.id] ?? prefill(b)) : (b.approved ?? 0)),
    0,
  )
  // 逐項都核定過才算得出總額;有一列還是 null 就印 `—`,不要湊一個看起來已核定的數字
  const approvedKnownAll = (d?.budget ?? []).every((b) => b.approved != null)
  const singleStage = requestedTotal === 0 // 無補助 → 承辦人單關即核准
  // 能不能核只看擬請(後端也擋非零核定與必填來源)
  const hasSubsidy = requestedTotal > 0
  // 看不看得到還要看實際核了多少:遷移資料有「沒申請卻核發」的列,藏掉等於承辦簽字時看不到那筆錢
  const showApproved = (d?.budget ?? []).some((b) => showsApproved(b.requested, b.approved))

  const closeReject = () => {
    setRejectOpen(false)
    setReason('')
  }

  const submitApprove = async () => {
    if (!item) return
    if (onApprove) {
      // 核定不得超過擬請(後端同一條,擬請 0 的列帶非零核定整單 422)。輸入框有 max 擋著,
      // 但預填值來自舊資料 —— 遷移列的核定可以大於擬請,沒有輸入框可改就會卡死送不出去
      const budget = (d?.budget ?? []).map((b) => ({
        itemId: b.id,
        approvedSubsidy: Math.min(approvals[b.id] ?? prefill(b), b.requested),
      }))
      // 必填與否看**送出去的**核定總額,不是畫面上的 approvedTotal —— 遷移列會被 min 夾掉,
      // 兩者對不起來就會變成前端放行、後端 422,而承辦人看到的是一句他改不掉的錯誤(D-16)
      const granted = budget.reduce((sum, b) => sum + b.approvedSubsidy, 0)
      if (isFirstStage && granted > 0 && !fundSource.trim()) {
        message.error('核定補助的案件必須認定經費來源')
        return
      }
      // 核定 0 元 = 這張單不動到學校的錢(D-16):承辦人沒動過那一格就送原值,
      // 不要把預填的「學務處補助」寫進去 —— 它會原樣印進申請表的意見回饋。
      // 擬請 >0 但整單核成 0 的單走的正是這條(遷移資料 1,073 件是這樣核准的)
      const source = granted > 0 || fundTouched ? fundSource.trim() : (item.fundSource ?? '')
      setSubmitting(true)
      try {
        await onApprove({
          fundSource: source,
          adminNote,
          budget,
          largeApproved,
        })
      } catch (e) {
        message.error(e instanceof Error ? e.message : '操作失敗')
        return
      } finally {
        setSubmitting(false)
      }
    }
    message.success(`已核准「${item.name}」`)
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

  const submitCloseApprove = async () => {
    if (!item || !onCloseApprove) return
    setSubmitting(true)
    try {
      await onCloseApprove({
        photos: checks.photos,
        report: checks.report,
        reflections: checks.reflections,
      })
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失敗')
      return
    } finally {
      setSubmitting(false)
    }
    message.success(`已核准「${item.name}」結案`)
    onClose()
  }

  const submitCloseReject = async () => {
    if (!item || !onCloseReject) return
    if (!reason.trim()) {
      message.error('退回原因為必填')
      return
    }
    setSubmitting(true)
    try {
      await onCloseReject(reason.trim())
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失敗')
      return
    } finally {
      setSubmitting(false)
    }
    message.success(`已退回「${item.name}」結案`)
    closeReject()
    onClose()
  }

  // 繳交確認與簽核鈕同一列(靠左):未勾之項目評鑑以 0 分計,承辦是連著這兩顆鈕一起決定的。
  // 只在結案側出現 —— 申請側的 footer 不該長出結案的東西
  const confirmRow =
    activeTab === 'close' && report ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--steel)' }}>繳交確認</span>
        {SUBMISSION_CHECKS.map((c) => (
          <Checkbox
            key={c.key}
            checked={checks[c.key]}
            disabled={!canCloseReview}
            onChange={(e) => setOverride((prev) => ({ ...prev, [c.key]: e.target.checked }))}
          >
            {c.label}
          </Checkbox>
        ))}
      </div>
    ) : null

  const hasBudget = !!d && d.budget.length > 0
  // 接線資料帶可下載連結;mock 僅檔名
  const files = d?.attachmentFiles

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      // 窗的大小只由「有無經費」決定:切頁籤、內容多寡都不改變它,
      // 高度固定後內容自己捲 —— 開同一批單子時每次都停在同一個位置
      width={hasBudget ? 1080 : 640}
      styles={{ body: { height: 'min(560px, 58vh)', overflowY: 'auto' } }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 26 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{item?.name ?? pendingName ?? ''}</span>
          {item && (
            <>
              {/* 本關可簽核時,徽章即時反映下方「認可為大型活動」勾選 */}
              <LargeBadge applied={item.isLarge} approved={canEdit ? largeApproved : item.largeApproved} />
              <StatusPill status={item.status} />
              {/* 沒有結案資料就切不過去(反灰);有的話預設就開在結案側 */}
              <Segmented
                size="small"
                value={activeTab}
                onChange={(v) => setTab(v as 'apply' | 'close')}
                options={[
                  { value: 'apply', label: '申請' },
                  { value: 'close', label: '結案', disabled: !hasCloseSide },
                ]}
              />
            </>
          )}
          <span style={{ flex: 1 }} />
          {/* 單關(無補助)不畫章軌:只有一顆章沒有資訊量,徒佔標題列空間。
              社團端一律不畫 —— 那是審核人的簽章,而社團端根本拿不到姓名 */}
          {item && !singleStage && !isClub && <StampTrail stages={stagesOf(item)} />}
          {item && (
            <DownloadMenu
              items={[
                { key: 'photos', label: '下載照片檔', disabled: photos.length === 0 },
                { key: 'apply', label: '下載社團活動申請表' },
              ]}
              onClick={({ key }) => {
                if (key === 'photos') {
                  downloadPhotosZip(`${item.name}_照片`, photos.map(toEvalFile)).catch((e: unknown) =>
                    message.error(e instanceof Error ? e.message : '照片下載失敗'),
                  )
                  return
                }
                downloadEvalFile(activityApplyPdf(item, isClub ? 'club' : 'admin'))
              }}
            />
          )}
        </div>
      }
      footer={
        // 看不到詳情就不給簽核鈕:核准要靠 detail 的 budget(否則整單核定 0 元),
        // 退回也不該在讀不到申請內容的情況下按。唯讀開窗(逾期列、已核准或非本關的單)
        // 本來就沒有鈕,別叫人去審核 —— 頁面對每一列都傳 onApprove,判準只能是 canReview
        detailFailed ? (
          <div style={{ fontSize: 12, color: 'var(--steel)' }}>
            詳細資訊載入失敗，請重試{canReview ? '後再審核' : ''}
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
              核准
            </Button>
          </div>
        ) : canCloseReview ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {confirmRow}
            <span style={{ flex: 1 }} />
            {detailStale && (
              <span style={{ fontSize: 12, color: 'var(--steel)' }}>
                {detailStale === 'error' ? (
                  <>
                    結案內容更新失敗{' '}
                    <Button type="link" size="small" style={{ padding: 0 }} onClick={onRetryDetail}>
                      重試
                    </Button>
                  </>
                ) : (
                  '結案內容更新中'
                )}
              </span>
            )}
            <Button danger style={{ height: 38 }} disabled={submitting} onClick={() => setRejectOpen(true)}>
              退回
            </Button>
            <Button
              type="primary"
              ref={approveRef}
              style={{ height: 38 }}
              // 手上這份不確定是最新的就不給核准:繳交確認是從它推導的,寫下去沒有回頭路
              disabled={!report || !!detailStale}
              loading={submitting && !rejectOpen}
              onClick={() => void submitCloseApprove()}
            >
              核准結案
            </Button>
          </div>
        ) : isClub ? (
          // 社團端:繳交確認與關卡說明都是給承辦看的,這裡換成社團自己的動作
          item && (item.status === 'draft' || item.status === 'rejected') && onEdit ? (
            <Button type="primary" onClick={onEdit}>
              {item.status === 'rejected' ? '編輯重送' : '繼續編輯'}
            </Button>
          ) : item?.canClose && onGoClose ? (
            <Button type="primary" onClick={onGoClose}>前往結案</Button>
          ) : null
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {confirmRow}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--steel)' }}>
              {!item
                ? '載入中…'
                : item.status === 'rejected'
                  ? '此申請已退回社團修正'
                  : stageOfStatus(item.status)
                    ? '非本關卡待審單據，僅供查看'
                    : '僅供查看'}
            </span>
          </div>
        )
      }
    >
      {/* 詳情載入失敗:整塊改為錯誤呈現。Skeleton 沒有終點,不接錯誤就是永遠轉圈;
          而列表列那半份基本資料也不能留 —— 經費逐項與附件都不在,「地點 —」看起來就像沒填 */}
      {detailFailed && (
        <div style={{ marginTop: 8 }}>
          <QueryError compact title="活動詳細資訊載入失敗" error={detailError} onRetry={onRetryDetail} />
        </div>
      )}
      {/* 詳情未到位先鋪 Skeleton(彈窗立即開啟,內容漸進補齊) */}
      {!item && !detailFailed && <Skeleton active paragraph={{ rows: 6 }} style={{ marginTop: 8 }} />}
      {/* 有經費才走雙欄:左=基本資料,右=經費逐項核定。欄數只看有無經費,不隨頁籤變 */}
      {item && !detailFailed && (
      <div
        style={{
          display: 'grid',
          // 固定兩欄,不用 auto-fit:跨欄的簽核紀錄(1 / -1)佔滿每一軌,auto-fit 因此
          // 不再收掉空軌 —— 1080 寬排得下三軌,兩欄就各縮成 320 並在右側留一整軌空白
          gridTemplateColumns: hasBudget ? 'repeat(2, minmax(0, 1fr))' : '1fr',
          gap: '8px 28px',
          marginTop: 8,
        }}
      >
        {activeTab === 'apply' && (
        <>
        <div>
          <SectionTitle first>基本資料</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '8px 12px', fontSize: 13 }}>
            <div style={detailLabel}>{item.club ? '社團' : '類型'}</div>
            <div>{[item.club, item.type].filter(Boolean).join(' · ')}</div>
            <div style={detailLabel}>申請時間</div>
            <div>
              <span className="num">{d?.submittedAt ?? '—'}</span>
              {d?.submittedBy ? ` · ${d.submittedBy}` : ''}
            </div>
            <div style={detailLabel}>活動時間</div><div className="num">{d?.timeRange ?? item.date}</div>
            {/* 草稿可以只填一半,而地點後端是 str(空字串);`??` 只擋 null,
                空字串會印成一格空白,看起來像畫面掉了 */}
            <div style={detailLabel}>活動地點</div><div>{d?.location || '—'}</div>
            <div style={detailLabel}>預期人數</div>
            <div>
              社員 <span className="num">{d?.participantsIn ?? '—'}</span> · 非社員{' '}
              <span className="num">{d?.participantsOut ?? '—'}</span>
            </div>
            {/* 經費來源:有申請補助時第一關必填認定(submitApprove 同一條判定)。
                只有「能不能改」看 hasSubsidy —— 認定過的來源不論有沒有經費明細都印出來,
                掛在經費明細下的話沒申請補助的單子連承辦人寫了什麼都看不到 */}
            <div style={detailLabel}>經費來源</div>
            <div>
              {canEdit && hasSubsidy ? (
                <Input
                  size="small"
                  value={fundSource}
                  onChange={(e) => {
                    setFundTouched(true)
                    setFundSource(e.target.value)
                  }}
                  placeholder={DEFAULT_FUND_SOURCE}
                />
              ) : (
                item.fundSource || '—'
              )}
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
              {files?.length ? (
                <FileLinks files={files} onPreview={(f) => filePreview.preview(toEvalFile(f))} />
              ) : d?.attachments.length ? (
                d.attachments.map((f, i) => (
                  <span key={f}>
                    {i > 0 && ' · '}
                    <button type="button" className="link-btn" style={{ color: 'var(--focus)', padding: 0 }}>
                      {f}
                    </button>
                  </span>
                ))
              ) : (
                '—'
              )}
            </div>
            {/* 審核備註:管理員留給社團的話,**任一關都寫得動**(不像經費來源是第一關的認定)。
                原樣印進申請表的意見回饋、社團端詳情也看得到,所以社團端有值才佔一列 */}
            {(canReview || !!item.adminNote || !isClub) && (
              <>
                <div style={detailLabel}>備註</div>
                <div>
                  {canReview ? (
                    <Input.TextArea
                      size="small"
                      autoSize={{ minRows: 3, maxRows: 10 }}
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      maxLength={1000}
                      placeholder="給社團看的說明，會印在申請表的意見回饋（可留空）"
                    />
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                      {item.adminNote || '—'}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 大型活動認可是承辦人的決定,社團端只在標題徽章看結果 */}
          {item.type === '活動' && !isClub && (
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--paper)', borderRadius: 6 }}>
              <Checkbox
                checked={largeApproved}
                disabled={!canEdit}
                onChange={(e) => setLargeApproved(e.target.checked)}
              >
                認可為大型活動
              </Checkbox>
            </div>
          )}

          {isClub && item.status === 'locked' && (
            <div style={{ fontSize: 13, color: '#A3341F', marginTop: 16 }}>
              已逾期並鎖定，更多疑問請洽學務處
            </div>
          )}

        </div>

        {hasBudget && (
          <div>
            <SectionTitle first>經費明細</SectionTitle>
            <table className="tb dense fixed">
              {/* table-layout: fixed 要有明確寬度,但寬度由資料決定:自籌/擬請各看自己的最大值,
                  核定跟擬請同寬(核定 ≤ 擬請)再加輸入框的內距與邊框。合計依定義 ≥ 任一明細,
                  要一起算進去。其餘全給摘要 —— 遷移資料的說明很長 */}
              <Cols
                widths={[
                  'auto',
                  numColWidth([...d.budget.map((b) => b.selfFund), selfFundTotal], CELL_PAD),
                  numColWidth([...d.budget.map((b) => b.requested), requestedTotal], CELL_PAD),
                  ...(showApproved
                    ? [numColWidth([...d.budget.map((b) => b.requested), approvedTotal], CELL_PAD + INPUT_CHROME)]
                    : []),
                ]}
              />
              <thead>
                <tr>
                  <th scope="col" style={{ paddingLeft: 0 }}>摘要</th>
                  <th scope="col" className="r">自籌</th>
                  <th scope="col" className="r" style={showApproved ? undefined : { paddingRight: 0 }}>擬請</th>
                  {showApproved && <th scope="col" className="r" style={{ paddingRight: 0 }}>核定</th>}
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
                    <td className="r num" style={showApproved ? undefined : { paddingRight: 0 }}>
                      {b.requested.toLocaleString()}
                    </td>
                    {showApproved && (
                    <td style={{ paddingRight: 0 }}>
                      {/* 擬請 0 的列核不出金額(max=0),輸入框只會是個永遠打不動的 0 */}
                      {canEdit && b.requested > 0 ? (
                        <InputNumber
                          size="small"
                          style={{ width: '100%' }}
                          min={0}
                          max={b.requested}
                          precision={0}
                          value={approvals[b.id] ?? prefill(b)}
                          onChange={(v) => setApprovals((prev) => ({ ...prev, [b.id]: v ?? 0 }))}
                          controls={false}
                        />
                      ) : (
                        <div className="r num" style={{ textAlign: 'right' }}>
                          {approvedText(b.approved)}
                        </div>
                      )}
                    </td>
                    )}
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
                  <td
                    className="r num"
                    style={{ borderBottom: 'none', padding: showApproved ? '10px 8px 0 0' : '10px 0 0' }}
                  >
                    {requestedTotal.toLocaleString()}
                  </td>
                  {showApproved && (
                    <td className="r num" style={{ borderBottom: 'none', padding: '10px 0 0', fontWeight: 600 }}>
                      {canEdit || approvedKnownAll ? approvedTotal.toLocaleString() : '—'}
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {/* 申請側只印申請的簽核列;結案那幾筆歸結案頁籤(approval_records.subject_type) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <SectionTitle>簽核紀錄</SectionTitle>
          <ApprovalLog rows={(d?.approvals ?? []).filter((r) => !r.isClose)} />
        </div>
        </>
        )}

        {activeTab === 'close' && (
        <>
        {report && (
        <>
        <div>
          <SectionTitle first>結案成果</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '8px 12px', fontSize: 13 }}>
            <div style={detailLabel}>申請時間</div><div className="num">{d?.submittedAt ?? '—'}</div>
            <div style={detailLabel}>活動時間</div>
            <div>
              <span className="num">{item.date}</span>{' '}
              {timeChanged ? (
                <ActualValue actual={actualTime} planned={d?.timeRange ?? '未填'} />
              ) : (
                <span className="num">{actualTime}</span>
              )}
            </div>
            <div style={detailLabel}>活動地點</div>
            <div>
              {locationChanged ? (
                <ActualValue actual={report.actualLocation} planned={d?.location || '未填'} />
              ) : (
                report.actualLocation
              )}
            </div>
            <div style={detailLabel}>實際人數</div>
            <div>
              {countChanged ? (
                <ActualValue actual={actualCounts} planned={plannedCounts} />
              ) : (
                <span className="num">{actualCounts}</span>
              )}
            </div>
            <div style={detailLabel}>經費</div>
            <div>
              自籌 <span className="num">{fmtMoney(item.selfFundTotal ?? 0)}</span>
              {closeHasSubsidy && (
                <> · 核定 <span className="num">{approvedText(item.approvedTotal, fmtMoney)}</span></>
              )}
              {' '}· 實支{' '}
              <span className="num" style={overBudget ? { color: '#C13B34', fontWeight: 500 } : undefined}>
                {fmtMoney(report.expense)}
              </span>
            </div>
            <div style={detailLabel}>{highlightsLabel(item.type)}</div>
            <div style={{ lineHeight: 1.7 }}>{report.highlights}</div>
            <div style={detailLabel}>達成目標</div>
            <div style={{ lineHeight: 1.7 }}>{report.goals}</div>
            <div style={detailLabel}>其他成果</div>
            <div style={{ lineHeight: 1.7 }}>{report.others}</div>
            {report.reviewMeeting && (
              <>
                <div style={detailLabel}>檢討會議</div>
                <div style={{ lineHeight: 1.7 }}>
                  <span className="num">{report.reviewDate}</span> · 與會{' '}
                  <span className="num">{report.reviewAttendees}</span> 人
                  <div style={{ fontSize: 12, color: 'var(--steel)' }}>討論：{report.reviewTopics}</div>
                  <div style={{ fontSize: 12, color: 'var(--steel)' }}>決議：{report.reviewConclusion}</div>
                </div>
              </>
            )}
            <div style={detailLabel}>結案附件</div>
            <div>
              <FileLinks files={closeDocs} onPreview={(f) => filePreview.preview(toEvalFile(f))} />
            </div>
          </div>
        </div>

        <div>
          <SectionTitle first>
            活動照片（
            <Tooltip title={photoShort ? `未達 ${MIN_PHOTOS} 張且無影片連結` : undefined}>
              <span
                className="num"
                style={photoShort ? { color: '#C13B34', cursor: 'help' } : undefined}
              >
                {photos.length}
              </span>
            </Tooltip>
            ）張
          </SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                className="link-btn"
                style={{ padding: 0 }}
                title={p.name}
                aria-label={`預覽 ${p.name}`}
                onClick={() => filePreview.preview(toEvalFile(p))}
              >
                <img
                  src={p.url}
                  alt={p.name}
                  loading="lazy"
                  width={96}
                  height={72}
                  style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                />
              </button>
            ))}
          </div>
          <SectionTitle>成果影片</SectionTitle>
          <div style={{ fontSize: 13, wordBreak: 'break-all' }}>
            {report.videoUrl ? (
              <a href={report.videoUrl} target="_blank" rel="noopener noreferrer">{report.videoUrl}</a>
            ) : (
              <span style={{ color: 'var(--steel)' }}>—</span>
            )}
          </div>
          <SectionTitle>
            學習心得（<span className="num">{report.reflections.length}</span> 人）
          </SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {report.reflections.map((r, i) => (
              <div key={i} style={{ padding: '8px 12px', background: 'var(--paper)', borderRadius: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>{r.name}</span>
                <span style={{ color: 'var(--steel)', fontSize: 12 }}>（{r.dept}）</span>
                <div style={{ lineHeight: 1.7, marginTop: 2 }}>{r.text}</div>
              </div>
            ))}
          </div>
        </div>

        </>
        )}

        <div style={{ gridColumn: '1 / -1' }}>
          <SectionTitle>簽核紀錄</SectionTitle>
          <ApprovalLog rows={closeRows} />
        </div>
        </>
        )}
      </div>
      )}

      <Modal
        open={rejectOpen}
        title={canCloseReview ? '退回結案' : '退回申請'}
        okText="確認退回"
        destroyOnHidden
        confirmLoading={submitting}
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onOk={() => void (canCloseReview ? submitCloseReject() : submitReject())}
        onCancel={closeReject}
      >
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 8 }}>
          退回原因
        </div>
        <Input.TextArea
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例:經費明細第 3 項未附估價單"
        />
      </Modal>
      {filePreview.node}
    </Modal>
  )
}

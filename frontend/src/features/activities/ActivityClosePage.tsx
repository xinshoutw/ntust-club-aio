import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { App, Button, DatePicker, Input, InputNumber, Select, Spin, TimePicker, Tooltip, Upload } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { InfoCircleOutlined, RightOutlined, UploadOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { blurLeavesRow } from '../../lib/form'
import { IMAGE_ACCEPT, fmtMB, isImageFile, sha256 } from '../../lib/uploads'
import {
  deleteActivityPhoto,
  saveCloseDraft,
  submitClose,
  uploadActivityPhoto,
  useActivityDetail,
  useActivityList,
  useInvalidateActivities,
  type ClubActivity,
  type ClubActivityDetail,
  type CloseSubmitInput,
} from '../../api/activities'
import { useClubConfig } from '../../api/clubConfig'
import type { EvalFile } from '../eval/types'
import type { Reflection } from './types'
import { TIME_RANGE_SEP, dateRangeText } from './utils'
import './actform.css'

interface ReflectRow extends Reflection {
  key: number
}

// 送出前暫存於前端的照片(含預覽 URL 與內容雜湊,供去重)
interface PhotoBag {
  key: number
  file: File
  url: string
  hash: string
}

const isReflectEmpty = (r: ReflectRow) => !r.name.trim() && !r.dept.trim() && !r.text.trim()
const MIN_REFLECTIONS = 3
const MIN_PHOTOS = 5

const label: React.CSSProperties = { fontSize: 13, fontWeight: 500, marginBottom: 6 }
const requiredMark = <span style={{ color: '#C13B34' }}> *</span>

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

const toTime = (s?: string): Dayjs | null => {
  if (!s) return null
  const t = dayjs(s, 'HH:mm')
  return t.isValid() ? t : null
}

// 申請的預估時間 '10:00–16:00'(容忍 -/—)→ [開始, 結束]
const plannedTimes = (tr?: string): [string, string] => {
  const [a = '', b = ''] = (tr ?? '').split(TIME_RANGE_SEP).map((t) => t.trim())
  return [a, b]
}

// 活動結案(側欄頁):選擇可結案(已核准且已結束)之活動 → 成果調查(預填申請值)+ 心得 ≥3 + 照片/影片/支出
// 除影片連結外全必填;送出後由承辦人審核,結案通過始計入評鑑行政分
export default function ActivityClosePage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  // 已核准清單由伺服器 status 參數縮小,結案資格(已結束且未鎖定)採後端推導欄位 can_close
  const approvedQuery = useActivityList({ status: 'approved' })
  const closable = (approvedQuery.data ?? []).filter((a) => a.canClose)
  const rawId = params.get('id')
  const selectedId = rawId ? Number(rawId) : undefined
  const activity = closable.find((a) => a.id === selectedId)
  const detailQuery = useActivityDetail(activity?.id)
  // 照片加總上限來自後端組態(system_settings 為權威);
  // 表單以組態載入為前置條件,前端不放保底常數
  const configQuery = useClubConfig()

  return (
    <div>
      <PageHeader
        title="活動結案"
        extra={
          <Select
            style={{ width: 380 }}
            placeholder="選擇已核准之活動"
            value={activity?.id}
            onChange={(id) => setParams({ id: String(id) }, { replace: true })}
            options={closable.map((a) => ({ value: a.id, label: `${a.name}(${dateRangeText(a)})` }))}
          />
        }
      />

      {/* 清單載入失敗:下拉與列表同源,一併以錯誤呈現(避免誤看成「沒有可結案的活動」) */}
      {!activity && approvedQuery.isError && (
        <div style={{ marginTop: 20 }}>
          <QueryError title="可結案活動載入失敗" error={approvedQuery.error} onRetry={() => void approvedQuery.refetch()} />
        </div>
      )}

      {/* 未選活動:直接列出可結案的活動供點選 */}
      {!activity && !approvedQuery.isError && (
        <Spin spinning={approvedQuery.isPending}>
          {closable.length > 0 && (
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {closable.map((a) => (
                <div
                  key={a.id}
                  className="card click-tint"
                  role="button"
                  tabIndex={0}
                  onClick={() => setParams({ id: String(a.id) }, { replace: true })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setParams({ id: String(a.id) }, { replace: true })
                    }
                  }}
                  style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
                >
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 500 }}>{a.name}</span>
                      {a.hasCloseDraft && (
                        <span style={{ fontSize: 11, color: 'var(--steel)', border: '1px solid var(--line)', borderRadius: 4, padding: '0 4px' }}>
                          結案草稿
                        </span>
                      )}
                    </div>
                    <div className="num" style={{ fontSize: 12, color: 'var(--steel)', marginTop: 3 }}>
                      {dateRangeText(a)}
                      {a.timeRange ? ` ${a.timeRange}` : ''}
                      {a.location ? ` · ${a.location}` : ''}
                    </div>
                  </div>
                  <RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} />
                </div>
              ))}
            </div>
          )}
          {!approvedQuery.isPending && closable.length === 0 && (
            <div className="card" style={{ marginTop: 20, padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--steel)' }}>
              目前沒有可結案的活動
            </div>
          )}
        </Spin>
      )}

      {activity &&
        (detailQuery.data && configQuery.data ? (
          <CloseForm
            key={activity.id}
            activity={activity}
            detail={detailQuery.data}
            closePhotoBytes={configQuery.data.uploadLimits.closePhotoBytes}
            onDone={() => navigate('/activities')}
          />
        ) : detailQuery.isError ? (
          <div style={{ marginTop: 20 }}>
            <QueryError title="活動資料載入失敗" error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />
          </div>
        ) : configQuery.isError ? (
          <div style={{ marginTop: 20 }}>
            <QueryError title="系統組態載入失敗" error={configQuery.error} onRetry={() => void configQuery.refetch()} />
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <Spin />
          </div>
        ))}
    </div>
  )
}

function CloseForm({
  activity,
  detail,
  closePhotoBytes,
  onDone,
}: {
  activity: ClubActivity
  detail: ClubActivityDetail
  closePhotoBytes: number
  onDone: () => void
}) {
  const { message } = App.useApp()
  const invalidate = useInvalidateActivities()
  const d = detail.closeDraft
  const [plannedStart, plannedEnd] = plannedTimes(activity.timeRange)

  const [memberCount, setMemberCount] = useState<number | null>(d?.memberCount ?? null)
  const [nonMemberCount, setNonMemberCount] = useState<number | null>(d?.nonMemberCount ?? null)
  // 實際時間/地點:預填申請時的預估值(草稿優先),placeholder 亦顯示預估值
  const [actualStart, setActualStart] = useState<string>(d?.actualStart ?? plannedStart)
  const [actualEnd, setActualEnd] = useState<string>(d?.actualEnd ?? plannedEnd)
  const [actualLocation, setActualLocation] = useState<string>(d?.actualLocation ?? activity.location)
  const [highlights, setHighlights] = useState(d?.highlights ?? '')
  const [goals, setGoals] = useState(d?.goals ?? '')
  const [others, setOthers] = useState(d?.others ?? '')
  const [reviewMeeting, setReviewMeeting] = useState<boolean>(d?.reviewMeeting ?? false)
  const [reviewDate, setReviewDate] = useState(d?.reviewDate ?? '')
  const [reviewAttendees, setReviewAttendees] = useState<number | null>(d?.reviewAttendees ?? null)
  const [reviewTopics, setReviewTopics] = useState(d?.reviewTopics ?? '')
  const [reviewConclusion, setReviewConclusion] = useState(d?.reviewConclusion ?? '')
  const [videoLink, setVideoLink] = useState(d?.videoLink ?? '')
  // 自籌與擬請皆為 0 → 實際支出自動預填 0(仍可修改)
  const budgetTotal = activity.selfFundTotal + activity.requestedTotal
  const [expense, setExpense] = useState<number | null>(d?.expense ?? (budgetTotal === 0 ? 0 : null))
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null)

  // 送出驗證未過的欄位集合:對應欄位標紅框,修改該欄即解除
  const [errors, setErrors] = useState<ReadonlySet<string>>(new Set())
  const err = (k: string) => (errors.has(k) ? ('error' as const) : undefined)
  const clearErr = (k: string) =>
    setErrors((s) => {
      if (!s.has(k)) return s
      const n = new Set(s)
      n.delete(k)
      return n
    })

  const keyRef = useRef(0)
  const nextKey = () => ++keyRef.current
  const [reflects, setReflects] = useState<ReflectRow[]>(() => {
    // 草稿為 opaque JSON;缺欄位一律補空字串:name/dept/text 為 undefined 時
    // isReflectEmpty 的 .trim() 會讓整頁白畫面
    const saved = (d?.reflections ?? []).map((r) => ({
      key: nextKey(),
      name: r?.name ?? '',
      dept: r?.dept ?? '',
      text: r?.text ?? '',
    }))
    const blanks = Math.max(1, MIN_REFLECTIONS - saved.length)
    return [...saved, ...Array.from({ length: blanks }, () => ({ key: nextKey(), name: '', dept: '', text: '' }))]
  })

  // 照片一律於送出結案時才上傳,不進草稿,在此之前僅暫存於前端。
  // 頁內去重以 SHA-256、加總容量上限皆於選檔時檢核;跨活動重複由後端 sha256 於送出時拒絕。
  // APPROVED 狀態下 detail.photos 只會是「前次送出失敗殘留」的孤兒照片:
  // 顯示為可移除的既有照片(佔加總與張數),使用者才能回收額度、避免重選同張被去重卡死
  const [existing, setExisting] = useState<EvalFile[]>(() => detail.photos)
  const existingRef = useRef(existing)
  existingRef.current = existing
  const [photos, setPhotos] = useState<PhotoBag[]>([])
  const photoKeyRef = useRef(0)
  const photoQueue = useRef(Promise.resolve())
  // eager-ref(比照 AttachmentArea):寫入走 commitPhotos 同步 ref,
  // 佇列任務不受 render 時序影響——連選多張時第二個任務不再讀到過期清單
  const photosRef = useRef(photos)
  photosRef.current = photos
  const commitPhotos = (next: PhotoBag[]) => {
    photosRef.current = next
    setPhotos(next)
  }
  const [processing, setProcessing] = useState(0)

  // 卸載時釋放所有預覽 URL(避免記憶體洩漏)
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  const addPhoto = (f: File) => {
    setProcessing((n) => n + 1)
    photoQueue.current = photoQueue.current.then(async () => {
      try {
        if (!(await isImageFile(f))) {
          message.error(`「${f.name}」不是有效的圖片檔`)
          return
        }
        const cur = photosRef.current
        const total =
          cur.reduce((s, p) => s + p.file.size, 0) +
          existingRef.current.reduce((s, p) => s + p.size, 0)
        if (total + f.size > closePhotoBytes) {
          message.error(`照片合計超過 ${Math.round(closePhotoBytes / 1024 / 1024)} MB 上限`)
          return
        }
        const hash = await sha256(f)
        if (
          photosRef.current.some((p) => p.hash === hash) ||
          existingRef.current.some((p) => p.hash === hash)
        ) {
          message.error(`「${f.name}」與已選照片內容相同,已略過`)
          return
        }
        const item: PhotoBag = { key: ++photoKeyRef.current, file: f, url: URL.createObjectURL(f), hash }
        commitPhotos([...photosRef.current, item])
        clearErr('photos')
      } catch (e) {
        message.error(`「${f.name}」處理失敗:${errMsg(e)}`)
      } finally {
        setProcessing((n) => n - 1)
      }
    })
  }

  const removePhoto = (key: number) => {
    const target = photosRef.current.find((p) => p.key === key)
    if (target) URL.revokeObjectURL(target.url)
    commitPhotos(photosRef.current.filter((p) => p.key !== key))
  }

  // 既有照片=前次送出失敗的殘留,移除即後端刪檔(回收加總額度)
  const removeExisting = async (f: EvalFile) => {
    try {
      await deleteActivityPhoto(activity.id, f.id)
      setExisting((xs) => xs.filter((x) => x.id !== f.id))
      invalidate()
      message.success('已移除照片')
    } catch (e) {
      message.error(errMsg(e))
    }
  }

  // 自動增列:填寫尾列即補一列;blur 離開列時移除空列(保底 3 列)
  const setReflect = (key: number, patch: Partial<Reflection>) => {
    setReflects((rs) => {
      const next = rs.map((r) => (r.key === key ? { ...r, ...patch } : r))
      if (!isReflectEmpty(next[next.length - 1])) next.push({ key: nextKey(), name: '', dept: '', text: '' })
      return next
    })
  }
  const compactReflects = () =>
    setReflects((rs) => {
      const next = [...rs.filter((r) => !isReflectEmpty(r)), { key: nextKey(), name: '', dept: '', text: '' }]
      while (next.length < MIN_REFLECTIONS) next.push({ key: nextKey(), name: '', dept: '', text: '' })
      return next
    })

  const filledReflects = reflects.filter((r) => !isReflectEmpty(r))

  const buildDraftReport = (): NonNullable<ClubActivityDetail['closeDraft']> => ({
    memberCount: memberCount ?? undefined,
    nonMemberCount: nonMemberCount ?? undefined,
    actualStart,
    actualEnd,
    actualLocation: actualLocation.trim(),
    highlights: highlights.trim(),
    goals: goals.trim(),
    others: others.trim(),
    reviewMeeting,
    reviewDate,
    reviewAttendees: reviewAttendees ?? undefined,
    reviewTopics: reviewTopics.trim(),
    reviewConclusion: reviewConclusion.trim(),
    videoLink: videoLink.trim(),
    expense: expense ?? undefined,
    reflections: filledReflects.map(({ name, dept, text }) => ({ name: name.trim(), dept: dept.trim(), text: text.trim() })),
  })

  // 草稿寫 DB 跨裝置續填;照片已即時上傳,不受草稿影響
  const saveDraft = async () => {
    setBusy('draft')
    try {
      await saveCloseDraft(activity.id, buildDraftReport())
      invalidate()
      message.success('已暫存結案草稿')
      onDone()
    } catch (e) {
      message.error(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const submit = async () => {
    if (processing > 0) {
      message.error('照片處理中,請稍候再送出')
      return
    }
    // 除影片連結外全必填:一次收集所有缺漏欄位,全部標紅框,訊息提示第一項
    const missing: [key: string, msg: string][] = []
    if (memberCount == null) missing.push(['memberCount', '請填寫「實際社員人數」'])
    if (nonMemberCount == null) missing.push(['nonMemberCount', '請填寫「實際非社員人數」'])
    if (!actualStart) missing.push(['actualStart', '請填寫「實際開始時間」'])
    if (!actualEnd) missing.push(['actualEnd', '請填寫「實際結束時間」'])
    if (!actualLocation.trim()) missing.push(['actualLocation', '請填寫「實際地點」'])
    if (!highlights.trim()) missing.push(['highlights', '請填寫「活動重點」'])
    if (!goals.trim()) missing.push(['goals', '請填寫「如何達成活動目標」'])
    if (!others.trim()) missing.push(['others', '請填寫「其他執行狀況與成果」'])
    if (reviewMeeting) {
      if (!reviewDate) missing.push(['reviewDate', '請填寫「檢討會日期」'])
      if (reviewAttendees == null) missing.push(['reviewAttendees', '請填寫「與會人數」'])
      if (!reviewTopics.trim()) missing.push(['reviewTopics', '請填寫「討論事項」'])
      if (!reviewConclusion.trim()) missing.push(['reviewConclusion', '請填寫「內容決議」'])
    }
    const complete = filledReflects.filter((r) => r.name.trim() && r.dept.trim() && r.text.trim())
    if (complete.length < filledReflects.length) {
      missing.push(['reflections', '學習心得每列的姓名、系級與內容皆為必填'])
    } else if (complete.length < MIN_REFLECTIONS) {
      missing.push(['reflections', `學習心得至少需 ${MIN_REFLECTIONS} 位本校學生`])
    }
    if (existing.length + photos.length === 0) missing.push(['photos', '請上傳「活動照片」'])
    if (expense == null) missing.push(['expense', '請填寫「實際支出」'])
    if (missing.length === 0) {
      // 時間先後僅單日活動可比較:跨日活動(如 18:00–翌日 10:00)整段合法(後端同規則)
      if (
        (!activity.endDate || activity.endDate === activity.date) &&
        !dayjs(actualEnd, 'HH:mm').isAfter(dayjs(actualStart, 'HH:mm'))
      ) {
        missing.push(['actualEnd', '實際結束時間須晚於實際開始時間'])
      }
      const video = videoLink.trim()
      if (video && !/^https?:\/\/\S+$/i.test(video)) {
        missing.push(['videoLink', '影片連結格式不正確'])
      }
    }
    if (missing.length) {
      setErrors(new Set(missing.map(([k]) => k)))
      message.error(missing[0][1])
      // 捲動到第一個紅框欄位
      setTimeout(() => {
        document
          .querySelector('.ant-input-status-error, .ant-input-number-status-error, .ant-picker-status-error, .area-error')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 0)
      return
    }
    setErrors(new Set())
    if (existing.length + photos.length < MIN_PHOTOS && !videoLink.trim()) {
      message.warning(`照片未達 ${MIN_PHOTOS} 張且無影片連結，評鑑項目「照片 / 影片」將不計分`)
    }

    const body: CloseSubmitInput = {
      memberCount: memberCount!,
      nonMemberCount: nonMemberCount!,
      actualStart,
      actualEnd,
      actualLocation: actualLocation.trim(),
      highlights: highlights.trim(),
      goals: goals.trim(),
      others: others.trim(),
      reviewMeeting,
      reviewDate: reviewMeeting ? reviewDate : undefined,
      reviewAttendees: reviewMeeting ? reviewAttendees! : undefined,
      reviewTopics: reviewMeeting ? reviewTopics.trim() : undefined,
      reviewConclusion: reviewMeeting ? reviewConclusion.trim() : undefined,
      videoLink: videoLink.trim() || undefined,
      expense: expense!,
      reflections: complete.map(({ name, dept, text }) => ({ name: name.trim(), dept: dept.trim(), text: text.trim() })),
    }
    setBusy('submit')
    // 照片在此(送出時)才上傳,不進草稿;送出失敗時回滾本次已上傳的照片,
    // 避免留下孤兒檔並阻擋下次(後端跨活動 sha256 去重)重傳
    const uploaded: string[] = []
    try {
      for (const p of photos) {
        const up = await uploadActivityPhoto(activity.id, p.file)
        uploaded.push(up.id)
      }
      // 送出 → closing_pending_advisor;成果報告/心得 PDF 由後端依模板於下載時生成
      await submitClose(activity.id, body)
      invalidate()
      message.success('結案已送出,等待審核')
      onDone()
    } catch (e) {
      await Promise.allSettled(uploaded.map((id) => deleteActivityPhoto(activity.id, id)))
      invalidate()
      message.error(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{activity.name}</span>
        <span className="num">{dateRangeText(activity)}</span>
      </div>

      <div className="actform-grid" style={{ marginTop: 12 }}>
        {/* 左欄:一、活動成果調查 + 二、檢討會議 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>一、活動成果調查</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            <div>
              <div style={label}>實際社員人數{requiredMark}</div>
              <InputNumber
                min={0}
                precision={0}
                style={{ width: '100%' }}
                status={err('memberCount')}
                value={memberCount}
                onChange={(v) => {
                  clearErr('memberCount')
                  setMemberCount(v)
                }}
                placeholder={String(activity.participantsIn)}
                aria-label="實際社員人數"
              />
            </div>
            <div>
              <div style={label}>實際非社員人數{requiredMark}</div>
              <InputNumber
                min={0}
                precision={0}
                style={{ width: '100%' }}
                status={err('nonMemberCount')}
                value={nonMemberCount}
                onChange={(v) => {
                  clearErr('nonMemberCount')
                  setNonMemberCount(v)
                }}
                placeholder={String(activity.participantsOut)}
                aria-label="實際非社員人數"
              />
            </div>
            <div>
              <div style={label}>實際開始時間{requiredMark}</div>
              <TimePicker
                style={{ width: '100%' }}
                format={{ format: 'HH:mm', type: 'mask' }}
                needConfirm={false}
                status={err('actualStart')}
                placeholder={plannedStart || undefined}
                value={toTime(actualStart)}
                onChange={(_, ts) => {
                  clearErr('actualStart')
                  setActualStart((ts as string) || '')
                }}
              />
            </div>
            <div>
              <div style={label}>實際結束時間{requiredMark}</div>
              <TimePicker
                style={{ width: '100%' }}
                format={{ format: 'HH:mm', type: 'mask' }}
                needConfirm={false}
                status={err('actualEnd')}
                placeholder={plannedEnd || undefined}
                value={toTime(actualEnd)}
                onChange={(_, ts) => {
                  clearErr('actualEnd')
                  setActualEnd((ts as string) || '')
                }}
              />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={label}>實際地點{requiredMark}</div>
            <Input
              status={err('actualLocation')}
              value={actualLocation}
              onChange={(e) => {
                clearErr('actualLocation')
                setActualLocation(e.target.value)
              }}
              placeholder={activity.location}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={label}>活動重點{requiredMark}</div>
            <Input.TextArea
              rows={4}
              status={err('highlights')}
              value={highlights}
              onChange={(e) => {
                clearErr('highlights')
                setHighlights(e.target.value)
              }}
              placeholder="本次活動重點"
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={label}>如何達成活動目標{requiredMark}</div>
            <Input.TextArea
              rows={4}
              status={err('goals')}
              value={goals}
              onChange={(e) => {
                clearErr('goals')
                setGoals(e.target.value)
              }}
              placeholder="說明達成目標之方式"
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={label}>其他執行狀況與成果{requiredMark}</div>
            <Input.TextArea
              rows={4}
              status={err('others')}
              value={others}
              onChange={(e) => {
                clearErr('others')
                setOthers(e.target.value)
              }}
              placeholder="其他成果"
            />
          </div>
        </div>

        {/* 二、檢討會議:選「是」時與會人數/討論事項/內容決議皆必填 */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>二、檢討會議</div>
          <div className="form-grid-2">
            <div>
              <div style={label}>事後是否召開檢討會{requiredMark}</div>
              <Select
                style={{ width: '100%' }}
                value={reviewMeeting}
                onChange={setReviewMeeting}
                options={[
                  { value: false, label: '否' },
                  { value: true, label: '是' },
                ]}
              />
            </div>
            {reviewMeeting && (
              <div>
                <div style={label}>檢討會日期{requiredMark}</div>
                <DatePicker
                  style={{ width: '100%' }}
                  format="YYYY/MM/DD"
                  status={err('reviewDate')}
                  value={reviewDate ? dayjs(reviewDate, 'YYYY/MM/DD') : null}
                  onChange={(_, ds) => {
                    clearErr('reviewDate')
                    setReviewDate((ds as string) || '')
                  }}
                />
              </div>
            )}
          </div>
          {reviewMeeting && (
            <>
              <div className="form-grid-2" style={{ marginTop: 12 }}>
                <div>
                  <div style={label}>與會人數{requiredMark}</div>
                  <InputNumber
                    min={1}
                    precision={0}
                    style={{ width: '100%' }}
                    status={err('reviewAttendees')}
                    value={reviewAttendees}
                    onChange={(v) => {
                      clearErr('reviewAttendees')
                      setReviewAttendees(v)
                    }}
                    aria-label="與會人數"
                  />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={label}>討論事項{requiredMark}</div>
                <Input.TextArea
                  rows={3}
                  status={err('reviewTopics')}
                  value={reviewTopics}
                  onChange={(e) => {
                    clearErr('reviewTopics')
                    setReviewTopics(e.target.value)
                  }}
                  placeholder="檢討會議討論之事項"
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={label}>內容決議{requiredMark}</div>
                <Input.TextArea
                  rows={3}
                  status={err('reviewConclusion')}
                  value={reviewConclusion}
                  onChange={(e) => {
                    clearErr('reviewConclusion')
                    setReviewConclusion(e.target.value)
                  }}
                  placeholder="會議結論與後續改善作法"
                />
              </div>
            </>
          )}
        </div>
        </div>

        {/* 右欄:三、學習心得 + 四、附件與經費 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>三、學習心得{requiredMark}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reflects.map((r) => (
                <div
                  key={r.key}
                  onBlur={(e) => blurLeavesRow(e) && compactReflects()}
                  style={{ display: 'grid', gridTemplateColumns: '104px 104px 1fr', gap: 8, alignItems: 'start' }}
                >
                  <Input
                    value={r.name}
                    status={errors.has('reflections') && !r.name.trim() ? 'error' : undefined}
                    onChange={(e) => setReflect(r.key, { name: e.target.value })}
                    placeholder="姓名"
                    aria-label="姓名"
                  />
                  <Input
                    value={r.dept}
                    status={errors.has('reflections') && !r.dept.trim() ? 'error' : undefined}
                    onChange={(e) => setReflect(r.key, { dept: e.target.value })}
                    placeholder="系級"
                    aria-label="系級"
                  />
                  <Input.TextArea
                    value={r.text}
                    status={errors.has('reflections') && !r.text.trim() ? 'error' : undefined}
                    onChange={(e) => setReflect(r.key, { text: e.target.value })}
                    placeholder="學習心得內容"
                    aria-label="學習心得內容"
                    autoSize={{ minRows: 2, maxRows: 8 }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>四、附件與經費</div>
            <div>
              <div style={label}>
                活動照片{requiredMark}
                <Tooltip title={`至少 1 張即可送出;達 ${MIN_PHOTOS} 張或附影片連結,評鑑「照片 / 影片」項才計分`}>
                  <InfoCircleOutlined style={{ marginLeft: 6, color: 'var(--steel)' }} />
                </Tooltip>
              </div>
              <div
                className={errors.has('photos') ? 'area-error' : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: 6, margin: -6, border: '1px solid transparent', borderRadius: 6 }}
              >
                {existing.map((f) => (
                  <span key={f.id} style={{ position: 'relative', display: 'inline-flex' }}>
                    <img src={f.url} alt={f.name} title={`${f.name}(前次送出殘留,已在伺服器)`} style={{ width: 52, height: 40, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--line)' }} />
                    <button
                      type="button"
                      className="link-btn danger"
                      aria-label={`移除 ${f.name}`}
                      style={{ position: 'absolute', top: -6, right: -6, background: '#fff', border: '1px solid var(--line)', borderRadius: '50%', width: 16, height: 16, lineHeight: '12px', padding: 0, fontSize: 11 }}
                      onClick={() => void removeExisting(f)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {photos.map((p) => (
                  <span key={p.key} style={{ position: 'relative', display: 'inline-flex' }}>
                    <img src={p.url} alt={p.file.name} title={p.file.name} style={{ width: 52, height: 40, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--line)' }} />
                    <button
                      type="button"
                      className="link-btn danger"
                      aria-label={`移除 ${p.file.name}`}
                      style={{ position: 'absolute', top: -6, right: -6, background: '#fff', border: '1px solid var(--line)', borderRadius: '50%', width: 16, height: 16, lineHeight: '12px', padding: 0, fontSize: 11 }}
                      onClick={() => removePhoto(p.key)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <Upload
                  accept={IMAGE_ACCEPT}
                  multiple
                  showUploadList={false}
                  beforeUpload={(f) => {
                    addPhoto(f)
                    return false
                  }}
                >
                  <Button icon={<UploadOutlined />} loading={processing > 0}>選擇照片</Button>
                </Upload>
                <span className="num" style={{ fontSize: 12, color: existing.length + photos.length >= MIN_PHOTOS ? '#1F6B45' : 'var(--steel)' }}>
                  {existing.length + photos.length} 張
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 6 }}>
                送出結案時才上傳,不隨草稿保存。已選{' '}
                <span className="num">
                  {fmtMB(existing.reduce((s, f) => s + f.size, 0) + photos.reduce((s, p) => s + p.file.size, 0))}
                </span>
                /<span className="num">{Math.round(closePhotoBytes / 1024 / 1024)}</span> MB
                {existing.length > 0 && (
                  <>
                    ；含前次送出未完成殘留的 <span className="num">{existing.length}</span> 張(可移除回收額度)
                  </>
                )}
              </div>
            </div>
            <div className="form-grid-2" style={{ marginTop: 12 }}>
              <div>
                <div style={label}>影片連結</div>
                <Input
                  status={err('videoLink')}
                  value={videoLink}
                  onChange={(e) => {
                    clearErr('videoLink')
                    setVideoLink(e.target.value)
                  }}
                  placeholder="YouTube 等"
                />
              </div>
              <div>
                <div style={label}>實際支出{requiredMark}</div>
                <InputNumber
                  min={0}
                  precision={0}
                  style={{ width: '100%' }}
                  className="num-right"
                  status={err('expense')}
                  value={expense}
                  onChange={(v) => {
                    clearErr('expense')
                    setExpense(v)
                  }}
                  placeholder="元"
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button onClick={onDone} disabled={busy != null}>取消</Button>
            <Button loading={busy === 'draft'} disabled={busy === 'submit'} onClick={() => void saveDraft()}>儲存草稿</Button>
            <Button type="primary" loading={busy === 'submit'} disabled={busy === 'draft'} onClick={() => void submit()}>送出結案</Button>
          </div>
        </div>
      </div>
    </>
  )
}

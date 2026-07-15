import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { App, Button, DatePicker, Input, InputNumber, Select, TimePicker, Upload } from 'antd'
import { confirmDialog } from '../../lib/confirm'
import dayjs, { type Dayjs } from 'dayjs'
import { RightOutlined, UploadOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { blurLeavesRow } from '../../lib/form'
import { generatedPdf, releaseFile, sha256, toEvalFile } from '../eval/files'
import { allPhotoHashes, resultOf } from '../eval/store'
import type { EvalFile } from '../eval/types'
import { CLUB_ACTIVITIES } from './mock'
import type { Activity, Reflection } from './types'
import { TIME_RANGE_SEP, canClose, dateRangeText } from './utils'
import './actform.css'

interface ReflectRow extends Reflection {
  key: number
}

const isReflectEmpty = (r: ReflectRow) => !r.name.trim() && !r.dept.trim() && !r.text.trim()
const MIN_REFLECTIONS = 3
const MIN_PHOTOS = 5
const MAX_PHOTO_BYTES = 10 * 1024 * 1024 // 圖片上限 10MB(architecture.md)

// 副檔名/accept 擋不住改名檔:驗常見影像魔術位元組(JPEG/PNG/GIF/WebP/BMP/TIFF/HEIC/AVIF)
async function isImageFile(f: File): Promise<boolean> {
  const head = new Uint8Array(await f.slice(0, 12).arrayBuffer())
  if (head.length < 12) return false
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to))
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true // JPEG
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return true // PNG
  if (ascii(0, 4) === 'GIF8') return true
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return true
  if (ascii(0, 2) === 'BM') return true // BMP
  if (ascii(0, 4) === 'II*\0' || ascii(0, 4) === 'MM\0*') return true // TIFF
  // ISO BMFF(HEIC/HEIF/AVIF):offset 4 起為 'ftyp' + 品牌
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    return ['heic', 'heix', 'heif', 'hevc', 'mif1', 'msf1', 'avif', 'avis'].includes(brand)
  }
  return false
}

const label: React.CSSProperties = { fontSize: 13, fontWeight: 500, marginBottom: 6 }
const requiredMark = <span style={{ color: '#C13B34' }}> *</span>

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

// 活動結案(側欄頁):選擇已核准之活動 → 成果調查(預填申請值)+ 心得 ≥3 + 照片/影片/支出
// 除影片連結外全必填;送出後由輔導老師審核,結案通過始計入評鑑行政分
export default function ActivityClosePage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { message, modal } = App.useApp()

  // 已核准且活動已結束才可結案
  const closable = CLUB_ACTIVITIES.filter(canClose)
  const selectedId = params.get('id')
  const activity = closable.find((a) => a.id === selectedId)

  return (
    <div>
      <PageHeader
        title="活動結案"
        extra={
          <Select
            style={{ width: 380 }}
            placeholder="選擇已核准之活動"
            value={activity?.id}
            onChange={(id) => setParams({ id }, { replace: true })}
            options={closable.map((a) => ({ value: a.id, label: `${a.name}(${dateRangeText(a)})` }))}
          />
        }
      />

      {/* 未選活動:直接列出可結案的活動供點選 */}
      {!activity && closable.length > 0 && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {closable.map((a) => (
            <div
              key={a.id}
              className="card"
              role="button"
              tabIndex={0}
              onClick={() => setParams({ id: a.id }, { replace: true })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setParams({ id: a.id }, { replace: true })
                }
              }}
              style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
            >
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{a.name}</span>
                  {a.closeDraft && (
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
              {a.closeDeadline && (
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: 12, color: 'var(--steel)' }}>結案期限</div>
                  <div className="num" style={{ fontSize: 13, marginTop: 2 }}>{a.closeDeadline}</div>
                </div>
              )}
              <RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} />
            </div>
          ))}
        </div>
      )}
      {!activity && closable.length === 0 && (
        <div className="card" style={{ marginTop: 20, padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--steel)' }}>
          目前沒有可結案的活動(須已核准且活動已結束)。
        </div>
      )}

      {activity && (
        <CloseForm key={activity.id} activity={activity} onDone={() => navigate('/activities')} message={message} modal={modal} />
      )}
    </div>
  )
}

function CloseForm({
  activity,
  onDone,
  message,
  modal,
}: {
  activity: Activity
  onDone: () => void
  message: ReturnType<typeof App.useApp>['message']
  modal: ReturnType<typeof App.useApp>['modal']
}) {
  const d = activity.closeDraft
  const [plannedStart, plannedEnd] = plannedTimes(activity.timeRange)

  const [memberCount, setMemberCount] = useState<number | null>(d?.memberCount ?? null)
  const [nonMemberCount, setNonMemberCount] = useState<number | null>(d?.nonMemberCount ?? null)
  // 實際時間/地點:預填申請時的預估值(草稿優先),placeholder 亦顯示預估值
  const [actualStart, setActualStart] = useState<string>(d?.actualStart ?? plannedStart)
  const [actualEnd, setActualEnd] = useState<string>(d?.actualEnd ?? plannedEnd)
  const [actualLocation, setActualLocation] = useState<string>(d?.actualLocation ?? activity.location ?? '')
  const [highlights, setHighlights] = useState(d?.highlights ?? '')
  const [goals, setGoals] = useState(d?.goals ?? '')
  const [others, setOthers] = useState(d?.others ?? '')
  const [reviewMeeting, setReviewMeeting] = useState<boolean>(d?.reviewMeeting ?? false)
  const [reviewDate, setReviewDate] = useState(d?.reviewDate ?? '')
  const [reviewAttendees, setReviewAttendees] = useState<number | null>(d?.reviewAttendees ?? null)
  const [reviewTopics, setReviewTopics] = useState(d?.reviewTopics ?? '')
  const [reviewConclusion, setReviewConclusion] = useState(d?.reviewConclusion ?? '')
  const [videoLink, setVideoLink] = useState(d?.videoLink ?? '')
  const [expense, setExpense] = useState<number | null>(d?.expense ?? null)

  const keyRef = useRef(0)
  const nextKey = () => ++keyRef.current
  const [reflects, setReflects] = useState<ReflectRow[]>(() => {
    const saved = (d?.reflections ?? []).map((r) => ({ ...r, key: nextKey() }))
    const blanks = Math.max(1, MIN_REFLECTIONS - saved.length)
    return [...saved, ...Array.from({ length: blanks }, () => ({ key: nextKey(), name: '', dept: '', text: '' }))]
  })
  const [photos, setPhotos] = useState<EvalFile[]>([])
  const photoQueue = useRef(Promise.resolve())
  // 本頁已收照片的 hash(同步維護,不受 render 時序影響)
  const photoHashes = useRef(new Set<string>())
  const photosRef = useRef<EvalFile[]>([])
  photosRef.current = photos
  const submittedRef = useRef(false)
  const mountedRef = useRef(true)

  // 未送出而離開(取消/暫存/換活動/側欄導航)一律於卸載時釋放照片 object URL;
  // 送出後照片已轉入評鑑 store,不得釋放
  useEffect(
    () => () => {
      mountedRef.current = false
      if (!submittedRef.current) photosRef.current.forEach(releaseFile)
    },
    [],
  )

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

  const addPhoto = (f: File) => {
    photoQueue.current = photoQueue.current.then(async () => {
      try {
        if (f.size > MAX_PHOTO_BYTES) {
          message.error(`「${f.name}」超過 10MB 上限,請壓縮後再上傳`)
          return
        }
        if (!(await isImageFile(f))) {
          message.error(`「${f.name}」不是有效的圖片檔`)
          return
        }
        const hash = await sha256(f)
        if (allPhotoHashes().has(hash) || photoHashes.current.has(hash)) {
          message.error(`「${f.name}」與已上傳的照片內容相同,已拒絕重複上傳`)
          return
        }
        photoHashes.current.add(hash)
        const ef = await toEvalFile(f, hash)
        if (!mountedRef.current) {
          // 表單已卸載(處理中就離開):立即釋放,不殘留
          releaseFile(ef)
          return
        }
        setPhotos((ps) => [...ps, ef])
      } catch (e) {
        message.error(`照片處理失敗:${e instanceof Error ? e.message : String(e)}`)
      }
    })
  }

  const filledReflects = reflects.filter((r) => !isReflectEmpty(r))

  const buildDraftReport = (): NonNullable<Activity['closeDraft']> => ({
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

  const saveDraft = () => {
    const doSave = () => {
      activity.closeDraft = buildDraftReport()
      message.success('已暫存結案草稿')
      onDone()
    }
    if (photos.length > 0) {
      // 與活動申請同慣例:草稿不保存附件
      confirmDialog(modal, {
        title: '照片不會隨草稿保存',
        content: `已選擇的 ${photos.length} 張照片將被捨棄,送出結案時需重新上傳。確定要暫存草稿?`,
        okText: '捨棄照片並暫存',
        cancelText: '取消',
        onOk: doSave,
      })
      return
    }
    doSave()
  }

  const submit = () => {
    // 除影片連結外全必填
    const missing =
      memberCount == null ? '實際社員人數'
      : nonMemberCount == null ? '實際非社員人數'
      : !actualStart ? '實際開始時間'
      : !actualEnd ? '實際結束時間'
      : !actualLocation.trim() ? '實際地點'
      : !highlights.trim() ? '活動重點'
      : !goals.trim() ? '如何達成活動目標'
      : !others.trim() ? '其他執行狀況與成果'
      : reviewMeeting && !reviewDate ? '檢討會日期'
      : reviewMeeting && reviewAttendees == null ? '與會人數'
      : reviewMeeting && !reviewTopics.trim() ? '討論事項'
      : reviewMeeting && !reviewConclusion.trim() ? '內容決議'
      : photos.length === 0 ? '活動照片'
      : expense == null ? '實際支出'
      : null
    if (missing) {
      message.error(`請填寫「${missing}」。`)
      return
    }
    if (!dayjs(actualEnd, 'HH:mm').isAfter(dayjs(actualStart, 'HH:mm'))) {
      message.error('實際結束時間須晚於實際開始時間。')
      return
    }
    const video = videoLink.trim()
    if (video && !/^https?:\/\/\S+$/i.test(video)) {
      message.error('影片連結格式不正確,需為 http(s) 網址。')
      return
    }
    const complete = filledReflects.filter((r) => r.name.trim() && r.dept.trim() && r.text.trim())
    if (complete.length < filledReflects.length) {
      message.error('學習心得每列的姓名、系級與內容皆為必填。')
      return
    }
    if (complete.length < MIN_REFLECTIONS) {
      message.error(`學習心得至少需 ${MIN_REFLECTIONS} 位本校學生。`)
      return
    }
    if (photos.length < MIN_PHOTOS && !videoLink.trim()) {
      message.warning(`照片未達 ${MIN_PHOTOS} 張且無影片連結,評鑑「照片/影片」該活動將不計分。`)
    }

    const reflections = complete.map(({ name, dept, text }) => ({ name: name.trim(), dept: dept.trim(), text: text.trim() }))
    activity.report = {
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
      reflections,
      submittedAt: dayjs().format('YYYY/MM/DD'),
    }
    delete activity.closeDraft
    activity.status = 'closing_pending_advisor'

    // 結案產物餵評鑑行政分:照片/影片連結(ad2)、成果報告(ad3)、心得彙整(ad4)
    const r = resultOf(activity.id)
    r.photos = [...r.photos, ...photos]
    r.videoLink = videoLink.trim()
    r.report = generatedPdf(`${activity.name}_成果報告`)
    r.feedback = generatedPdf(`${activity.name}_心得(${reflections.length}人)`)

    submittedRef.current = true
    message.success('結案已送出,等待審核')
    onDone()
  }

  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{activity.name}</span>
        <span className="num">{dateRangeText(activity)}</span>
        {activity.closeDeadline && (
          <span>
            結案期限 <span className="num">{activity.closeDeadline}</span>
          </span>
        )}
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
                value={memberCount}
                onChange={setMemberCount}
                placeholder={activity.participantsIn != null ? String(activity.participantsIn) : undefined}
                aria-label="實際社員人數"
              />
            </div>
            <div>
              <div style={label}>實際非社員人數{requiredMark}</div>
              <InputNumber
                min={0}
                precision={0}
                style={{ width: '100%' }}
                value={nonMemberCount}
                onChange={setNonMemberCount}
                placeholder={activity.participantsOut != null ? String(activity.participantsOut) : undefined}
                aria-label="實際非社員人數"
              />
            </div>
            <div>
              <div style={label}>實際開始時間{requiredMark}</div>
              <TimePicker
                style={{ width: '100%' }}
                format={{ format: 'HH:mm', type: 'mask' }}
                needConfirm={false}
                placeholder={plannedStart || undefined}
                value={toTime(actualStart)}
                onChange={(_, ts) => setActualStart((ts as string) || '')}
              />
            </div>
            <div>
              <div style={label}>實際結束時間{requiredMark}</div>
              <TimePicker
                style={{ width: '100%' }}
                format={{ format: 'HH:mm', type: 'mask' }}
                needConfirm={false}
                placeholder={plannedEnd || undefined}
                value={toTime(actualEnd)}
                onChange={(_, ts) => setActualEnd((ts as string) || '')}
              />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={label}>實際地點{requiredMark}</div>
            <Input value={actualLocation} onChange={(e) => setActualLocation(e.target.value)} placeholder={activity.location} />
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={label}>活動重點{requiredMark}</div>
            <Input.TextArea rows={4} value={highlights} onChange={(e) => setHighlights(e.target.value)} placeholder="本次活動重點" />
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={label}>如何達成活動目標{requiredMark}</div>
            <Input.TextArea rows={4} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="說明達成目標之方式" />
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={label}>其他執行狀況與成果{requiredMark}</div>
            <Input.TextArea rows={4} value={others} onChange={(e) => setOthers(e.target.value)} placeholder="其他成果" />
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
                  value={reviewDate ? dayjs(reviewDate, 'YYYY/MM/DD') : null}
                  onChange={(_, ds) => setReviewDate((ds as string) || '')}
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
                    value={reviewAttendees}
                    onChange={setReviewAttendees}
                    aria-label="與會人數"
                  />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={label}>討論事項{requiredMark}</div>
                <Input.TextArea
                  rows={3}
                  value={reviewTopics}
                  onChange={(e) => setReviewTopics(e.target.value)}
                  placeholder="檢討會議討論之事項"
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={label}>內容決議{requiredMark}</div>
                <Input.TextArea
                  rows={3}
                  value={reviewConclusion}
                  onChange={(e) => setReviewConclusion(e.target.value)}
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
                  <Input value={r.name} onChange={(e) => setReflect(r.key, { name: e.target.value })} placeholder="姓名" aria-label="姓名" />
                  <Input value={r.dept} onChange={(e) => setReflect(r.key, { dept: e.target.value })} placeholder="系級" aria-label="系級" />
                  <Input.TextArea
                    value={r.text}
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
                活動照片(≥{MIN_PHOTOS} 張){requiredMark}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {photos.map((p) => (
                  <span key={p.id} style={{ position: 'relative', display: 'inline-flex' }}>
                    <img src={p.url} alt={p.name} title={p.name} style={{ width: 52, height: 40, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--line)' }} />
                    <button
                      type="button"
                      className="link-btn danger"
                      aria-label={`移除 ${p.name}`}
                      style={{ position: 'absolute', top: -6, right: -6, background: '#fff', border: '1px solid var(--line)', borderRadius: '50%', width: 16, height: 16, lineHeight: '12px', padding: 0, fontSize: 11 }}
                      onClick={() => {
                        releaseFile(p)
                        if (p.hash) photoHashes.current.delete(p.hash)
                        setPhotos((ps) => ps.filter((x) => x.id !== p.id))
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <Upload
                  accept="image/*,.heic,.heif"
                  multiple
                  showUploadList={false}
                  beforeUpload={(f) => {
                    addPhoto(f)
                    return false
                  }}
                >
                  <Button icon={<UploadOutlined />}>選擇照片</Button>
                </Upload>
                <span className="num" style={{ fontSize: 12, color: photos.length >= MIN_PHOTOS ? '#1F6B45' : 'var(--steel)' }}>
                  {photos.length} 張
                </span>
              </div>
            </div>
            <div className="form-grid-2" style={{ marginTop: 12 }}>
              <div>
                <div style={label}>影片連結</div>
                <Input value={videoLink} onChange={(e) => setVideoLink(e.target.value)} placeholder="YouTube 等" />
              </div>
              <div>
                <div style={label}>實際支出{requiredMark}</div>
                <InputNumber min={0} precision={0} style={{ width: '100%' }} className="num-right" value={expense} onChange={setExpense} placeholder="元" />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button onClick={onDone}>取消</Button>
            <Button onClick={saveDraft}>儲存草稿</Button>
            <Button type="primary" onClick={submit}>送出結案</Button>
          </div>
        </div>
      </div>
    </>
  )
}

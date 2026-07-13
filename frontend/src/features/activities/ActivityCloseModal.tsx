import { useRef, useState } from 'react'
import { App, Button, DatePicker, Input, InputNumber, Modal, Select, Upload } from 'antd'
import dayjs from 'dayjs'
import { UploadOutlined } from '@ant-design/icons'
import { blurLeavesRow } from '../../lib/form'
import { allPhotoHashes, generatedPdf, releaseFile, resultOf, sha256, toEvalFile } from '../eval/store'
import type { EvalFile } from '../eval/types'
import type { Activity, Reflection } from './types'

interface ReflectRow extends Reflection {
  key: number
}

const isReflectEmpty = (r: ReflectRow) => !r.name.trim() && !r.dept.trim() && !r.text.trim()
const MIN_REFLECTIONS = 3
const MIN_PHOTOS = 5

const label: React.CSSProperties = { fontSize: 13, fontWeight: 500, marginBottom: 6 }
const requiredMark = <span style={{ color: '#C13B34' }}> *</span>
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 600, margin: '18px 0 10px' }

interface ActivityCloseModalProps {
  activity: Activity
  open: boolean
  onClose: () => void
  afterClose: () => void
  onChanged: () => void
}

// 活動結案表單(v6 原型:成果報告表 + 學習心得 ≥3 + 附件與經費)
// 送出 → 結案待輔導老師審核;成果(照片/成果報告/心得)同步餵評鑑行政分 ad2–ad4
export default function ActivityCloseModal({ activity, open, onClose, afterClose, onChanged }: ActivityCloseModalProps) {
  const { message, modal } = App.useApp()
  const d = activity.closeDraft
  const [attend, setAttend] = useState<Record<'expected' | 'registered' | 'should' | 'actual' | 'leave', number | null>>({
    expected: d?.attendExpected ?? null,
    registered: d?.attendRegistered ?? null,
    should: d?.attendShould ?? null,
    actual: d?.attendActual ?? null,
    leave: d?.attendLeave ?? null,
  })
  const [highlights, setHighlights] = useState(d?.highlights ?? '')
  const [goals, setGoals] = useState(d?.goals ?? '')
  const [others, setOthers] = useState(d?.others ?? '')
  const [reviewMeeting, setReviewMeeting] = useState(d?.reviewMeeting ?? true)
  const [reviewDate, setReviewDate] = useState(d?.reviewDate ?? '')
  const [videoLink, setVideoLink] = useState(d?.videoLink ?? '')
  const [expense, setExpense] = useState<number | null>(d?.expense ?? null)
  const keyRef = useRef(MIN_REFLECTIONS + 1)
  const [reflects, setReflects] = useState<ReflectRow[]>(() => {
    const saved = (d?.reflections ?? []).map((r, i) => ({ ...r, key: i + 1 }))
    keyRef.current = saved.length + MIN_REFLECTIONS + 1
    const blanks = Math.max(1, MIN_REFLECTIONS - saved.length)
    return [...saved, ...Array.from({ length: blanks }, (_, i) => ({ key: saved.length + i + 1, name: '', dept: '', text: '' }))]
  })
  const [photos, setPhotos] = useState<EvalFile[]>([])
  const photoQueue = useRef(Promise.resolve())
  // 取消/暫存(捨棄照片)時釋放 object URL;送出後照片轉入評鑑 store,不釋放
  const photosRef = useRef<EvalFile[]>([])
  photosRef.current = photos
  const submittedRef = useRef(false)

  // 自動增列:填寫尾列即補一列;blur 離開列時移除空列(保底 3 列)
  const setReflect = (key: number, patch: Partial<Reflection>) => {
    setReflects((rs) => {
      const next = rs.map((r) => (r.key === key ? { ...r, ...patch } : r))
      if (!isReflectEmpty(next[next.length - 1])) {
        keyRef.current += 1
        next.push({ key: keyRef.current, name: '', dept: '', text: '' })
      }
      return next
    })
  }
  const compactReflects = () =>
    setReflects((rs) => {
      const filled = rs.filter((r) => !isReflectEmpty(r))
      keyRef.current += 1
      const next = [...filled, { key: keyRef.current, name: '', dept: '', text: '' }]
      while (next.length < MIN_REFLECTIONS) {
        keyRef.current += 1
        next.push({ key: keyRef.current, name: '', dept: '', text: '' })
      }
      return next
    })

  const addPhoto = (f: File) => {
    photoQueue.current = photoQueue.current.then(async () => {
      try {
        const hash = await sha256(f)
        const dup = allPhotoHashes().has(hash) || photos.some((p) => p.hash === hash)
        if (dup) {
          message.error(`「${f.name}」與已上傳的照片內容相同,已拒絕重複上傳`)
          return
        }
        const ef = await toEvalFile(f, hash)
        setPhotos((ps) => (ps.some((p) => p.hash === hash) ? ps : [...ps, ef]))
      } catch (e) {
        message.error(`照片處理失敗:${e instanceof Error ? e.message : String(e)}`)
      }
    })
  }

  const filledReflects = reflects.filter((r) => r.name.trim() && r.text.trim())

  const buildDraftReport = (): NonNullable<Activity['closeDraft']> => ({
    attendExpected: attend.expected ?? undefined,
    attendRegistered: attend.registered ?? undefined,
    attendShould: attend.should ?? undefined,
    attendActual: attend.actual ?? undefined,
    attendLeave: attend.leave ?? undefined,
    highlights: highlights.trim(),
    goals: goals.trim(),
    others: others.trim(),
    reviewMeeting,
    reviewDate,
    videoLink: videoLink.trim(),
    expense: expense ?? undefined,
    reflections: filledReflects.map(({ name, dept, text }) => ({ name: name.trim(), dept: dept.trim(), text: text.trim() })),
  })

  const saveDraft = () => {
    const doSave = () => {
      activity.closeDraft = buildDraftReport()
      message.success('已暫存結案草稿')
      onChanged()
      onClose()
    }
    if (photos.length > 0) {
      // 與活動申請同慣例:草稿不保存附件
      modal.confirm({
        title: '照片不會隨草稿保存',
        content: `已選擇的 ${photos.length} 張照片將被捨棄,送出結案時需重新上傳。確定要暫存草稿?`,
        okText: '捨棄照片並暫存',
        maskClosable: true,
        cancelText: '取消',
        onOk: doSave,
      })
      return
    }
    doSave()
  }

  const submit = () => {
    if (attend.actual == null) {
      message.error('請填寫實到人數。')
      return
    }
    if (!highlights.trim()) {
      message.error('請填寫活動重點。')
      return
    }
    if (photos.length === 0) {
      message.error('請上傳活動照片(JPG/PNG)。')
      return
    }
    if (expense == null) {
      message.error('請填寫實際支出。')
      return
    }
    if (filledReflects.length < MIN_REFLECTIONS) {
      message.error(`學習心得至少需 ${MIN_REFLECTIONS} 位(姓名與內容必填)。`)
      return
    }
    if (photos.length < MIN_PHOTOS && !videoLink.trim()) {
      message.warning(`照片未達 ${MIN_PHOTOS} 張且無影片連結,評鑑「照片/影片」該活動將不計分。`)
    }

    const reflections = filledReflects.map(({ name, dept, text }) => ({ name: name.trim(), dept: dept.trim(), text: text.trim() }))
    activity.report = {
      attendExpected: attend.expected ?? undefined,
      attendRegistered: attend.registered ?? undefined,
      attendShould: attend.should ?? undefined,
      attendActual: attend.actual,
      attendLeave: attend.leave ?? undefined,
      highlights: highlights.trim(),
      goals: goals.trim() || undefined,
      others: others.trim() || undefined,
      reviewMeeting,
      reviewDate: reviewDate || undefined,
      videoLink: videoLink.trim() || undefined,
      expense,
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
    message.success('結案已送出,等待輔導老師審核')
    onChanged()
    onClose()
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={() => {
        if (!submittedRef.current) photosRef.current.forEach(releaseFile)
        afterClose()
      }}
      width={760}
      title={
        <span style={{ display: 'inline-flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>活動結案 — {activity.name}</span>
          <span className="num" style={{ fontSize: 12, color: 'var(--steel)', fontWeight: 400 }}>
            {activity.date}
            {activity.closeDeadline ? ` · 結案期限 ${activity.closeDeadline}` : ''}
          </span>
        </span>
      }
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button onClick={onClose}>取消</Button>
          <Button onClick={saveDraft}>儲存草稿</Button>
          <Button type="primary" onClick={submit}>送出結案</Button>
        </div>
      }
    >
      <div style={sectionTitle}>一、活動成果報告表</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
        {(
          [
            ['expected', '預期報名', false],
            ['registered', '實際報名', false],
            ['should', '應到', false],
            ['actual', '實到', true],
            ['leave', '請假', false],
          ] as const
        ).map(([k, lab, required]) => (
          <div key={k}>
            <div style={label}>
              {lab}
              {required && requiredMark}
            </div>
            <InputNumber
              min={0}
              precision={0}
              style={{ width: '100%' }}
              value={attend[k]}
              onChange={(v) => setAttend((s) => ({ ...s, [k]: v }))}
              aria-label={lab}
            />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={label}>活動重點{requiredMark}</div>
        <Input.TextArea rows={2} value={highlights} onChange={(e) => setHighlights(e.target.value)} placeholder="本次活動重點" />
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={label}>如何達成活動目標</div>
        <Input.TextArea rows={2} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="說明達成目標之方式" />
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={label}>其他執行狀況與成果</div>
        <Input.TextArea rows={2} value={others} onChange={(e) => setOthers(e.target.value)} placeholder="其他成果" />
      </div>
      <div className="form-grid-2" style={{ marginTop: 12 }}>
        <div>
          <div style={label}>事後是否召開檢討會</div>
          <Select
            style={{ width: '100%' }}
            value={reviewMeeting}
            onChange={setReviewMeeting}
            options={[
              { value: true, label: '是' },
              { value: false, label: '否' },
            ]}
          />
        </div>
        <div>
          <div style={label}>檢討會日期</div>
          <DatePicker
            style={{ width: '100%' }}
            format="YYYY/MM/DD"
            value={reviewDate ? dayjs(reviewDate, 'YYYY/MM/DD') : null}
            onChange={(_, ds) => setReviewDate((ds as string) || '')}
          />
        </div>
      </div>

      <div style={sectionTitle}>
        二、學習心得
        <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--steel)', marginLeft: 8 }}>
          至少 {MIN_REFLECTIONS} 位本校學生;填寫後自動增列
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {reflects.map((r) => (
          <div key={r.key} onBlur={(e) => blurLeavesRow(e) && compactReflects()} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
            <Input value={r.name} onChange={(e) => setReflect(r.key, { name: e.target.value })} placeholder="姓名" aria-label="姓名" />
            <Input value={r.dept} onChange={(e) => setReflect(r.key, { dept: e.target.value })} placeholder="系級" aria-label="系級" />
            <Input value={r.text} onChange={(e) => setReflect(r.key, { text: e.target.value })} placeholder="學習心得內容" aria-label="學習心得內容" />
          </div>
        ))}
      </div>

      <div style={sectionTitle}>三、附件與經費</div>
      <div>
        <div style={label}>
          活動照片(≥{MIN_PHOTOS} 張,限 JPG/PNG){requiredMark}
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
                  setPhotos((ps) => ps.filter((x) => x.id !== p.id))
                }}
              >
                ×
              </button>
            </span>
          ))}
          <Upload
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
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
        <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>內容相同的照片(即使檔名不同)會被拒絕。</div>
      </div>
      <div className="form-grid-2" style={{ marginTop: 12 }}>
        <div>
          <div style={label}>影片連結(可選)</div>
          <Input value={videoLink} onChange={(e) => setVideoLink(e.target.value)} placeholder="YouTube 等" />
        </div>
        <div>
          <div style={label}>實際支出(元){requiredMark}</div>
          <InputNumber min={0} precision={0} style={{ width: '100%' }} className="num-right" value={expense} onChange={setExpense} placeholder="核銷依據" />
        </div>
      </div>
    </Modal>
  )
}

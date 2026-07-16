import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { App, Button, Checkbox, DatePicker, Input, InputNumber, Select, Tag } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { HolderOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { FIELD_TYPE_LABEL, type FieldType, type SignupKind } from '../signup/types'
import KindBadge from '../signup/KindBadge'
import { useSignupItemMutations } from '../../api/adminSignups'
import './builder.css'

interface BuilderField {
  key: number
  label: string
  type: FieldType
  required: boolean
  options: string[]
}

const OPTION_TYPES: FieldType[] = ['radio', 'checkbox', 'select']
const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 500, marginBottom: 6 }
const requiredMark = <span style={{ color: '#C13B34' }}> *</span>

export default function SignupBuilderPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const { create } = useSignupItemMutations()
  const [name, setName] = useState('')
  // 評鑑對幹訓/負責人會議有特別採計,建立時即標記類型
  const [kind, setKind] = useState<SignupKind>('normal')
  const [cap, setCap] = useState<number | null>(null)
  const [place, setPlace] = useState('')
  const [eventTime, setEventTime] = useState<Dayjs | null>(null)
  const [signupStart, setSignupStart] = useState<Dayjs | null>(dayjs()) // 報名開始預設今天
  const [signupEnd, setSignupEnd] = useState<Dayjs | null>(null)
  const [needsReview, setNeedsReview] = useState(false) // 審核制:報名送出後須管理員核准
  const [description, setDescription] = useState('')
  const [fields, setFields] = useState<BuilderField[]>([])
  const [nextKey, setNextKey] = useState(1)

  // 拖曳排序:pointer 事件自製(HTML5 DnD 到 drop 才換位、ghost 突兀且不支援觸控);
  // 按住把手即開始,掃過其他列的中線就即時重排,放開結束
  const [dragKey, setDragKey] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (dragKey == null) return
    const move = (ev: PointerEvent) => {
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-field-key]') ?? [])]
      const over = rows.find((r) => {
        const rect = r.getBoundingClientRect()
        return ev.clientY >= rect.top && ev.clientY <= rect.bottom
      })
      if (!over) return
      const overKey = Number(over.dataset.fieldKey)
      if (overKey === dragKey) return
      const rect = over.getBoundingClientRect()
      // 越過目標列中線才換位,避免列高不同時來回抖動
      const after = ev.clientY > rect.top + rect.height / 2
      setFields((fs) => {
        const from = fs.findIndex((f) => f.key === dragKey)
        const to = fs.findIndex((f) => f.key === overKey)
        if (from < 0 || to < 0) return fs
        let insert = to + (after ? 1 : 0)
        if (insert > from) insert -= 1
        if (insert === from) return fs
        const next = [...fs]
        const [moved] = next.splice(from, 1)
        next.splice(insert, 0, moved)
        return next
      })
    }
    const up = () => setDragKey(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragKey])

  const update = (key: number, patch: Partial<BuilderField>) =>
    setFields((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)))

  const addField = () => {
    setFields((fs) => [...fs, { key: nextKey, label: '', type: 'text', required: false, options: [] }])
    setNextKey((k) => k + 1)
  }

  const addOption = (key: number) => {
    const value = window.prompt('選項內容')?.trim()
    if (!value) return
    setFields((fs) =>
      fs.map((f) => {
        if (f.key !== key) return f
        if (f.options.includes(value)) {
          message.error(`選項「${value}」已存在`)
          return f
        }
        return { ...f, options: [...f.options, value] }
      }),
    )
  }

  // 發布驗證未過的欄位集合:對應欄位標紅框,修改該欄即解除
  const [errs, setErrs] = useState<ReadonlySet<string>>(new Set())
  const errOf = (k: string) => (errs.has(k) ? ('error' as const) : undefined)
  const clearErr = (k: string) =>
    setErrs((s) => {
      if (!s.has(k)) return s
      const n = new Set(s)
      n.delete(k)
      return n
    })

  const publish = () => {
    const missing: [key: string, msg: string][] = []
    if (!name.trim()) missing.push(['name', '請輸入活動名稱'])
    if (!eventTime) missing.push(['eventTime', '請選擇活動時間'])
    if (cap == null || cap < 1) missing.push(['cap', '名額上限為必填,最少 1 名'])
    if (!signupStart) missing.push(['signupStart', '請選擇報名開始時間'])
    if (!signupEnd) missing.push(['signupEnd', '請選擇報名截止時間'])
    if (missing.length === 0 && signupStart && signupEnd && !signupEnd.isAfter(signupStart)) {
      missing.push(['signupEnd', '報名截止須晚於報名開始'])
    }
    if (missing.length || !eventTime || !signupStart || !signupEnd || cap == null) {
      setErrs(new Set(missing.map(([k]) => k)))
      if (missing.length) message.error(missing[0][1])
      return
    }
    // 自訂欄位:未命名者不送出(與預覽一致);選項型欄位至少需一個選項(後端同樣驗證)
    const named = fields.filter((f) => f.label.trim())
    const noOptions = named.find((f) => OPTION_TYPES.includes(f.type) && f.options.length === 0)
    if (noOptions) {
      message.error(`「${noOptions.label.trim()}」為選項型欄位,請至少新增一個選項`)
      return
    }
    setErrs(new Set())
    create.mutate(
      {
        name: name.trim(),
        kind,
        place: place.trim() || undefined,
        description: description.trim(),
        eventAt: eventTime.format('YYYY/MM/DD HH:mm'),
        signupStart: signupStart.format('YYYY/MM/DD HH:mm'),
        signupEnd: signupEnd.format('YYYY/MM/DD HH:mm'),
        maxParticipants: cap,
        requiresConfirmation: needsReview,
        // 陣列順序=顯示順序(拖曳排序後整包送)
        fields: named.map((f) => ({ label: f.label.trim(), type: f.type, required: f.required, options: f.options })),
      },
      {
        onSuccess: () => {
          message.success('已發布')
          navigate('/admin/signups')
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  return (
    <div>
      <PageHeader
        title="活動建立"
        extra={
          <Button type="primary" loading={create.isPending} onClick={publish}>發布</Button>
        }
      />

      <div className="builder-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18 }}>活動資訊</div>
            <div className="form-grid-2">
              <label style={{ gridColumn: '1 / -1' }}>
                <div style={fieldLabel}>活動名稱{requiredMark}</div>
                <Input
                  value={name}
                  status={errOf('name')}
                  onChange={(e) => {
                    clearErr('name')
                    setName(e.target.value)
                  }}
                />
              </label>
              <label>
                <div style={fieldLabel}>活動類型{requiredMark}</div>
                <Select
                  value={kind}
                  onChange={setKind}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'normal', label: '普通活動' },
                    { value: 'cadre_training', label: '幹訓' },
                    { value: 'leader_meeting', label: '社團負責人會議' },
                  ]}
                />
              </label>
              <label>
                <div style={fieldLabel}>地點</div>
                <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="例:國際大樓 IB-101" />
              </label>
              <label>
                <div style={fieldLabel}>活動時間{requiredMark}</div>
                <DatePicker
                  showTime={{ format: 'HH:mm' }}
                  style={{ width: '100%' }}
                  format="YYYY/MM/DD HH:mm"
                  status={errOf('eventTime')}
                  value={eventTime}
                  onChange={(v) => {
                    clearErr('eventTime')
                    setEventTime(v)
                  }}
                />
              </label>
              <label>
                <div style={fieldLabel}>名額上限{requiredMark}</div>
                <InputNumber
                  style={{ width: '100%' }}
                  min={1}
                  status={errOf('cap')}
                  value={cap}
                  onChange={(v) => {
                    clearErr('cap')
                    setCap(v)
                  }}
                />
              </label>
              <label>
                <div style={fieldLabel}>報名開始{requiredMark}</div>
                <DatePicker
                  showTime={{ format: 'HH:mm' }}
                  style={{ width: '100%' }}
                  format="YYYY/MM/DD HH:mm"
                  status={errOf('signupStart')}
                  value={signupStart}
                  onChange={(v) => {
                    clearErr('signupStart')
                    setSignupStart(v)
                  }}
                />
              </label>
              <label>
                <div style={fieldLabel}>報名截止{requiredMark}</div>
                <DatePicker
                  showTime={{ format: 'HH:mm' }}
                  style={{ width: '100%' }}
                  format="YYYY/MM/DD HH:mm"
                  status={errOf('signupEnd')}
                  value={signupEnd}
                  onChange={(v) => {
                    clearErr('signupEnd')
                    setSignupEnd(v)
                  }}
                />
              </label>
              <div style={{ gridColumn: '1 / -1' }}>
                <Checkbox checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)}>
                  審核制(報名送出後須管理員核准才算報名成功)
                </Checkbox>
              </div>
              <label style={{ gridColumn: '1 / -1' }}>
                <div style={fieldLabel}>活動描述</div>
                <Input.TextArea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="活動內容、對象、注意事項"
                />
              </label>
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>資訊調查</div>
            </div>
            <div
              ref={listRef}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, userSelect: dragKey != null ? 'none' : undefined }}
            >
              {fields.map((f) => (
                <div
                  key={f.key}
                  data-field-key={f.key}
                  className="builder-field"
                  style={dragKey === f.key ? { opacity: 0.45, boxShadow: '0 2px 10px rgba(31,36,48,.18)' } : undefined}
                >
                  <div className="builder-field-main">
                    <HolderOutlined
                      style={{ color: 'var(--muted)', cursor: dragKey === f.key ? 'grabbing' : 'grab', touchAction: 'none' }}
                      aria-label="拖曳排序"
                      onPointerDown={(e) => {
                        e.preventDefault()
                        setDragKey(f.key)
                      }}
                    />
                    <Input
                      value={f.label}
                      onChange={(e) => update(f.key, { label: e.target.value })}
                      placeholder="欄位名稱"
                      aria-label="欄位名稱"
                      style={{ flex: 1, height: 36 }}
                    />
                    <Select
                      value={f.type}
                      onChange={(v) => update(f.key, { type: v })}
                      style={{ width: 130 }}
                      size="middle"
                      aria-label="欄位型別"
                      options={(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => ({
                        value: t,
                        label: FIELD_TYPE_LABEL[t],
                      }))}
                    />
                    <Checkbox checked={f.required} onChange={(e) => update(f.key, { required: e.target.checked })}>
                      必填
                    </Checkbox>
                    <button
                      type="button"
                      className="link-btn danger"
                      onClick={() => setFields((fs) => fs.filter((x) => x.key !== f.key))}
                    >
                      刪除
                    </button>
                  </div>
                  {OPTION_TYPES.includes(f.type) && (
                    <div className="builder-field-options">
                      <span style={{ fontSize: 12, color: 'var(--steel)' }}>選項</span>
                      {f.options.map((o) => (
                        <Tag
                          key={o}
                          closable
                          onClose={() =>
                            update(f.key, { options: f.options.filter((x) => x !== o) })
                          }
                          style={{ marginInlineEnd: 0 }}
                        >
                          {o}
                        </Tag>
                      ))}
                      <button type="button" className="link-btn" style={{ color: 'var(--focus)', fontSize: 12 }} onClick={() => addOption(f.key)}>
                        + 選項
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <button type="button" className="builder-add" onClick={addField}>
                + 新增欄位
              </button>
            </div>
          </div>
        </div>

        <div className="builder-preview-col">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--steel)', letterSpacing: 2, fontWeight: 500 }}>即時預覽</span>
          </div>
          <div className="builder-preview-frame">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{name || '(未命名活動)'} — 報名</div>
              <KindBadge kind={kind} />
              {needsReview && (
                <Tag color="gold" style={{ marginInlineEnd: 0 }}>審核制</Tag>
              )}
            </div>
            {description.trim() && (
              <div style={{ fontSize: 12, color: 'var(--steel)', lineHeight: 1.7, marginTop: 6 }}>{description}</div>
            )}
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: 14, marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  參加人 <span className="num">1</span>
                </div>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: 'var(--steel)' }}>移除</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <PreviewInput label="姓名" required />
                  <PreviewInput label="學號" required />
                </div>
                <PreviewInput label="系級" required />
                {fields.map((f) => (
                  <PreviewField key={f.key} field={f} />
                ))}
              </div>
            </div>
            <div className="builder-preview-add num">
              + 新增參加人(1/{cap ?? '—'})
            </div>
            <div className="builder-preview-submit">送出報名</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewInput({ label, required }: { label: string; required?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
        {label}
        {required && requiredMark}
      </div>
      <div style={{ height: 34, border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }} />
    </div>
  )
}

function PreviewField({ field }: { field: BuilderField }) {
  if (!field.label) return null
  if (field.type === 'radio' || field.type === 'checkbox') {
    return (
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
          {field.label}
          {field.required && requiredMark}
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--steel)', padding: '4px 0', flexWrap: 'wrap' }}>
          {field.options.map((o) => (
            <span key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: field.type === 'radio' ? '50%' : 3,
                  border: '1.5px solid #C8CDD5',
                }}
              />
              {o}
            </span>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
        {field.label}
        {field.required && requiredMark}
      </div>
      {field.type === 'select' ? (
        <div
          style={{
            height: 34,
            border: '1px solid var(--line)',
            borderRadius: 6,
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
            fontSize: 12,
            color: 'var(--muted)',
          }}
        >
          請選擇
        </div>
      ) : (
        <div
          style={{
            height: field.type === 'textarea' ? 52 : 34,
            border: '1px solid var(--line)',
            borderRadius: 6,
            background: '#fff',
          }}
        />
      )}
    </div>
  )
}

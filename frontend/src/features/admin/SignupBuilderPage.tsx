import { useEffect, useState } from 'react'
import { App, Button, Checkbox, DatePicker, Input, InputNumber, Select, Tag } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { HolderOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { FIELD_TYPE_LABEL, type FieldType, type SignupKind } from '../signup/types'
import KindBadge from '../signup/KindBadge'
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
  const [name, setName] = useState('社團幹訓')
  // 評鑑對幹訓/負責人會議有特別採計,建立時即標記類型
  const [kind, setKind] = useState<SignupKind>('normal')
  const [cap, setCap] = useState<number | null>(5)
  const [eventTime, setEventTime] = useState<Dayjs | null>(dayjs('2026/09/20 09:00', 'YYYY/MM/DD HH:mm'))
  const [signupStart, setSignupStart] = useState<Dayjs | null>(dayjs()) // 報名開始預設今天
  const [signupEnd, setSignupEnd] = useState<Dayjs | null>(null)
  const [needsReview, setNeedsReview] = useState(false) // 審核制:報名送出後須管理員核准
  const [description, setDescription] = useState('說明描述')
  const [fields, setFields] = useState<BuilderField[]>([
    { key: 1, label: '聯絡電話', type: 'text', required: true, options: [] },
    { key: 2, label: '膳食需求', type: 'select', required: true, options: ['葷', '素'] },
    { key: 3, label: '是否攜帶筆電', type: 'radio', required: false, options: ['是', '否'] },
    { key: 4, label: '備註', type: 'textarea', required: false, options: [] },
  ])
  const [nextKey, setNextKey] = useState(5)

  // 拖曳排序:按住把手才啟用 draggable,避免干擾列內輸入框的文字選取
  const [dragKey, setDragKey] = useState<number | null>(null)
  const [handleKey, setHandleKey] = useState<number | null>(null)
  // 在把手外放開滑鼠時 onMouseUp 不會觸發:全域 pointerup 兜底重設,避免列殘留 draggable
  useEffect(() => {
    if (handleKey == null) return
    const up = () => setHandleKey(null)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [handleKey])
  const dropOn = (targetKey: number) => {
    if (dragKey == null || dragKey === targetKey) return
    setFields((fs) => {
      const next = [...fs]
      const from = next.findIndex((f) => f.key === dragKey)
      const to = next.findIndex((f) => f.key === targetKey)
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

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

  const publish = () => {
    if (!name.trim()) return void message.error('請輸入活動名稱')
    if (!eventTime) return void message.error('請選擇活動時間')
    if (cap == null || cap < 1) return void message.error('名額上限為必填,最少 1 名')
    if (!signupStart || !signupEnd) return void message.error('請選擇報名開始與截止時間')
    if (!signupEnd.isAfter(signupStart)) return void message.error('報名截止須晚於報名開始')
    message.success('已發布')
  }

  return (
    <div>
      <PageHeader
        title="活動建立"
        extra={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button onClick={() => message.success('已儲存草稿')}>儲存草稿</Button>
            <Button type="primary" onClick={publish}>發布</Button>
          </div>
        }
      />

      <div className="builder-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18 }}>活動資訊</div>
            <div className="form-grid-2">
              <label style={{ gridColumn: '1 / -1' }}>
                <div style={fieldLabel}>活動名稱{requiredMark}</div>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
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
                <Input defaultValue="國際大樓 IB-101" />
              </label>
              <label>
                <div style={fieldLabel}>活動時間{requiredMark}</div>
                <DatePicker
                  showTime={{ format: 'HH:mm' }}
                  style={{ width: '100%' }}
                  format="YYYY/MM/DD HH:mm"
                  value={eventTime}
                  onChange={setEventTime}
                />
              </label>
              <label>
                <div style={fieldLabel}>名額上限{requiredMark}</div>
                <InputNumber style={{ width: '100%' }} min={1} value={cap} onChange={setCap} />
              </label>
              <label>
                <div style={fieldLabel}>報名開始{requiredMark}</div>
                <DatePicker
                  showTime={{ format: 'HH:mm' }}
                  style={{ width: '100%' }}
                  format="YYYY/MM/DD HH:mm"
                  value={signupStart}
                  onChange={setSignupStart}
                />
              </label>
              <label>
                <div style={fieldLabel}>報名截止{requiredMark}</div>
                <DatePicker
                  showTime={{ format: 'HH:mm' }}
                  style={{ width: '100%' }}
                  format="YYYY/MM/DD HH:mm"
                  value={signupEnd}
                  onChange={setSignupEnd}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {fields.map((f) => (
                <div
                  key={f.key}
                  className="builder-field"
                  draggable={handleKey === f.key}
                  onDragStart={() => setDragKey(f.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOn(f.key)}
                  onDragEnd={() => {
                    setDragKey(null)
                    setHandleKey(null)
                  }}
                  style={dragKey === f.key ? { opacity: 0.45 } : undefined}
                >
                  <div className="builder-field-main">
                    <HolderOutlined
                      style={{ color: 'var(--muted)', cursor: 'grab' }}
                      aria-label="拖曳排序"
                      onMouseDown={() => setHandleKey(f.key)}
                      onMouseUp={() => setHandleKey(null)}
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

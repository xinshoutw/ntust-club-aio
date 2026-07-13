import { useState } from 'react'
import { App, Button, Checkbox, DatePicker, Input, InputNumber, Select, Tag } from 'antd'
import { HolderOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { FIELD_TYPE_LABEL, type FieldType } from '../signup/types'
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
  const [cap, setCap] = useState<number | null>(5)
  const [fields, setFields] = useState<BuilderField[]>([
    { key: 1, label: '聯絡電話', type: 'text', required: true, options: [] },
    { key: 2, label: '膳食需求', type: 'select', required: true, options: ['葷', '素'] },
    { key: 3, label: '是否攜帶筆電', type: 'radio', required: false, options: ['是', '否'] },
    { key: 4, label: '備註', type: 'textarea', required: false, options: [] },
  ])
  const [nextKey, setNextKey] = useState(5)

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

  return (
    <div>
      <PageHeader
        title="報名活動建立"
        sub="自訂報名欄位;社團端子頁即時預覽於右側"
        extra={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button style={{ height: 36 }} onClick={() => message.success('已儲存草稿')}>儲存草稿</Button>
            <Button type="primary" style={{ height: 36 }} onClick={() => message.success('已發布')}>發布</Button>
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
                <div style={fieldLabel}>活動時間{requiredMark}</div>
                <Input className="num" defaultValue="2026/09/20 09:00-17:00" />
              </label>
              <label>
                <div style={fieldLabel}>地點</div>
                <Input defaultValue="國際大樓 IB-101" />
              </label>
              <label>
                <div style={fieldLabel}>報名截止{requiredMark}</div>
                <DatePicker style={{ width: '100%' }} format="YYYY/MM/DD" />
              </label>
              <label>
                <div style={fieldLabel}>每社團名額上限</div>
                <InputNumber style={{ width: '100%' }} min={1} value={cap} onChange={setCap} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                <div style={fieldLabel}>對象說明</div>
                <Input defaultValue="各社團幹部(至少 3 人)" />
              </label>
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>報名欄位</div>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>
                姓名、學號、系級為系統預設欄位,不需另建
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {fields.map((f) => (
                <div key={f.key} className="builder-field">
                  <div className="builder-field-main">
                    <HolderOutlined style={{ color: 'var(--muted)', cursor: 'grab' }} />
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
            <span style={{ fontSize: 11, color: 'var(--steel)', letterSpacing: 2, fontWeight: 500 }}>預覽</span>
            <span style={{ fontSize: 12, color: 'var(--steel)' }}>社團端呈現(即時)</span>
          </div>
          <div className="builder-preview-frame">
            <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 6, padding: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{name || '(未命名活動)'} — 報名</div>
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

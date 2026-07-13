import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { App, Button, Checkbox, Input, Radio, Select } from 'antd'
import { LeftOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { SIGNUP_ITEMS } from './mock'
import type { SignupField } from './types'

interface Participant {
  key: number
}

const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 500, marginBottom: 6 }
const requiredMark = <span style={{ color: '#C13B34' }}> *</span>

// 依管理員定義的欄位 schema 渲染輸入元件
function DynamicField({ field }: { field: SignupField }) {
  switch (field.type) {
    case 'textarea':
      return <Input.TextArea rows={2} placeholder={field.required ? undefined : '選填'} />
    case 'select':
      return (
        <Select
          style={{ width: '100%' }}
          placeholder="請選擇"
          options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
        />
      )
    case 'radio':
      return (
        <Radio.Group
          options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
          style={{ paddingTop: 6 }}
        />
      )
    case 'checkbox':
      return (
        <Checkbox.Group
          options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
          style={{ paddingTop: 6 }}
        />
      )
    default:
      return <Input placeholder={field.required ? undefined : '選填'} />
  }
}

export default function SignupFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const item = SIGNUP_ITEMS.find((s) => s.id === id)
  const [participants, setParticipants] = useState<Participant[]>([{ key: 1 }])
  const [nextKey, setNextKey] = useState(2)

  if (!item) {
    return (
      <div style={{ maxWidth: 720 }}>
        <PageHeader title="找不到報名活動" />
        <div className="card" style={{ marginTop: 20, padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--steel)' }}>
          此報名活動不存在或已下架。<Link to="/signup">返回線上報名</Link>
        </div>
      </div>
    )
  }

  const atCap = participants.length >= item.maxParticipants
  const addParticipant = () => {
    if (atCap) return
    setParticipants((ps) => [...ps, { key: nextKey }])
    setNextKey((k) => k + 1)
  }
  const removeParticipant = (key: number) =>
    setParticipants((ps) => (ps.length > 1 ? ps.filter((p) => p.key !== key) : ps))

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Link to="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
        <LeftOutlined style={{ fontSize: 12 }} />
        返回線上報名
      </Link>
      <div style={{ marginTop: 12 }}>
        <PageHeader title={`${item.name} — 報名`} />
      </div>

      <div className="card" style={{ marginTop: 16, padding: '18px 24px' }}>
        <div className="form-grid-2" style={{ gap: '12px 24px' }}>
          {item.time && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>活動時間</div>
              <div className="num" style={{ fontSize: 13, marginTop: 3 }}>{item.time}</div>
            </div>
          )}
          {item.place && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>地點</div>
              <div style={{ fontSize: 13, marginTop: 3 }}>{item.place}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 12, color: 'var(--steel)' }}>報名截止</div>
            <div className="num" style={{ fontSize: 13, marginTop: 3 }}>{item.deadline}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--steel)' }}>名額</div>
            <div style={{ fontSize: 13, marginTop: 3 }}>
              每社團至多 <span className="num">{item.maxParticipants}</span> 名
            </div>
          </div>
        </div>
      </div>

      {participants.map((p, idx) => (
        <div className="card" key={p.key} style={{ marginTop: idx === 0 ? 16 : 12, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              參加人 <span className="num">{idx + 1}</span>
            </div>
            <div style={{ flex: 1 }} />
            {participants.length > 1 && (
              <button type="button" className="link-btn danger" onClick={() => removeParticipant(p.key)}>
                移除
              </button>
            )}
          </div>
          <div className="form-grid-2">
            <label>
              <div style={fieldLabel}>姓名{requiredMark}</div>
              <Input />
            </label>
            <label>
              <div style={fieldLabel}>學號{requiredMark}</div>
              <Input className="num" />
            </label>
            <label>
              <div style={fieldLabel}>系級{requiredMark}</div>
              <Input />
            </label>
            {item.fields.map((f) => (
              <label key={f.key} style={f.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
                <div style={fieldLabel}>
                  {f.label}
                  {f.required && requiredMark}
                </div>
                <DynamicField field={f} />
              </label>
            ))}
          </div>
        </div>
      ))}

      {item.maxParticipants > 1 && (
        <button
          type="button"
          disabled={atCap}
          onClick={addParticipant}
          style={{
            marginTop: 12,
            width: '100%',
            height: 42,
            background: 'none',
            border: '1.5px dashed #C8CDD5',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            fontFamily: 'inherit',
            color: atCap ? 'var(--muted)' : 'var(--steel)',
            cursor: atCap ? 'not-allowed' : 'pointer',
          }}
        >
          + 新增參加人(<span className="num">{participants.length}/{item.maxParticipants}</span>)
        </button>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <Button onClick={() => navigate('/signup')}>取消</Button>
        <Button
          type="primary"
          onClick={() => {
            message.success('已送出報名')
            navigate('/signup')
          }}
        >
          送出報名
        </Button>
      </div>
    </div>
  )
}

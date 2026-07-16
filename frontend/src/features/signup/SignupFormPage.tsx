import { Link, useNavigate, useParams } from 'react-router'
import { App, Button, Checkbox, Form, Input, Radio, Select } from 'antd'
import { LeftOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { SIGNUP_ITEMS } from './mock'
import type { SignupField } from './types'
import SubmissionRecord from './SubmissionRecord'

// 依管理員定義的欄位 schema 渲染輸入元件
function dynamicControl(field: SignupField) {
  const options = (field.options ?? []).map((o) => ({ value: o, label: o }))
  switch (field.type) {
    case 'textarea':
      return <Input.TextArea rows={2} placeholder={field.required ? undefined : '選填'} />
    case 'select':
      return <Select style={{ width: '100%' }} placeholder="請選擇" options={options} />
    case 'radio':
      return <Radio.Group options={options} />
    case 'checkbox':
      return <Checkbox.Group options={options} />
    default:
      return <Input placeholder={field.required ? undefined : '選填'} />
  }
}

export default function SignupFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const item = SIGNUP_ITEMS.find((s) => s.id === id)

  if (item?.submission) {
    return (
      <div>
        <Link to="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <LeftOutlined style={{ fontSize: 12 }} />
          返回線上報名
        </Link>
        <div style={{ marginTop: 12 }}>
          <PageHeader title={`${item.name} — 報名紀錄`} />
        </div>
        <div className="card" style={{ marginTop: 16, padding: '18px 24px' }}>
          <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 12 }}>已完成報名;一經報名不得更改。</div>
          <SubmissionRecord item={item} />
        </div>
      </div>
    )
  }

  if (!item || item.status !== 'open') {
    return (
      <div>
        <Link to="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <LeftOutlined style={{ fontSize: 12 }} />
          返回線上報名
        </Link>
        <div style={{ marginTop: 12 }}>
          <PageHeader title={item ? `${item.name} — 報名` : '找不到報名活動'} />
        </div>
        <div
          className="card"
          style={{ marginTop: 16, padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--steel)' }}
        >
          {item ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <StatusPill status="ended" />
              <div>
                此活動已於 <span className="num">{item.deadline}</span> 截止報名
              </div>
            </div>
          ) : (
            '此報名活動不存在或已刪除'
          )}
        </div>
      </div>
    )
  }

  const onFinish = () => {
    message.success('已送出報名')
    navigate('/signup')
  }

  return (
    <div>
      <Link to="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
        <LeftOutlined style={{ fontSize: 12 }} />
        返回線上報名
      </Link>
      <div style={{ marginTop: 12 }}>
        <PageHeader title={`${item.name} — 報名`} />
      </div>

      <div className="card" style={{ marginTop: 16, padding: '18px 24px' }}>
        {item.description && (
          <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--line)' }}>
            {item.description}
          </div>
        )}
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
            <div style={{ fontSize: 12, color: 'var(--steel)' }}>截止日</div>
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

      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ participants: [{}] }} requiredMark>
        <Form.List name="participants">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f, idx) => (
                <div className="card" key={f.key} style={{ marginTop: idx === 0 ? 16 : 12, padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>
                      參加人 <span className="num">{idx + 1}</span>
                    </div>
                    <div style={{ flex: 1 }} />
                    {fields.length > 1 && (
                      <button type="button" className="link-btn danger" onClick={() => remove(f.name)}>
                        移除
                      </button>
                    )}
                  </div>
                  <div className="form-grid-2">
                    <Form.Item
                      name={[f.name, 'name']}
                      label="姓名"
                      rules={[{ required: true, message: '請輸入姓名' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name={[f.name, 'studentId']}
                      label="學號"
                      rules={[{ required: true, message: '請輸入學號' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input className="num" />
                    </Form.Item>
                    <Form.Item
                      name={[f.name, 'dept']}
                      label="系級"
                      rules={[{ required: true, message: '請輸入系級' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input />
                    </Form.Item>
                    {item.fields.map((fieldDef) => (
                      <Form.Item
                        key={fieldDef.key}
                        name={[f.name, fieldDef.key]}
                        label={fieldDef.label}
                        rules={fieldDef.required ? [{ required: true, message: `請填寫${fieldDef.label}` }] : undefined}
                        style={fieldDef.type === 'textarea' ? { gridColumn: '1 / -1', marginBottom: 0 } : { marginBottom: 0 }}
                      >
                        {dynamicControl(fieldDef)}
                      </Form.Item>
                    ))}
                  </div>
                </div>
              ))}

              {item.maxParticipants > 1 && (
                <button
                  type="button"
                  disabled={fields.length >= item.maxParticipants}
                  onClick={() => fields.length < item.maxParticipants && add({})}
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
                    color: fields.length >= item.maxParticipants ? 'var(--muted)' : 'var(--steel)',
                    cursor: fields.length >= item.maxParticipants ? 'not-allowed' : 'pointer',
                  }}
                >
                  + 新增參加人(
                  <span className="num">
                    {fields.length}/{item.maxParticipants}
                  </span>
                  )
                </button>
              )}
            </>
          )}
        </Form.List>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <Button onClick={() => navigate('/signup')}>取消</Button>
          <Button
            onClick={() => {
              message.success('已儲存草稿(本機示意,接後端後保存)')
            }}
          >
            儲存草稿
          </Button>
          <Button type="primary" htmlType="submit">
            送出報名
          </Button>
        </div>
      </Form>
    </div>
  )
}

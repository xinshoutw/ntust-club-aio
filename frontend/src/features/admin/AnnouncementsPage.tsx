import { App, Button, Form, Input, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { ANNOUNCEMENTS } from '../activities/mock'

const ATTRS = ['自治性', '學藝性', '服務性', '聯誼性', '藝術性', '體育性']

export default function AnnouncementsPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const target = Form.useWatch('target', form) as string | undefined

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader title="發布系統公告" />

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form
          form={form}
          layout="vertical"
          requiredMark
          initialValues={{ target: 'all' }}
          onFinish={() => {
            message.success('公告已發布')
            form.resetFields()
          }}
        >
          <Form.Item name="title" label="標題" rules={[{ required: true, message: '請輸入標題' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="content" label="內容" rules={[{ required: true, message: '請輸入內容' }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
          <div className="form-grid-2">
            <Form.Item name="target" label="發布對象" style={{ marginBottom: 0 }}>
              <Select
                options={[
                  { value: 'all', label: '全校社團' },
                  { value: 'attr', label: '依社團性質' },
                  { value: 'club', label: '單一社團' },
                ]}
              />
            </Form.Item>
            {target === 'attr' && (
              <Form.Item name="attr" label="性質" rules={[{ required: true, message: '請選擇性質' }]} style={{ marginBottom: 0 }}>
                <Select options={ATTRS.map((a) => ({ value: a, label: a }))} />
              </Form.Item>
            )}
            {target === 'club' && (
              <Form.Item name="club" label="社團" rules={[{ required: true, message: '請輸入社團名稱' }]} style={{ marginBottom: 0 }}>
                <Input placeholder="社團名稱" />
              </Form.Item>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit">發布</Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>已發布公告</div>
        {ANNOUNCEMENTS.map((a) => (
          <div key={a.id} style={{ padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{a.title}</div>
              <span style={{ fontSize: 12, color: 'var(--steel)', background: '#EEF0F3', borderRadius: 4, padding: '1px 6px' }}>{a.scope}</span>
              <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>{a.date}</span>
              <button type="button" className="link-btn danger" onClick={() => message.info('刪除公告(接後端後啟用)')}>刪除</button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--steel)', lineHeight: 1.7, marginTop: 4 }}>{a.content}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

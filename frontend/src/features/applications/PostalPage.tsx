import { useState } from 'react'
import { App, Button, Form, Input, Select, Upload } from 'antd'
import type { UploadFile } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'

const REASONS = ['更換郵局存簿代理人', '新開戶', '帳戶印鑑章變更', '帳簿遺失', '結清銷戶']

export default function PostalPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [files, setFiles] = useState<UploadFile[]>([])

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader title="郵局帳戶異動" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        更換代理人、新開戶、印鑑變更、帳簿遺失、結清銷戶;公文作業約 3–5 個工作天。
      </div>

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form
          form={form}
          layout="vertical"
          requiredMark
          onFinish={() => {
            message.success('已送出郵局帳戶異動申請')
            form.resetFields()
            setFiles([])
          }}
        >
          <div className="form-grid-2">
            <Form.Item name="reason" label="事由" rules={[{ required: true, message: '請選擇事由' }]} style={{ marginBottom: 0 }}>
              <Select placeholder="請選擇" options={REASONS.map((r) => ({ value: r, label: r }))} />
            </Form.Item>
            <Form.Item name="accountName" label="存簿戶名" rules={[{ required: true, message: '請輸入戶名' }]} style={{ marginBottom: 0 }}>
              <Input placeholder="例:資工系學會" />
            </Form.Item>
            <Form.Item
              name="accountNo"
              label="存簿局號、帳號(新開戶填「無」)"
              rules={[{ required: true, message: '請輸入局號帳號,新開戶填「無」' }]}
              style={{ marginBottom: 0 }}
            >
              <Input className="num" />
            </Form.Item>
            <Form.Item name="agent" label="新代理人姓名" rules={[{ required: true, message: '請輸入新代理人' }]} style={{ marginBottom: 0 }}>
              <Input />
            </Form.Item>
            <Form.Item
              name="phone"
              label="新代理人電話"
              rules={[{ required: true, message: '請輸入聯絡電話' }]}
              style={{ marginBottom: 0 }}
            >
              <Input className="num" />
            </Form.Item>
          </div>
          <Form.Item label="原存簿影本/新開戶申請表" required style={{ margin: '16px 0 0' }}>
            <Upload.Dragger
              accept=".pdf,image/*"
              fileList={files}
              beforeUpload={() => false}
              onChange={({ fileList }) => setFiles(fileList)}
              maxCount={1}
            >
              <p style={{ margin: '4px 0 8px' }}>
                <InboxOutlined style={{ fontSize: 28, color: 'var(--steel)' }} />
              </p>
              <p style={{ fontSize: 13, color: 'var(--steel)', margin: 0 }}>拖放或點擊選擇(PDF 或影像)</p>
            </Upload.Dragger>
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit">送出申請</Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>我的申請</div>
        <table className="tb" style={{ minWidth: 560 }}>
          <tbody>
            <tr>
              <td className="num" style={{ color: 'var(--steel)', width: 140 }}>PST-114-0022</td>
              <td style={{ fontWeight: 500 }}>更換郵局存簿代理人</td>
              <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                戶名:資工系學會 · 帳號:<span className="num">070***‑**312</span>
              </td>
              <td className="num" style={{ fontSize: 13, width: 110 }}>2026/06/12</td>
              <td style={{ width: 100 }}><StatusPill status="pending" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--steel)' }}>局號帳號預設遮罩,承辦於審核頁可見完整值。</div>
    </div>
  )
}

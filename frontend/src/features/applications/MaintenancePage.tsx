import { useState } from 'react'
import { App, Button, Form, Input, Upload } from 'antd'
import type { UploadFile } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import type { StatusKey } from '../../lib/status'

interface MaintenanceRecord {
  id: string
  location: string
  items: string
  date: string
  status: StatusKey
  handleNote?: string
}

const RECORDS: MaintenanceRecord[] = [
  { id: 'MNT-114-0023', location: '社團大樓 3F S304 音樂教室', items: '天花板漏水、燈管不亮', date: '2026/06/16', status: 'in_progress', handleNote: '已報修總務處,預計本週處理' },
  { id: 'MNT-114-0019', location: '社辦 S312', items: '門鎖損壞', date: '2026/05/02', status: 'done', handleNote: '已更換鎖芯' },
]

export default function MaintenancePage() {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [files, setFiles] = useState<UploadFile[]>([])

  return (
    <div>
      <PageHeader title="空間報修" />

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form
          form={form}
          layout="vertical"
          requiredMark
          onFinish={() => {
            if (!files.length) {
              message.error('請附上損壞照片或影片佐證。')
              return
            }
            message.success('已送出報修')
            form.resetFields()
            setFiles([])
          }}
        >
          <Form.Item name="location" label="地點" rules={[{ required: true, message: '請輸入地點' }]}>
            <Input placeholder="例:社團大樓 3F S304 音樂教室" />
          </Form.Item>
          <Form.Item name="items" label="損壞項目" rules={[{ required: true, message: '請描述損壞項目' }]}>
            <Input.TextArea rows={3} placeholder="例:天花板漏水、燈管不亮" />
          </Form.Item>
          <Form.Item label="佐證照片/影片" required>
            <Upload.Dragger
              multiple
              accept="image/*,video/*"
              fileList={files}
              beforeUpload={(f) => {
                const isVideo = f.type.startsWith('video/')
                const limit = isVideo ? 200 : 10
                if (f.size > limit * 1024 * 1024) {
                  message.error(`${isVideo ? '影片' : '照片'}超過 ${limit}MB 上限。`)
                  return Upload.LIST_IGNORE
                }
                return false
              }}
              onChange={({ fileList }) => setFiles(fileList)}
            >
              <p style={{ margin: '4px 0 8px' }}>
                <InboxOutlined style={{ fontSize: 28, color: 'var(--steel)' }} />
              </p>
              <p style={{ fontSize: 13, color: 'var(--steel)', margin: 0 }}>拖放或點擊選擇(照片、短片 ≤200MB)</p>
            </Upload.Dragger>
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" htmlType="submit">送出報修</Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近報修</div>
        <table className="tb" style={{ minWidth: 620 }}>
          <tbody>
            {RECORDS.slice(0, 5).map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{r.location}</div>
                  <div style={{ fontSize: 13, color: 'var(--steel)' }}>{r.items}</div>
                  {r.handleNote && (
                    <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>處理備註:{r.handleNote}</div>
                  )}
                </td>
                <td className="num" style={{ fontSize: 13, width: 110 }}>{r.date}</td>
                <td style={{ width: 100 }}><StatusPill status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

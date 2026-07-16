import { useState } from 'react'
import { App, Button, Form, Input } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import AttachmentArea, { type BagFile } from '../../components/ui/AttachmentArea'
import StatusPill from '../../components/ui/StatusPill'
import { IMAGE_ACCEPT, isImageFile, isVideoFile } from '../../lib/uploads'
import type { StatusKey } from '../../lib/status'

// 影片 200MB / 圖片 10MB(architecture.md);魔術位元組驗證,加總上限取單檔最大值
const MAX_VIDEO_BYTES = 200 * 1024 * 1024
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

async function validateEvidence(f: File): Promise<string | null> {
  if (await isImageFile(f)) return f.size <= MAX_IMAGE_BYTES ? null : '照片超過 10 MB 上限'
  if (await isVideoFile(f)) return f.size <= MAX_VIDEO_BYTES ? null : '影片超過 200 MB 上限'
  return '不是有效的照片或影片檔'
}

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
  const [files, setFiles] = useState<BagFile[]>([])

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
              message.error('請附上損壞照片或影片佐證')
              return
            }
            message.success('已送出報修')
            form.resetFields()
            setFiles([])
          }}
        >
          <Form.Item name="location" label="地點" rules={[{ required: true, message: '請輸入地點' }]}>
            <Input placeholder="社團大樓 3F S304 音樂教室" />
          </Form.Item>
          <Form.Item name="items" label="損壞項目" rules={[{ required: true, message: '請描述損壞項目' }]}>
            <Input.TextArea rows={3} placeholder="天花板漏水、燈管不亮" />
          </Form.Item>
          <Form.Item label="佐證照片 / 影片" required>
            <AttachmentArea
              value={files}
              onChange={setFiles}
              accept={`${IMAGE_ACCEPT},video/*`}
              hint="拖放或點擊選擇(照片 ≤10MB、短片 ≤200MB)"
              validate={validateEvidence}
              maxTotalBytes={MAX_VIDEO_BYTES}
            />
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

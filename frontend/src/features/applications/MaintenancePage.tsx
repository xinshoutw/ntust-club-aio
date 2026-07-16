import { useState } from 'react'
import { App, Button, Form, Input, Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import AttachmentArea, { type BagFile } from '../../components/ui/AttachmentArea'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { IMAGE_ACCEPT, isImageFile, isVideoFile } from '../../lib/uploads'
import { useMaintenanceList, useMaintenanceMutations } from '../../api/applications'

// 佐證加總上限 100MB(2026-07-17 改依申請性質給總量;後端 system_settings 為權威值);
// 單檔仍過型別 magic-byte 與各自單檔上界(影片 200MB / 圖片 10MB,architecture.md)
const MAX_EVIDENCE_TOTAL_BYTES = 100 * 1024 * 1024
const MAX_VIDEO_BYTES = 200 * 1024 * 1024
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

async function validateEvidence(f: File): Promise<string | null> {
  if (await isImageFile(f)) return f.size <= MAX_IMAGE_BYTES ? null : '照片超過 10 MB 上限'
  if (await isVideoFile(f)) return f.size <= MAX_VIDEO_BYTES ? null : '影片超過 200 MB 上限'
  return '不是有效的照片或影片檔'
}

export default function MaintenancePage() {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [files, setFiles] = useState<BagFile[]>([])
  const [filesError, setFilesError] = useState(false)

  const listQuery = useMaintenanceList()
  const records = listQuery.data?.records ?? []
  const { submit } = useMaintenanceMutations()

  return (
    <div>
      <PageHeader title="空間報修" />

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form
          form={form}
          layout="vertical"
          requiredMark
          onFinish={(values: { location: string; items: string }) => {
            if (!files.length) {
              setFilesError(true)
              message.error('請附上損壞照片或影片佐證')
              return
            }
            // 先 POST 主體,再逐檔上傳佐證;失敗保留表單內容
            submit.mutate(
              { location: values.location, items: values.items, files: files.map((b) => b.file) },
              {
                onSuccess: () => {
                  message.success('已送出報修')
                  form.resetFields()
                  setFiles([])
                },
                onError: (e) => message.error(e.message),
              },
            )
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
              onChange={(next) => {
                setFilesError(false)
                setFiles(next)
              }}
              error={filesError}
              accept={`${IMAGE_ACCEPT},video/*`}
              hint="拖放圖片或影片檔案"
              validate={validateEvidence}
              maxTotalBytes={MAX_EVIDENCE_TOTAL_BYTES}
              maxCount={5}
            />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" htmlType="submit" loading={submit.isPending}>送出報修</Button>
          </div>
        </Form>
      </div>

      <Spin spinning={listQuery.isPending}>
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近報修</div>
          <table className="tb" aria-label="空間報修紀錄" style={{ minWidth: 620 }}>
            <thead>
              <tr>
                <th scope="col">報修內容</th>
                <th scope="col">申請日期</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
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
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={3}>
                    <QueryError compact title="報修紀錄載入失敗" error={listQuery.error} onRetry={() => listQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && records.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>尚無報修紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>
    </div>
  )
}

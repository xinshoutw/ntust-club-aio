import { useState } from 'react'
import { App, Button, Checkbox, Form, Input } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import AttachmentArea, { type BagFile } from '../../components/ui/AttachmentArea'
import StatusPill from '../../components/ui/StatusPill'
import { IMAGE_ACCEPT, isImageFile, isPdfFile } from '../../lib/uploads'

const REASONS = ['更換郵局存簿代理人', '新開戶', '帳戶印鑑章變更', '帳簿遺失', '存簿密碼異動', '結清銷戶']
// 互斥組合(依承辦邏輯先行判斷,待確認)
const CONFLICTS: [string, string][] = [
  ['更換郵局存簿代理人', '新開戶'],
  ['新開戶', '結清銷戶'],
  ['更換郵局存簿代理人', '結清銷戶'],
]

export default function PostalPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [files, setFiles] = useState<BagFile[]>([])
  const [filesError, setFilesError] = useState(false)
  const reasons: string[] = Form.useWatch('reasons', form) ?? []

  const disabled = (r: string) =>
    CONFLICTS.some(([a, b]) => (r === a && reasons.includes(b)) || (r === b && reasons.includes(a)))

  const needAgent = reasons.includes('更換郵局存簿代理人') || reasons.includes('新開戶')
  const needAccountNo = !reasons.includes('新開戶') || reasons.length > 1

  return (
    <div>
      <PageHeader title="郵局帳戶異動" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        公文作業約 3–5 個工作天
      </div>

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form
          form={form}
          layout="vertical"
          requiredMark
          onFinish={() => {
            if (!files.length) {
              setFilesError(true)
              message.error('請上傳原存簿影本或新開戶申請表')
              return
            }
            message.success('已送出郵局帳戶異動申請')
            form.resetFields()
            setFiles([])
          }}
        >
          <Form.Item
            name="reasons"
            label="事由"
            rules={[{ required: true, message: '請勾選至少一項事由' }]}
          >
            <Checkbox.Group
              options={REASONS.map((r) => ({ value: r, label: r, disabled: disabled(r) }))}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}
            />
          </Form.Item>
          <div className="form-grid-2">
            <Form.Item name="accountName" label="存簿戶名" rules={[{ required: true, message: '請輸入戶名' }]} style={{ marginBottom: 0 }}>
              <Input placeholder="資工系學會" />
            </Form.Item>
            {needAccountNo && (
              <Form.Item
                name="accountNo"
                label="存簿局號、帳號"
                preserve={false}
                rules={[{ required: true, message: '請輸入局號帳號' }]}
                style={{ marginBottom: 0 }}
              >
                <Input className="num" />
              </Form.Item>
            )}
            {needAgent && (
              <>
                <Form.Item name="agent" label="新代理人姓名" preserve={false} rules={[{ required: true, message: '請輸入新代理人' }]} style={{ marginBottom: 0 }}>
                  <Input />
                </Form.Item>
                <Form.Item name="phone" label="新代理人電話" preserve={false} rules={[{ required: true, message: '請輸入聯絡電話' }]} style={{ marginBottom: 0 }}>
                  <Input className="num" />
                </Form.Item>
              </>
            )}
          </div>
          <Form.Item label="原存簿影本/新開戶申請表" required style={{ margin: '16px 0 0' }}>
            <AttachmentArea
              value={files}
              onChange={(next) => {
                setFilesError(false)
                setFiles(next)
              }}
              error={filesError}
              accept={`.pdf,${IMAGE_ACCEPT}`}
              hint="拖放或點擊選擇(PDF 或影像)"
              validate={async (f) => ((await isPdfFile(f)) || (await isImageFile(f)) ? null : '不是有效的 PDF 或影像檔')}
              maxTotalBytes={50 * 1024 * 1024}
              maxCount={1}
            />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit">送出申請</Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近申請</div>
        <table className="tb" style={{ minWidth: 520 }}>
          <tbody>
            <tr>
              <td style={{ fontWeight: 500 }}>更換郵局存簿代理人</td>
              <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                戶名:資工系學會 · 帳號:<span className="num">0031307‑0524312</span>
              </td>
              <td className="num" style={{ fontSize: 13, width: 110 }}>2026/06/12</td>
              <td style={{ width: 100 }}><StatusPill status="pending" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

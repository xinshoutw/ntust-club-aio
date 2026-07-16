import { useState } from 'react'
import { App, Button, Checkbox, Form, Input, Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import AttachmentArea, { type BagFile } from '../../components/ui/AttachmentArea'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { IMAGE_ACCEPT, isImageFile, isPdfFile } from '../../lib/uploads'
import { usePostalList, usePostalMutations } from '../../api/applications'

const REASONS = ['更換郵局存簿代理人', '新開戶', '帳戶印鑑章變更', '帳簿遺失', '存簿密碼異動', '結清銷戶']
// 互斥組合(依承辦邏輯先行判斷,與後端同規則)
const CONFLICTS: [string, string][] = [
  ['更換郵局存簿代理人', '新開戶'],
  ['新開戶', '結清銷戶'],
  ['更換郵局存簿代理人', '結清銷戶'],
]

interface PostalFormValues {
  reasons: string[]
  accountName: string
  accountNo: string
  agent?: string
  phone?: string
}

export default function PostalPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm<PostalFormValues>()
  const [files, setFiles] = useState<BagFile[]>([])
  const [filesError, setFilesError] = useState(false)
  const reasons: string[] = Form.useWatch('reasons', form) ?? []

  const listQuery = usePostalList()
  const records = listQuery.data?.records ?? []
  const { submit } = usePostalMutations()

  const disabled = (r: string) =>
    CONFLICTS.some(([a, b]) => (r === a && reasons.includes(b)) || (r === b && reasons.includes(a)))

  const needAgent = reasons.includes('更換郵局存簿代理人') || reasons.includes('新開戶')

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
          onFinish={(values: PostalFormValues) => {
            if (!files.length) {
              setFilesError(true)
              message.error('請上傳原存簿影本或新開戶申請表')
              return
            }
            // 先 POST 主體,再上傳存簿附件;失敗保留表單內容
            submit.mutate(
              {
                reasons: values.reasons,
                accountName: values.accountName,
                accountNumber: values.accountNo,
                agentName: values.agent,
                agentPhone: values.phone,
                passbook: files[0].file,
              },
              {
                onSuccess: () => {
                  message.success('已送出郵局帳戶異動申請')
                  form.resetFields()
                  setFiles([])
                },
                onError: (e) => message.error(e.message),
              },
            )
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
            <Form.Item
              name="accountNo"
              label="存簿局號、帳號"
              rules={[
                { required: true, message: '請輸入局號帳號' },
                { pattern: /^[\d-]{6,20}$/, message: '局號帳號為 6–20 碼數字(可含 -)' },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input className="num" />
            </Form.Item>
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
            <Button type="primary" htmlType="submit" loading={submit.isPending}>送出申請</Button>
          </div>
        </Form>
      </div>

      <Spin spinning={listQuery.isPending}>
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近申請</div>
          <table className="tb" style={{ minWidth: 520 }}>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.reasons.join('、')}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                    戶名:{r.accountName} · 帳號:<span className="num">{r.accountNumber}</span>
                  </td>
                  <td className="num" style={{ fontSize: 13, width: 110 }}>{r.date}</td>
                  <td style={{ width: 100 }}><StatusPill status={r.status} /></td>
                </tr>
              ))}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={4}>
                    <QueryError compact title="申請紀錄載入失敗" error={listQuery.error} onRetry={() => listQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && records.length === 0 && (
                <tr className="no-hover">
                  <td style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>尚無申請紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>
    </div>
  )
}

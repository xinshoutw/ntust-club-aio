import { useState } from 'react'
import { App, Button, Checkbox, Form, Input } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { useFormUnsavedGuard } from '../../app/unsaved'
import PageHeader from '../../components/ui/PageHeader'
import AttachmentArea, { type BagFile } from '../../components/ui/AttachmentArea'
import AttachmentRetryModal from './AttachmentRetryModal'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols } from '../../components/ui/tableControls'
import { IMAGE_ACCEPT, isImageFile, isPdfFile } from '../../lib/uploads'
import { usePostalList, usePostalMutations, useRecentPostal } from '../../api/applications'

const REASONS = ['更換郵局存簿代理人', '新開戶', '帳戶印鑑章變更', '帳簿遺失', '存簿密碼異動', '結清銷戶']
// 「新開戶申請表」空白表由站內留存(異動走 infra,前端不提供替換)
const NEW_ACCOUNT_FORM = '/postal-new-account-form.pdf'
// 事由不設互斥組合,欄位除事由外全部選填(decisions.md D-07):
// 一次辦好幾件本來就常見,而結清銷戶不必填新代理人、新開戶當下也還沒有帳號

interface PostalFormValues {
  reasons: string[]
  accountName?: string
  accountNo?: string
  agent?: string
  phone?: string
}

export default function PostalPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm<PostalFormValues>()
  const [files, setFiles] = useState<BagFile[]>([])
  const guard = useFormUnsavedGuard(files.length > 0)
  const [filesError, setFilesError] = useState(false)
  const reasons: string[] = Form.useWatch('reasons', form) ?? []

  const listQuery = usePostalList()
  const recentQuery = useRecentPostal()
  // 正在申請=未完成全部、最近申請=已完成近 5 筆,兩份都由後端篩好
  const activeRows = listQuery.data?.records ?? []
  const recentRows = recentQuery.data ?? []
  const { submit, addPassbook } = usePostalMutations()
  // 存簿影本沒上去的單:給補傳入口,不要讓社團再送一張新的(decisions.md D-06)
  const [retryId, setRetryId] = useState<number | null>(null)

  const isNewAccount = reasons.includes('新開戶')

  return (
    <div>
      <PageHeader title="郵局帳戶異動" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        公文作業約 3–5 個工作天
      </div>

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form
          onValuesChange={guard.onValuesChange}
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
                  guard.clear()
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
              options={REASONS.map((r) => ({ value: r, label: r }))}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}
            />
          </Form.Item>
          <div className="form-grid-2">
            <Form.Item name="accountName" label="存簿戶名" style={{ marginBottom: 0 }}>
              <Input placeholder="資工系學會" />
            </Form.Item>
            <Form.Item
              name="accountNo"
              label="存簿局號、帳號"
              rules={[{ pattern: /^[\d-]{6,20}$/, message: '局號帳號為 6–20 碼數字(可含 -)' }]}
              style={{ marginBottom: 0 }}
            >
              <Input className="num" />
            </Form.Item>
            <Form.Item name="agent" label="新代理人姓名" style={{ marginBottom: 0 }}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="新代理人電話" style={{ marginBottom: 0 }}>
              <Input className="num" />
            </Form.Item>
          </div>
          <Form.Item
            label="原存簿影本/新開戶申請表"
            required
            style={{ margin: '16px 0 0' }}
            extra={
              isNewAccount ? (
                <a href={NEW_ACCOUNT_FORM} target="_blank" rel="noreferrer">
                  下載「社團於本校郵局新開戶申請表」空白表
                </a>
              ) : undefined
            }
          >
            <AttachmentArea
              value={files}
              onChange={(next) => {
                setFilesError(false)
                setFiles(next)
              }}
              error={filesError}
              accept={`.pdf,${IMAGE_ACCEPT}`}
              hint="拖放 PDF 或圖片檔案"
              validate={async (f) => ((await isPdfFile(f)) || (await isImageFile(f)) ? null : '不是有效的 PDF 或影像檔')}
              maxTotalBytes={50 * 1024 * 1024}
              maxCount={1}
            />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit" loading={submit.isPending} disabled={submit.isPending}>送出申請</Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>正在申請</div>
        <LoadingBlock pending={listQuery.isPending}>
          <table className="tb fixed" aria-label="郵局帳戶異動申請紀錄" style={{ minWidth: 520 }}>
            <Cols widths={['30%', 'auto', 110, 100, 108]} />
            <thead>
              <tr>
                <th scope="col">事由</th>
                <th scope="col">帳戶資訊</th>
                <th scope="col">申請日期</th>
                <th scope="col">狀態</th>
                <th scope="col">存簿影本</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.reasons.join('、')}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                    戶名:{r.accountName || '—'} · 帳號:<span className="num">{r.accountNumber || '—'}</span>
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>{r.date}</td>
                  <td><StatusPill status={r.status} /></td>
                  <td>
                    {r.attachmentCount > 0 ? (
                      <span style={{ fontSize: 13, color: 'var(--steel)' }}>已附</span>
                    ) : (
                      <button type="button" className="link-btn" style={{ padding: 0, color: '#C13B34' }} onClick={() => setRetryId(r.id)}>
                        補傳
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={5}>
                    <QueryError compact title="申請紀錄載入失敗" error={listQuery.error} onRetry={() => listQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && activeRows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有進行中的申請</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近申請</div>
        <LoadingBlock pending={recentQuery.isPending}>
          <table className="tb fixed" aria-label="郵局帳戶異動申請紀錄" style={{ minWidth: 520 }}>
            <Cols widths={['30%', 'auto', 110, 100]} />
            <thead>
              <tr>
                <th scope="col">事由</th>
                <th scope="col">帳戶資訊</th>
                <th scope="col">申請日期</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {recentRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.reasons.join('、')}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                    戶名:{r.accountName || '—'} · 帳號:<span className="num">{r.accountNumber || '—'}</span>
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>{r.date}</td>
                  <td><StatusPill status={r.status} /></td>
                </tr>
              ))}
              {recentQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={4}>
                    <QueryError compact title="申請紀錄載入失敗" error={recentQuery.error} onRetry={() => recentQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!recentQuery.isPending && !recentQuery.isError && recentRows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>尚無申請紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
      </div>

      <AttachmentRetryModal
        open={retryId != null}
        title="補傳存簿影本"
        accept={`${IMAGE_ACCEPT},application/pdf`}
        hint="拖放 PDF 或影像檔案"
        validate={async (f) => ((await isPdfFile(f)) || (await isImageFile(f)) ? null : '不是有效的 PDF 或影像檔')}
        maxTotalBytes={50 * 1024 * 1024}
        maxCount={1}
        uploading={addPassbook.isPending}
        onUpload={async (files) => {
          try {
            await addPassbook.mutateAsync({ id: retryId as number, file: files[0] })
            message.success('存簿影本已補傳')
          } catch (e) {
            message.error(e instanceof Error ? e.message : '上傳失敗')
            throw e
          }
        }}
        onClose={() => setRetryId(null)}
      />
    </div>
  )
}

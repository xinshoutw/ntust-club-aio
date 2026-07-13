import { useState } from 'react'
import { App, Form, Input, Modal } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { VIOLATIONS, type Violation } from '../violations/mock'

export default function AdminViolationsPage() {
  const { message } = App.useApp()
  const [resolving, setResolving] = useState<Violation | null>(null)
  const [form] = Form.useForm()

  return (
    <div>
      <PageHeader
        title="違規管理"
        sub={
          <>
            未銷案 <span className="num">{VIOLATIONS.filter((v) => v.status === 'violation_open').length}</span> 筆
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb dense" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>單號</th>
              <th>社團</th>
              <th>日期</th>
              <th>地點</th>
              <th>項目</th>
              <th>填寫</th>
              <th>狀態</th>
              <th className="r">動作</th>
            </tr>
          </thead>
          <tbody>
            {VIOLATIONS.map((v) => (
              <tr key={v.id}>
                <td className="num" style={{ color: 'var(--steel)' }}>{v.id}</td>
                <td>{v.club}</td>
                <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                <td>{v.location}</td>
                <td style={{ fontSize: 13 }}>
                  <div>{v.items.join('、')}</div>
                  {v.note && <div style={{ fontSize: 12, color: 'var(--steel)' }}>{v.note}</div>}
                </td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{v.filler}</td>
                <td><StatusPill status={v.status} /></td>
                <td className="r">
                  {v.status === 'violation_open' && (
                    <button type="button" className="link-btn primary" onClick={() => setResolving(v)}>
                      銷案…
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {VIOLATIONS.length === 0 && (
              <tr className="no-hover">
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有違規勸導紀錄。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!resolving}
        title={`銷案 ${resolving?.id ?? ''}`}
        okText="確認銷案"
        onOk={() => form.submit()}
        onCancel={() => {
          setResolving(null)
          form.resetFields()
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values: { note: string }) => {
            message.success(`已銷案 ${resolving?.id}:${values.note}`)
            setResolving(null)
            form.resetFields()
          }}
        >
          <Form.Item name="note" label="銷案說明(必填)" rules={[{ required: true, message: '請輸入銷案說明' }]}>
            <Input.TextArea rows={2} placeholder="例:已完成愛校服務 2 小時" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

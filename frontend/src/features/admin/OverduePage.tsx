import { useState } from 'react'
import { App, Button, DatePicker, Form, Input, Modal } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { EQUIPMENT_LOANS } from '../bookings/mock'
import ClubCascader from './ClubCascader'

interface Suspension {
  club: string
  until: string
  reason: string
}

const SUSPENSIONS: Suspension[] = [
  { club: '機械系學會', until: '2026/07/15', reason: '器材損壞未賠償' },
]

export default function OverduePage() {
  const { message } = App.useApp()
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [form] = Form.useForm()
  const overdue = EQUIPMENT_LOANS.filter((l) => l.status === 'overdue')

  return (
    <div>
      <PageHeader
        title="逾期追蹤與停權"
        extra={
          <Button danger onClick={() => setSuspendOpen(true)}>
            停權社團…
          </Button>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>逾期未還器材</div>
        <table className="tb dense" style={{ minWidth: 720 }}>
          <tbody>
            {overdue.map((l) => (
              <tr key={l.id}>
                <td>{l.club}</td>
                <td style={{ fontWeight: 500 }}>
                  {l.equipment} <span className="num">×{l.qty}</span>
                </td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>
                  歸還期限 <span className="num">{l.returnDue}</span> · 借出點交:{l.checkoutBy}
                </td>
                <td style={{ width: 110 }}><StatusPill status="overdue" /></td>
                <td className="r" style={{ width: 100 }}>
                  <button type="button" className="link-btn" onClick={() => message.success(`已通知 ${l.club} 儘速歸還`)}>
                    寄送提醒
                  </button>
                </td>
              </tr>
            ))}
            {overdue.length === 0 && (
              <tr className="no-hover">
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有逾期未還的器材</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>停權中社團</div>
        <table className="tb" style={{ minWidth: 560 }}>
          <tbody>
            {SUSPENSIONS.map((s) => (
              <tr key={s.club}>
                <td style={{ fontWeight: 500, width: 160 }}>{s.club}</td>
                <td style={{ width: 100 }}><StatusPill status="suspended" /></td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>
                  至 <span className="num">{s.until}</span> · {s.reason}
                </td>
                <td className="r" style={{ width: 100 }}>
                  <button type="button" className="link-btn primary" onClick={() => message.success(`已解除 ${s.club} 停權`)}>
                    解除停權
                  </button>
                </td>
              </tr>
            ))}
            {SUSPENSIONS.length === 0 && (
              <tr className="no-hover">
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有停權中的社團</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={suspendOpen}
        title="停權社團"
        okText="確認停權"
        destroyOnHidden
        okButtonProps={{ danger: true }}
        onOk={() => form.submit()}
        onCancel={() => {
          setSuspendOpen(false)
          form.resetFields()
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v: { club: string }) => {
            message.success(`已停權 ${v.club}`)
            setSuspendOpen(false)
            form.resetFields()
          }}
        >
          <Form.Item name="club" label="社團" rules={[{ required: true, message: '請選擇社團' }]}>
            <ClubCascader width="100%" placeholder="請選擇" />
          </Form.Item>
          <Form.Item name="until" label="停權至" rules={[{ required: true, message: '請選擇日期' }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY/MM/DD" />
          </Form.Item>
          <Form.Item name="reason" label="原因(必填,通知社團)" rules={[{ required: true, message: '停權原因為必填' }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

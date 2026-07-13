import { useState } from 'react'
import { App, Button, DatePicker, Form, Input, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { VENUE_BOOKINGS, VENUES } from './mock'
import PeriodPicker from './PeriodPicker'

export default function VenueBookingPage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [periods, setPeriods] = useState<string[]>([])
  const mine = VENUE_BOOKINGS.filter((v) => v.club === user?.club).slice(0, 5)

  const submit = (values: { venue: string }) => {
    if (!periods.length) {
      message.error('請選擇至少一個時段。')
      return
    }
    message.success(`已送出「${values.venue}」借用申請(第 ${periods.join('、')} 節)`)
    form.resetFields()
    setPeriods([])
  }

  return (
    <div>
      <PageHeader title="臨時場地借用" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        單日活動之場地借用;核准後依核定時段使用。
      </div>

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form form={form} layout="vertical" onFinish={submit} requiredMark>
          <div className="form-grid-2">
            <Form.Item name="venue" label="場地" rules={[{ required: true, message: '請選擇場地' }]} style={{ marginBottom: 0 }}>
              <Select
                placeholder="請選擇"
                options={VENUES.filter((v) => v.allowTemp).map((v) => ({
                  value: v.name,
                  label: `${v.name}(${v.category} · ${v.capacity} 人)`,
                }))}
              />
            </Form.Item>
            <Form.Item name="purpose" label="用途" style={{ marginBottom: 0 }}>
              <Input placeholder="例:迎新擺攤" />
            </Form.Item>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, margin: '18px 0 8px' }}>
            時段 <span style={{ color: '#C13B34' }}>*</span>
            <span style={{ fontWeight: 400, color: 'var(--steel)', marginLeft: 8, fontSize: 12 }}>可按住拖曳批量選取</span>
          </div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '10px 12px' }}>
            <Form.Item name="date" rules={[{ required: true, message: '請選擇日期' }]} style={{ marginBottom: 8 }}>
              <DatePicker format="YYYY/MM/DD" placeholder="日期" />
            </Form.Item>
            <PeriodPicker size="small" nowrap value={periods} onChange={setPeriods} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit">送出申請</Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>我的申請(近 5 筆)</div>
        <table className="tb" style={{ minWidth: 560 }}>
          <tbody>
            {mine.map((v) => (
              <tr key={v.id}>
                <td style={{ fontWeight: 500 }}>{v.venue}</td>
                <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                <td style={{ color: 'var(--steel)', fontSize: 13 }}>第 {v.periods.join('、')} 節</td>
                <td style={{ width: 110 }}><StatusPill status={v.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

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
  const mine = VENUE_BOOKINGS.filter((v) => v.club === user?.club)

  const submit = (values: { venue: string }) => {
    if (!periods.length) {
      message.error('請選擇至少一個節次。')
      return
    }
    message.success(`已送出「${values.venue}」借用申請(第 ${periods.join('、')} 節)`)
    form.resetFields()
    setPeriods([])
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
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
            <Form.Item name="date" label="日期" rules={[{ required: true, message: '請選擇日期' }]} style={{ marginBottom: 0 }}>
              <DatePicker style={{ width: '100%' }} format="YYYY/MM/DD" />
            </Form.Item>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, margin: '18px 0 8px' }}>
            節次 <span style={{ color: '#C13B34' }}>*</span>
            <span style={{ fontWeight: 400, color: 'var(--steel)', marginLeft: 8, fontSize: 12 }}>可複選</span>
          </div>
          <PeriodPicker value={periods} onChange={setPeriods} />
          <Form.Item name="purpose" label="用途" style={{ margin: '16px 0 0' }}>
            <Input placeholder="例:迎新擺攤" />
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
            {mine.map((v) => (
              <tr key={v.id}>
                <td className="num" style={{ color: 'var(--steel)', width: 150 }}>{v.id}</td>
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

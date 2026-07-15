import { useState } from 'react'
import { useSearchParams } from 'react-router'
import dayjs from 'dayjs'
import { App, Button, DatePicker, Form, Input, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { PERIODS, VENUE_BOOKINGS, VENUES } from './mock'
import PeriodPicker from './PeriodPicker'

export default function VenueBookingPage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  // 借用總覽格子點入時自動帶入場地、日期、時段
  const [params] = useSearchParams()
  const qVenue = params.get('venue')
  const prefillVenue = VENUES.some((v) => v.allowTemp && v.name === qVenue) ? qVenue ?? undefined : undefined
  const rawDate = params.get('date')
  // 嚴格驗證 query 日期(非嚴格 parse 會把 2026/99/99 正規化成別的日期)
  const qDate = rawDate && dayjs(rawDate, 'YYYY/MM/DD', true).isValid() ? rawDate : undefined
  const qPeriod = params.get('period')
  const [periods, setPeriods] = useState<string[]>(() => (qPeriod && PERIODS.includes(qPeriod) ? [qPeriod] : []))
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
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          requiredMark
          initialValues={{ venue: prefillVenue, date: qDate ? dayjs(qDate, 'YYYY/MM/DD') : undefined }}
        >
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
            <Form.Item name="purpose" label="用途" rules={[{ required: true, message: '請輸入用途' }]} style={{ marginBottom: 0 }}>
              <Input placeholder="例:迎新擺攤" />
            </Form.Item>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, margin: '18px 0 8px' }}>
            時段 <span style={{ color: '#C13B34' }}>*</span>
            <span style={{ fontWeight: 400, color: 'var(--steel)', marginLeft: 8, fontSize: 12 }}>可按住拖曳批量選取</span>
          </div>
          <div style={{ background: 'var(--paper)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Form.Item name="date" rules={[{ required: true, message: '請選擇日期' }]} style={{ marginBottom: 0, flexShrink: 0 }}>
              <DatePicker format="YYYY/MM/DD" placeholder="日期" style={{ width: 140 }} />
            </Form.Item>
            <div style={{ flex: 1, minWidth: 280 }}>
              <PeriodPicker size="small" nowrap value={periods} onChange={setPeriods} />
            </div>
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

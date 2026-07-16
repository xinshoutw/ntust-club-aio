import { useState } from 'react'
import { useSearchParams } from 'react-router'
import dayjs from 'dayjs'
import { App, Button, DatePicker, Form, Input, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { CLUB_ACTIVITIES } from '../activities/mock'
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
  const [periodsError, setPeriodsError] = useState(false)
  const mine = VENUE_BOOKINGS.filter((v) => v.club === user?.club).slice(0, 5)
  // 借用需綁定審核通過之活動(與器材借用一致)
  const approved = CLUB_ACTIVITIES.filter((a) => a.club === user?.club && a.status === 'approved')

  const submit = (values: { venue: string }) => {
    if (!periods.length) {
      setPeriodsError(true)
      message.error('請選擇至少一個時段')
      return
    }
    message.success(`已送出「${values.venue}」借用申請（${periods.join('、')}）`)
    form.resetFields()
    setPeriods([])
  }

  return (
    <div>
      <PageHeader title="臨時場地借用" />

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
                  label: `${v.name} (${v.capacity} 人)`,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="activity"
              label="關聯活動"
              rules={[{ required: true, message: '請選擇活動' }]}
              style={{ marginBottom: 0 }}
            >
              <Select
                placeholder="請選擇活動"
                options={approved.map((a) => ({ value: a.id, label: `${a.name}` }))}
                notFoundContent="無審核通過之活動"
              />
            </Form.Item>

            <Form.Item
                name="purpose"
                label="用途"
                rules={[{ required: true, message: '請輸入用途' }]}
                style={{ marginBottom: 0, gridColumn: '1 / -1'  }}
            >
              <Input placeholder="簡述說明" />
            </Form.Item>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, margin: '18px 0 8px' }}>
            時段 <span style={{ color: '#C13B34' }}>*</span>
          </div>
          <div
            className={periodsError ? 'area-error' : undefined}
            style={{ background: 'var(--paper)', borderRadius: 8, padding: '10px 12px', border: '1px solid transparent', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
          >
            <Form.Item name="date" rules={[{ required: true, message: '請選擇日期' }]} style={{ marginBottom: 0, flexShrink: 0 }}>
              <DatePicker format="YYYY/MM/DD" placeholder="日期" style={{ width: 140 }} />
            </Form.Item>
            <div style={{ flex: 1, minWidth: 280 }}>
              <PeriodPicker
                size="small"
                nowrap
                value={periods}
                onChange={(next) => {
                  setPeriodsError(false)
                  setPeriods(next)
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit">送出申請</Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近申請</div>
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

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { App, Button, DatePicker, Form, Input, Select, Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import {
  PERIODS,
  useBookingMutations,
  useVenueBookings,
  useVenues,
  venueLabel,
} from '../../api/bookings'
import { useActivityList } from '../../api/activities'
import PeriodPicker from './PeriodPicker'

export default function VenueBookingPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  // 借用總覽格子點入時自動帶入場地、日期、時段
  const [params] = useSearchParams()
  const qVenueId = Number(params.get('venue'))
  const rawDate = params.get('date')
  // 嚴格驗證 query 日期(非嚴格 parse 會把 2026/99/99 正規化成別的日期)
  const qDate = rawDate && dayjs(rawDate, 'YYYY/MM/DD', true).isValid() ? rawDate : undefined
  const qPeriod = params.get('period')
  const [periods, setPeriods] = useState<string[]>(() => (qPeriod && PERIODS.includes(qPeriod) ? [qPeriod] : []))
  const [periodsError, setPeriodsError] = useState(false)

  const venuesQuery = useVenues()
  const venues = venuesQuery.data ?? []
  const tempVenues = venues.filter((v) => v.allowTemp)
  // 借用需綁定審核通過之活動(與器材借用一致;共用活動域查詢)
  const activitiesQuery = useActivityList({ status: 'approved' })
  const approved = activitiesQuery.data ?? []
  const recentQuery = useVenueBookings({ page: 1, pageSize: 5 })
  const recent = recentQuery.data?.rows ?? []
  const { createVenueBooking } = useBookingMutations()

  // 場地主檔為非同步載入,query 帶入的場地待資料就緒後再驗證回填
  useEffect(() => {
    if (!Number.isInteger(qVenueId) || qVenueId <= 0) return
    if (form.getFieldValue('venue') != null) return
    if (tempVenues.some((v) => v.id === qVenueId)) form.setFieldValue('venue', qVenueId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venuesQuery.data])

  const submit = (values: { venue: number; activity: number; purpose: string; date: Dayjs }) => {
    if (!periods.length) {
      setPeriodsError(true)
      message.error('請選擇至少一個時段')
      return
    }
    const venueName = tempVenues.find((v) => v.id === values.venue)?.name ?? ''
    createVenueBooking.mutate(
      {
        venueId: values.venue,
        activityId: values.activity,
        date: values.date,
        periods,
        purpose: values.purpose,
      },
      {
        onSuccess: () => {
          message.success(`已送出「${venueName}」借用申請（${periods.join('、')}）`)
          form.resetFields()
          setPeriods([])
        },
        onError: (e) => message.error(e.message),
      },
    )
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
          initialValues={{ date: qDate ? dayjs(qDate, 'YYYY/MM/DD') : undefined }}
        >
          <div className="form-grid-2">
            <Form.Item name="venue" label="場地" rules={[{ required: true, message: '請選擇場地' }]} style={{ marginBottom: 0 }}>
              <Select
                placeholder="請選擇"
                loading={venuesQuery.isPending}
                options={tempVenues.map((v) => ({ value: v.id, label: venueLabel(v) }))}
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
                loading={activitiesQuery.isPending}
                options={approved.map((a) => ({ value: a.id, label: a.name }))}
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
            <Button type="primary" htmlType="submit" loading={createVenueBooking.isPending}>送出申請</Button>
          </div>
        </Form>
      </div>

      <Spin spinning={recentQuery.isPending}>
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近申請</div>
          <table className="tb" aria-label="最近申請" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th scope="col">場地</th>
                <th scope="col">日期</th>
                <th scope="col">時段</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((v) => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 500 }}>{v.venueName}</td>
                  <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>第 {v.periods.join('、')} 節</td>
                  <td style={{ width: 110 }}><StatusPill status={v.status} /></td>
                </tr>
              ))}
              {recentQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={4}>
                    <QueryError compact title="申請紀錄載入失敗" error={recentQuery.error} onRetry={() => recentQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!recentQuery.isError && !recentQuery.isPending && recent.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>尚無申請紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>
    </div>
  )
}

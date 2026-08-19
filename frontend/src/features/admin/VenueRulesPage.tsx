import { App, Button, DatePicker, Form, Input, Select } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { useState } from 'react'
import type { Dayjs } from 'dayjs'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols } from '../../components/ui/tableControls'
import { confirmDialog } from '../../lib/confirm'
import { notFoundText } from '../../lib/selectOptions'
import PeriodPicker from '../bookings/PeriodPicker'
import { useAdminVenues } from '../../api/adminBookings'
import { useVenueRuleMutations, useVenueRules, type VenueRule } from '../../api/adminVenueRules'

const { RangePicker } = DatePicker

const WEEKDAY_OPTIONS = ['一', '二', '三', '四', '五', '六', '日'].map((label, i) => ({
  value: i + 1,
  label: `週${label}`,
}))

const weekdaysText = (r: VenueRule): string =>
  r.weekdays?.length ? r.weekdays.map((d) => WEEKDAY_OPTIONS[d - 1].label).join('、') : '每天'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : '操作失敗')

// 場地不開放規則(Rule Page,權限鍵 arule):
// 場況圖顯示「不開放」並蓋過其他狀態;社團申請與行政核准命中規則即擋
export default function VenueRulesPage() {
  const { message, modal } = App.useApp()
  const venuesQuery = useAdminVenues()
  const rulesQuery = useVenueRules()
  const { create, remove } = useVenueRuleMutations()
  const [form] = Form.useForm()
  const [periods, setPeriods] = useState<string[]>([])

  const venues = venuesQuery.data ?? []
  const rules = rulesQuery.data ?? []

  const submit = (v: {
    venue: number
    range: [Dayjs, Dayjs]
    weekdays?: number[]
    reason: string
  }) => {
    if (!periods.length) {
      message.error('請選擇至少一個不開放時段')
      return
    }
    create.mutate(
      { venueId: v.venue, range: v.range, weekdays: v.weekdays, periods, reason: v.reason },
      {
        onSuccess: () => {
          message.success('已新增不開放規則')
          form.resetFields()
          setPeriods([])
        },
        onError: (e) => message.error(errMsg(e)),
      },
    )
  }

  const doDelete = (rule: VenueRule) =>
    confirmDialog(modal, {
      title: `刪除 ${rule.venueName} 的不開放規則`,
      content: `${rule.startDate} – ${rule.endDate}(${weekdaysText(rule)})・${rule.reason}`,
      okText: '刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () =>
        remove.mutate(rule.id, {
          onSuccess: () => message.success('已刪除'),
          onError: (e) => message.error(errMsg(e)),
        }),
    })

  return (
    <div>
      <PageHeader title="場地不開放規則"/>

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>新增規則</div>
        <Form form={form} layout="vertical" onFinish={submit}>
          <div className="form-grid-2">
            <Form.Item name="venue" label="場地" rules={[{ required: true, message: '請選擇場地' }]} style={{ marginBottom: 12 }}>
              <Select
                showSearch
                options={venues.map((v) => ({ value: v.id, label: v.name }))}
                placeholder="請選擇"
                notFoundContent={notFoundText(venuesQuery, '目前沒有場地', '場地清單')}
              />
            </Form.Item>
            <Form.Item name="range" label="期間" rules={[{ required: true, message: '請選擇期間' }]} style={{ marginBottom: 12 }}>
              <RangePicker style={{ width: '100%' }} format="YYYY/MM/DD" />
            </Form.Item>
            <Form.Item name="weekdays" label="特定星期" style={{ marginBottom: 12 }}>
              <Select mode="multiple" allowClear options={WEEKDAY_OPTIONS} placeholder="每日" />
            </Form.Item>
            <Form.Item name="reason" label="原因" rules={[{ required: true, message: '請輸入原因' }]} style={{ marginBottom: 12 }}>
              <Input placeholder="端午連假不開放、行政徵用" maxLength={200} />
            </Form.Item>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, margin: '4px 0 8px' }}>
            不開放時段 <span style={{ color: '#C13B34' }}>*</span>
          </div>
          <div style={{ background: 'var(--paper)', borderRadius: 8, padding: '10px 12px' }}>
            <PeriodPicker value={periods} onChange={setPeriods} size="small" />
          </div>
          <div style={{ textAlign: 'right', marginTop: 14 }}>
            <Button type="primary" htmlType="submit" loading={create.isPending} disabled={create.isPending}>
              新增規則
            </Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <LoadingBlock pending={rulesQuery.isPending}>
          <table className="tb fixed" style={{ minWidth: 720 }}>
            {/* 場地/原因截斷;期間固定 px;星期/節次允許換行 */}
            <Cols widths={['16%', 200, 110, 110, 'auto', 90]} />
            <thead>
              <tr>
                <th scope="col">場地</th>
                <th scope="col">期間</th>
                <th scope="col">星期</th>
                <th scope="col">時段</th>
                <th scope="col">原因</th>
                <th scope="col" className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="cell-clip" title={r.venueName} style={{ fontWeight: 500 }}>{r.venueName}</td>
                  <td className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>
                    {r.startDate === r.endDate ? r.startDate : `${r.startDate} – ${r.endDate}`}
                  </td>
                  <td style={{ fontSize: 13 }}>{weekdaysText(r)}</td>
                  <td className="num" style={{ fontSize: 13 }}>{r.periods.join('、')}</td>
                  <td className="cell-clip" title={r.reason} style={{ fontSize: 13 }}>{r.reason}</td>
                  <td className="r">
                    <Button size="small" danger onClick={() => doDelete(r)}>刪除</Button>
                  </td>
                </tr>
              ))}
              {rulesQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={6}>
                    <QueryError compact title="規則載入失敗" error={rulesQuery.error} onRetry={() => void rulesQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!rulesQuery.isPending && !rulesQuery.isError && rules.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                    尚無不開放規則
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
      </div>
    </div>
  )
}

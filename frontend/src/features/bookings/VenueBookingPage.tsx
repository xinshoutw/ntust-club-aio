import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { App, Button, DatePicker, Form, Input, Select } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { useFormUnsavedGuard } from '../../app/unsaved'
import PageHeader from '../../components/ui/PageHeader'
import { confirmDialog } from '../../lib/confirm'
import { bookingStarted, periodKeys, startedPeriods, usePeriods } from '../../lib/periods'
import { notFoundText } from '../../lib/selectOptions'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols } from '../../components/ui/tableControls'
import SuspensionNote from '../../components/ui/SuspensionNote'
import { useClubSuspension } from '../../api/clubProfile'
import {
  useBookingMutations,
  useActiveVenueBookings,
  useRecentVenueBookings,
  useVenues,
  venueLabel,
} from '../../api/bookings'
import { useApprovedActivities } from '../../api/activities'
import PeriodPicker from './PeriodPicker'

export default function VenueBookingPage() {
  const { message, modal } = App.useApp()
  const periodCatalogue = usePeriods()
  const periodAxis = periodKeys(periodCatalogue)
  const [form] = Form.useForm()
  const { suspended } = useClubSuspension()
  // 借用總覽格子點入時自動帶入場地、日期、時段
  const [params] = useSearchParams()
  const qVenueId = Number(params.get('venue'))
  const rawDate = params.get('date')
  // 嚴格驗證 query 日期(非嚴格 parse 會把 2026/99/99 正規化成別的日期);過去日期不帶入
  const qDate =
    rawDate &&
    dayjs(rawDate, 'YYYY/MM/DD', true).isValid() &&
    !dayjs(rawDate, 'YYYY/MM/DD', true).isBefore(dayjs().startOf('day'))
      ? rawDate
      : undefined
  const qPeriod = params.get('period')
  const [periods, setPeriods] = useState<string[]>(() => (qPeriod && periodAxis.includes(qPeriod) ? [qPeriod] : []))
  // 從場況圖點格進來時 periods 已有初值,與初值相同不算 dirty(否則一進頁就被攔)
  const initialPeriods = useRef(periods.join())
  const guard = useFormUnsavedGuard(periods.join() !== initialPeriods.current)
  const [periodsError, setPeriodsError] = useState(false)

  const venuesQuery = useVenues()
  const venues = venuesQuery.data ?? []
  const tempVenues = venues.filter((v) => v.allowTemp)
  // 借用需綁定審核通過之活動(與器材借用一致;共用活動域查詢);排除已結束活動
  const activitiesQuery = useApprovedActivities()
  const approved = activitiesQuery.data ?? [] // 已結束的由後端篩掉
  // 正在申請=進行中全部(不限長度、可取消);最近申請=已結束/退回/取消 近 5 筆
  const activeQuery = useActiveVenueBookings()
  const activeRows = activeQuery.data ?? []
  const recentQuery = useRecentVenueBookings()
  const recent = recentQuery.data ?? []
  const { createVenueBooking, cancelVenueBooking } = useBookingMutations()
  const todayStart = dayjs().startOf('day')

  // 過去時間全面禁止:過去日期不可選;選「今天」時已開始節次禁選(後端亦擋)
  const dateValue = Form.useWatch('date', form) as Dayjs | undefined
  const disabledPeriods = dateValue?.isSame(todayStart, 'day') ? startedPeriods(periodCatalogue) : []
  const disabledKey = disabledPeriods.join(',')
  useEffect(() => {
    // 日期切到今天、或表單開著跨過節次起點時,已選到的已開始節次自動剔除
    // (disabled 按鈕不可再點,靠這裡收走,避免卡住送不出)
    if (!disabledKey) return
    setPeriods((cur) => cur.filter((p) => !disabledKey.split(',').includes(p)))
  }, [disabledKey])

  const cancelRow = (v: { id: number; venueName: string; date: string }) =>
    confirmDialog(modal, {
      title: `取消臨時借用 ${v.venueName}(${v.date})`,
      content: '取消後不可復原;已核准的借用取消後時段將釋出',
      okText: '取消借用',
      okButtonProps: { danger: true },
      cancelText: '返回',
      onOk: () =>
        cancelVenueBooking.mutate(v.id, {
          onSuccess: () => message.success('已取消'),
          onError: (e) => message.error(e.message),
        }),
    })

  // 場地主檔為非同步載入,query 帶入的場地待資料就緒後再驗證回填
  useEffect(() => {
    if (!Number.isInteger(qVenueId) || qVenueId <= 0) return
    if (form.getFieldValue('venue') != null) return
    if (tempVenues.some((v) => v.id === qVenueId)) form.setFieldValue('venue', qVenueId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venuesQuery.data])

  const submit = (values: { venue: number; activity: number; purpose: string; phone: string; date: Dayjs }) => {
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
        phone: values.phone,
      },
      {
        onSuccess: () => {
          message.success(`已送出「${venueName}」借用申請（${periods.join('、')}）`)
          form.resetFields()
          guard.clear()
          setPeriods([])
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  return (
    <div>
      <PageHeader title="臨時場地借用" sub={<SuspensionNote />} />

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form
          onValuesChange={guard.onValuesChange}
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
                notFoundContent={notFoundText(venuesQuery, '無可借用的場地', '場地清單')}
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
                notFoundContent={notFoundText(activitiesQuery, '無審核通過之活動', '活動清單')}
              />
            </Form.Item>

            <Form.Item
                name="purpose"
                label="用途"
                rules={[{ required: true, message: '請輸入用途' }]}
                style={{ marginBottom: 0 }}
            >
              <Input placeholder="簡述說明" />
            </Form.Item>
            <Form.Item
              name="phone"
              label="聯絡電話"
              rules={[{ required: true, message: '請輸入聯絡電話' }, { pattern: /^[0-9\-()*#]+$/, message: '僅能輸入數字與 - ( ) * #' }]}
              style={{ marginBottom: 0 }}
            >
              <Input className="num" placeholder="申請聯絡人電話" maxLength={30} />
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
              <DatePicker
                format="YYYY/MM/DD"
                placeholder="日期"
                style={{ width: 140 }}
                disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
              />
            </Form.Item>
            <div style={{ flex: 1, minWidth: 280 }}>
              <PeriodPicker
                size="small"
                nowrap
                value={periods}
                disabledPeriods={disabledPeriods}
                onChange={(next) => {
                  setPeriodsError(false)
                  setPeriods(next)
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit" loading={createVenueBooking.isPending} disabled={createVenueBooking.isPending || suspended}>送出申請</Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>正在申請</div>
        <LoadingBlock pending={activeQuery.isPending}>
          <table className="tb fixed" aria-label="正在申請" style={{ minWidth: 560 }}>
            <Cols widths={['auto', 110, 'auto', 110, 80]} />
            <thead>
              <tr>
                <th scope="col">場地</th>
                <th scope="col">日期</th>
                <th scope="col">時段</th>
                <th scope="col">狀態</th>
                <th scope="col" className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.map((v) => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 500 }}>{v.venueName}</td>
                  <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>第 {v.periods.join('、')} 節</td>
                  <td><StatusPill status={v.status} /></td>
                  <td className="r">
                    {/* 申請起始時刻(最早節次起點)前皆可取消,pending 與 approved 一致(與後端同界) */}
                    {(v.status === 'pending' || v.status === 'approved') && !bookingStarted(periodCatalogue, v.date, v.periods) ? (
                      <Button size="small" danger onClick={() => cancelRow(v)}>取消</Button>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
              {activeQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={5}>
                    <QueryError compact title="申請紀錄載入失敗" error={activeQuery.error} onRetry={() => activeQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!activeQuery.isError && !activeQuery.isPending && activeRows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>無進行中的申請</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近申請</div>
        <LoadingBlock pending={recentQuery.isPending}>
          <table className="tb fixed" aria-label="最近申請" style={{ minWidth: 560 }}>
            <Cols widths={['auto', 110, 'auto', 110]} />
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
                  <td><StatusPill status={v.status} /></td>
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
        </LoadingBlock>
      </div>
    </div>
  )
}

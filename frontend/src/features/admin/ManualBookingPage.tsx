import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { App, Button, DatePicker, Form, Input, InputNumber, Select } from 'antd'
import type { FormInstance } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import dayjs, { type Dayjs } from 'dayjs'
import PageHeader from '../../components/ui/PageHeader'
import PeriodPicker from '../bookings/PeriodPicker'
import { periodKeys, usePeriods } from '../../lib/periods'
import { notFoundText } from '../../lib/selectOptions'
import { useAdminEquipment } from '../../api/adminEquipment'
import { useAdminVenues, useManualBookingMutations } from '../../api/adminBookings'

const { RangePicker } = DatePicker

const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, marginBottom: 14 }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : '送出失敗')

// 最高權限手動借用:行政直接借用臨時場地或器材,
// 免審核直接核准、不掛社團(場況圖與列表顯示「學務處」)
export default function ManualBookingPage() {
  const { message } = App.useApp()
  const venuesQuery = useAdminVenues()
  const equipmentQuery = useAdminEquipment()
  const { createVenue, createEquipment } = useManualBookingMutations()
  const [venueForm] = Form.useForm()
  const [equipmentForm] = Form.useForm()

  const venues = venuesQuery.data ?? [] // /admin/venues 已僅回啟用中場地
  const equipment = (equipmentQuery.data ?? []).filter((e) => e.isActive)

  // 借用情形色格圖點格進來時帶入場地/器材、日期與節次。
  // **不濾掉過去日期**:補登紙本舊件正是這一頁的用途,後端也刻意放行。
  // 一次只預填被點的那一張表 —— 手動借用免審直接核准,旁邊那張沒人要求的預填是有代價的
  const [params, setParams] = useSearchParams()
  const raw = params.get('date')
  // 嚴格 parse:非嚴格會把 2026/99/99 正規化成別的日期
  const qDate =
    raw && dayjs(raw, 'YYYY/MM/DD', true).isValid() ? dayjs(raw, 'YYYY/MM/DD', true) : undefined
  // 主檔裡沒有的 id 當沒帶:硬塞給 Select 只會在下拉裡顯示一串裸數字
  const asId = (name: string, exists: (id: number) => boolean) => {
    const id = Number(params.get(name)) || undefined
    return id != null && exists(id) ? id : undefined
  }
  const qVenue = asId('venue', (id) => venues.some((v) => v.id === id))
  const qEquipment = asId('equipment', (id) => equipment.some((e) => e.id === id))
  const qPeriod = params.get('period')
  const periodAxis = periodKeys(usePeriods())
  const [periods, setPeriods] = useState<string[]>(() =>
    qPeriod && periodAxis.includes(qPeriod) ? [qPeriod] : [],
  )
  // 送出成功後回到一張空表。`resetFields` 還原的是**掛載當下**的 initialValues
  // (AntD 不吃事後變更的 initialValues),所以預填的欄位要自己再清一次;
  // query 一併清掉,否則網址還說著已經送出去的那一筆
  const clearPrefill = (form: FormInstance, fields: string[]) => {
    setParams({}, { replace: true })
    form.resetFields()
    form.setFieldsValue(Object.fromEntries(fields.map((f) => [f, undefined])))
  }

  const submitVenue = (v: { venue: number; date: Dayjs; purpose: string; phone?: string }) => {
    if (!periods.length) {
      message.error('請選擇至少一個時段')
      return
    }
    createVenue.mutate(
      { venueId: v.venue, date: v.date, periods, purpose: v.purpose, phone: v.phone },
      {
        onSuccess: () => {
          message.success('已建立場地借用(學務處)')
          clearPrefill(venueForm, ['venue', 'date'])
          setPeriods([])
        },
        onError: (e) => message.error(errMsg(e)),
      },
    )
  }

  const submitEquipment = (v: {
    equipment: number
    qty: number
    range: [Dayjs, Dayjs]
    purpose: string
    phone?: string
  }) => {
    createEquipment.mutate(
      { equipmentId: v.equipment, qty: v.qty, range: v.range, purpose: v.purpose, phone: v.phone },
      {
        onSuccess: () => {
          message.success('已建立器材借用(學務處)')
          clearPrefill(equipmentForm, ['equipment', 'range'])
        },
        onError: (e) => message.error(errMsg(e)),
      },
    )
  }

  return (
    <div>
      <PageHeader title="手動借用"/>
      <div className="form-grid-2" style={{ marginTop: 20, alignItems: 'start' }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={sectionTitle}>臨時場地</div>
            <LoadingBlock pending={venuesQuery.isPending} rows={5}>
            <Form
              form={venueForm}
              layout="vertical"
              onFinish={submitVenue}
              initialValues={{ venue: qVenue, date: qVenue && qDate }}
            >
              <Form.Item name="venue" label="場地" rules={[{ required: true, message: '請選擇場地' }]}>
                <Select
                  showSearch
                  options={venues.map((v) => ({ value: v.id, label: v.name }))}
                  placeholder="請選擇"
                  notFoundContent={notFoundText(venuesQuery, '無啟用中的場地', '場地清單')}
                />
              </Form.Item>
              {/* 不擋過去日期:手動借用的用途就是補登歷史資料,後端亦刻意放行 */}
              <Form.Item name="date" label="日期" rules={[{ required: true, message: '請選擇日期' }]}>
                <DatePicker style={{ width: '100%' }} format="YYYY/MM/DD" />
              </Form.Item>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                時段 <span style={{ color: '#C13B34' }}>*</span>
              </div>
              <div style={{ background: 'var(--paper)', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                <PeriodPicker value={periods} onChange={setPeriods} size="small" />
              </div>
              <Form.Item name="purpose" label="用途" rules={[{ required: true, message: '請輸入用途' }]}>
                <Input placeholder="行政人員活動" />
              </Form.Item>
              <Form.Item name="phone" label="聯絡電話" rules={[{ pattern: /^[0-9\-()*#]+$/, message: '僅能輸入數字與 - ( ) * #' }]}>
                <Input className="num" placeholder="選填" maxLength={30} />
              </Form.Item>
              <div style={{ textAlign: 'right' }}>
                <Button type="primary" htmlType="submit" loading={createVenue.isPending} disabled={createVenue.isPending}>
                  建立借用
                </Button>
              </div>
            </Form>
            </LoadingBlock>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div style={sectionTitle}>器材</div>
            <LoadingBlock pending={equipmentQuery.isPending} rows={5}>
            <Form
              form={equipmentForm}
              layout="vertical"
              onFinish={submitEquipment}
              initialValues={{ equipment: qEquipment, range: qEquipment && qDate && [qDate, qDate] }}
            >
              <Form.Item name="equipment" label="器材" rules={[{ required: true, message: '請選擇器材' }]}>
                <Select
                  showSearch
                  options={equipment.map((e) => ({ value: e.id, label: `${e.name}(總數 ${e.totalQty})` }))}
                  placeholder="請選擇"
                  notFoundContent={notFoundText(equipmentQuery, '無啟用中的器材', '器材清單')}
                />
              </Form.Item>
              <Form.Item name="qty" label="數量" rules={[{ required: true, message: '請輸入數量' }]}>
                <InputNumber style={{ width: '100%' }} min={1} precision={0} />
              </Form.Item>
              <Form.Item name="range" label="借用區間" rules={[{ required: true, message: '請選擇區間' }]}>
                <RangePicker style={{ width: '100%' }} format="YYYY/MM/DD" />
              </Form.Item>
              <Form.Item name="purpose" label="用途" rules={[{ required: true, message: '請輸入用途' }]}>
                <Input placeholder="行政人員使用" />
              </Form.Item>
              <Form.Item name="phone" label="聯絡電話" rules={[{ pattern: /^[0-9\-()*#]+$/, message: '僅能輸入數字與 - ( ) * #' }]}>
                <Input className="num" placeholder="選填" maxLength={30} />
              </Form.Item>
              <div style={{ textAlign: 'right' }}>
                <Button type="primary" htmlType="submit" loading={createEquipment.isPending} disabled={createEquipment.isPending}>
                  建立借用
                </Button>
              </div>
            </Form>
            </LoadingBlock>
          </div>
        </div>
    </div>
  )
}

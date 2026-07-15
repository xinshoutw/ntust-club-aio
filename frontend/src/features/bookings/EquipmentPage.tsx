import { App, Button, Form, Input, InputNumber, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { CLUB_ACTIVITIES } from '../activities/mock'
import { dateRangeText } from '../activities/utils'
import type { Activity } from '../activities/types'
import { EQUIPMENT, EQUIPMENT_LOANS } from './mock'

// 借用區間緩衝(工作天;system_settings,後台可調)
const WORKDAY_BUFFER = { before: 2, after: 1 }

// mock 僅排除週末;正式依政府行事曆(後端 holidays 服務)
function addWorkdays(d: Dayjs, n: number): Dayjs {
  let cur = d
  const step = n > 0 ? 1 : -1
  let left = Math.abs(n)
  while (left > 0) {
    cur = cur.add(step, 'day')
    if (cur.day() !== 0 && cur.day() !== 6) left -= 1
  }
  return cur
}

// 借用區間 = 活動開始日 −2 個工作天 ~ 活動結束日 +1 個工作天
function loanWindow(a: Activity): { start: string; end: string } {
  const start = addWorkdays(dayjs(a.date, 'YYYY/MM/DD'), -WORKDAY_BUFFER.before)
  const end = addWorkdays(dayjs(a.endDate ?? a.date, 'YYYY/MM/DD'), WORKDAY_BUFFER.after)
  return { start: start.format('YYYY/MM/DD'), end: end.format('YYYY/MM/DD') }
}

export default function EquipmentPage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const selectedName = Form.useWatch('equipment', form) as string | undefined
  const selected = EQUIPMENT.find((e) => e.name === selectedName)
  const mine = EQUIPMENT_LOANS.filter((l) => l.club === user?.club).slice(0, 5)

  // 器材借用綁定審核通過之活動,不再自選日期區間
  const approved = CLUB_ACTIVITIES.filter((a) => a.club === user?.club && a.status === 'approved')
  const activityId = Form.useWatch('activity', form) as string | undefined
  const activity = approved.find((a) => a.id === activityId)
  const window = activity ? loanWindow(activity) : null

  const submit = (values: { equipment: string; qty: number }) => {
    message.success(`已送出「${values.equipment} ×${values.qty}」借用申請(${activity?.name})`)
    form.resetFields()
  }

  return (
    <div>
      <PageHeader title="器材借用" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        核准後由工讀生點交借出;結束日之隔天上班日 <span className="num">10:30</span> 前歸還。
      </div>

      <div className="overview-grid" style={{ marginTop: 20 }}>
        <div className="card" style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>器材一覽</div>
          <table className="tb" style={{ minWidth: 480 }}>
            <thead>
              <tr>
                <th>品項</th>
                <th>類別</th>
                <th className="r">可借 / 總數</th>
              </tr>
            </thead>
            <tbody>
              {EQUIPMENT.map((e) => (
                <tr
                  key={e.name}
                  onClick={() => {
                    if (e.available === 0) return
                    form.setFieldValue('equipment', e.name)
                    form.resetFields(['qty'])
                  }}
                  style={e.available === 0 ? { background: '#EEF0F3', color: 'var(--muted)', cursor: 'not-allowed' } : { cursor: 'pointer' }}
                >
                  <td style={{ fontWeight: 500 }}>{e.name}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                    {e.category}
                    {e.needsSerial && ' · 序號點交'}
                  </td>
                  <td className="r num">
                    {e.available} / {e.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>借用申請</div>
          <Form
            form={form}
            layout="vertical"
            onFinish={submit}
            requiredMark
            onValuesChange={(changed) => {
              if ('equipment' in changed) form.resetFields(['qty'])
            }}
          >
            <Form.Item name="equipment" label="品項" rules={[{ required: true, message: '請選擇品項' }]}>
              <Select
                placeholder="請選擇"
                options={EQUIPMENT.map((e) => ({
                  value: e.name,
                  label: `${e.name}(可借 ${e.available})`,
                  disabled: e.available === 0,
                }))}
              />
            </Form.Item>
            <Form.Item name="qty" label="數量" rules={[{ required: true, message: '請輸入數量' }]}>
              <InputNumber style={{ width: '100%' }} min={1} max={selected?.available ?? 99} precision={0} />
            </Form.Item>
            <Form.Item
              name="activity"
              label="借用活動(限審核通過)"
              rules={[{ required: true, message: '請選擇活動' }]}
              extra={
                window ? (
                  <span className="num">
                    借用區間 {window.start} – {window.end}(活動前 {WORKDAY_BUFFER.before} 個工作天起,至結束後 {WORKDAY_BUFFER.after} 個工作天)
                  </span>
                ) : (
                  '借用區間依活動起訖自動推算'
                )
              }
            >
              <Select
                placeholder="請選擇活動"
                options={approved.map((a) => ({ value: a.id, label: `${a.name}(${dateRangeText(a)})` }))}
                notFoundContent="無審核通過之活動"
              />
            </Form.Item>
            <Form.Item name="purpose" label="用途">
              <Input placeholder="例:迎新擺攤" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>
              送出申請
            </Button>
          </Form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>我的借用與歸還(近 5 筆)</div>
        <table className="tb" style={{ minWidth: 760 }}>
          <tbody>
            {mine.map((l) => (
              <tr key={l.id}>
                <td style={{ fontWeight: 500 }}>
                  {l.equipment} <span className="num">×{l.qty}</span>
                  {l.serials?.length ? (
                    <span className="num" style={{ color: 'var(--steel)', fontSize: 12 }}> ({l.serials.join('、')})</span>
                  ) : null}
                </td>
                <td className="num" style={{ fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                  {l.status === 'checked_out' && l.returnDue ? `歸還期限 ${l.returnDue}` : l.activity ?? l.purpose}
                </td>
                <td style={{ color: 'var(--steel)', fontSize: 13, whiteSpace: 'nowrap' }}>
                  {l.borrower && <>借用 {l.borrower}</>}
                  {l.borrower && l.returnedBy && ' · '}
                  {l.returnedBy && <>歸還 {l.returnedBy}</>}
                  {!l.borrower && !l.returnedBy && '—'}
                </td>
                <td style={{ width: 110 }}><StatusPill status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

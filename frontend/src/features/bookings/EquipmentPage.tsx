import { App, Button, Form, Input, InputNumber, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { CLUB_ACTIVITIES } from '../activities/mock'
import type { Activity } from '../activities/types'
import { EQUIPMENT, EQUIPMENT_LOANS, availableInWindow } from './mock'

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
  const mine = EQUIPMENT_LOANS.filter((l) => l.club === user?.club).slice(0, 5)

  // 器材借用綁定審核通過之活動,不再自選日期區間
  const approved = CLUB_ACTIVITIES.filter((a) => a.club === user?.club && a.status === 'approved')
  const activityId = Form.useWatch('activity', form) as string | undefined
  const activity = approved.find((a) => a.id === activityId)
  const window = activity ? loanWindow(activity) : null

  // 可借數依所選活動的借用區間動態推導;未選活動前無法判斷
  const avail = (name: string): number | null => (window ? availableInWindow(name, window.start, window.end) : null)
  const selectedName = Form.useWatch('equipment', form) as string | undefined
  const selectedAvail = selectedName ? avail(selectedName) : null

  const submit = (values: { equipment: string; qty: number }) => {
    message.success(`已送出「${values.equipment} ×${values.qty}」借用申請(${activity?.name})`)
    form.resetFields()
  }

  return (
    <div>
      <PageHeader title="器材借用" />

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
              {EQUIPMENT.map((e) => {
                const a = avail(e.name)
                const disabled = a === 0
                return (
                  <tr
                    key={e.name}
                    onClick={() => {
                      if (disabled) return
                      form.setFieldValue('equipment', e.name)
                      form.resetFields(['qty'])
                    }}
                    style={disabled ? { background: '#EEF0F3', color: 'var(--muted)', cursor: 'not-allowed' } : { cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 500 }}>{e.name}</td>
                    <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                      {e.category}
                      {e.needsSerial && ' · 序號點交'}
                    </td>
                    <td className="r num">
                      {a ?? '—'} / {e.total}
                    </td>
                  </tr>
                )
              })}
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
              // 換活動=換借用區間,可借數重新推導;原選品項在新區間不可借就清掉
              if ('activity' in changed) {
                const name = form.getFieldValue('equipment') as string | undefined
                const a = approved.find((x) => x.id === changed.activity)
                const w = a ? loanWindow(a) : null
                if (name && (!w || availableInWindow(name, w.start, w.end) === 0)) {
                  form.resetFields(['equipment', 'qty'])
                }
              }
            }}
          >
            <Form.Item
              name="activity"
              label="關聯活動"
              rules={[{ required: true, message: '請選擇活動' }]}
              extra={
                window ? (
                  <span className="num">
                    可借用區間 {window.start} – {window.end}
                  </span>
                ) : (
                  '選擇活動後推算借用區間與可借數量'
                )
              }
            >
              <Select
                placeholder="請選擇活動"
                options={approved.map((a) => ({ value: a.id, label: `${a.name}` }))}
                notFoundContent="無審核通過之活動"
              />
            </Form.Item>
            <Form.Item name="equipment" label="品項" rules={[{ required: true, message: '請選擇品項' }]}>
              <Select
                placeholder={window ? '請選擇' : '請先選擇關聯活動'}
                disabled={!window}
                options={EQUIPMENT.map((e) => {
                  const a = avail(e.name)
                  return {
                    value: e.name,
                    label: `${e.name}(可借 ${a ?? '—'})`,
                    disabled: a === 0,
                  }
                })}
              />
            </Form.Item>
            <Form.Item name="qty" label="數量" rules={[{ required: true, message: '請輸入數量' }]}>
              <InputNumber style={{ width: '100%' }} min={1} max={selectedAvail ?? 99} precision={0} disabled={!window} />
            </Form.Item>

            <Form.Item
                name="purpose"
                label="用途"
                rules={[{ required: true, message: '請輸入用途' }]}
            >
              <Input placeholder="簡述說明" />
            </Form.Item>

            <Button type="primary" htmlType="submit" block>
              送出申請
            </Button>
          </Form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近借用</div>
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

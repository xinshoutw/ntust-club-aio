import { App, Button, DatePicker, Form, Input, InputNumber, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { EQUIPMENT, EQUIPMENT_LOANS } from './mock'

export default function EquipmentPage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const selectedName = Form.useWatch('equipment', form) as string | undefined
  const selected = EQUIPMENT.find((e) => e.name === selectedName)
  const mine = EQUIPMENT_LOANS.filter((l) => l.club === user?.club)

  const submit = (values: { equipment: string; qty: number }) => {
    message.success(`已送出「${values.equipment} ×${values.qty}」借用申請`)
    form.resetFields()
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
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
                <tr key={e.name}>
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
            <Form.Item name="range" label="借用區間" rules={[{ required: true, message: '請選擇借用區間' }]}>
              <DatePicker.RangePicker style={{ width: '100%' }} format="YYYY/MM/DD" />
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
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>我的借用與歸還</div>
        <table className="tb" style={{ minWidth: 720 }}>
          <tbody>
            {mine.map((l) => (
              <tr key={l.id}>
                <td className="num" style={{ color: 'var(--steel)', width: 150 }}>{l.id}</td>
                <td style={{ fontWeight: 500 }}>
                  {l.equipment} <span className="num">×{l.qty}</span>
                  {l.serials?.length ? (
                    <span className="num" style={{ color: 'var(--steel)', fontSize: 12 }}> ({l.serials.join('、')})</span>
                  ) : null}
                </td>
                <td className="num" style={{ fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                  {l.status === 'checked_out' && l.returnDue ? `歸還期限 ${l.returnDue}` : l.purpose}
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

import { useRef, useState } from 'react'
import { App, Button, DatePicker, Form, Input, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { ROOM_REQUESTS, VENUES } from './mock'
import PeriodPicker from './PeriodPicker'

interface Entry {
  key: number
  date?: string
  periods: string[]
}

const isEntryEmpty = (e: Entry) => !e.date && e.periods.length === 0

export default function FixedRoomPage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [entries, setEntries] = useState<Entry[]>([{ key: 1, periods: [] }])
  const keyRef = useRef(2)
  const mine = ROOM_REQUESTS.filter((r) => r.club === user?.club).slice(0, 5)

  // 填寫後自動補一列空白;整列清空自動移除
  const updateEntry = (key: number, patch: Partial<Entry>) => {
    setEntries((es) => {
      const next = es.map((x) => (x.key === key ? { ...x, ...patch } : x))
      const filled = next.filter((x) => !isEntryEmpty(x))
      keyRef.current += 1
      return [...filled, { key: keyRef.current, periods: [] }]
    })
  }

  const submit = (values: { room: string; note?: string }) => {
    const filled = entries.filter((e) => !isEntryEmpty(e))
    if (filled.some((e) => !e.date || e.periods.length === 0)) {
      message.error('請補齊每列的日期與節次。')
      return
    }
    if (!filled.length) {
      message.error('請至少新增一筆借用時段。')
      return
    }
    message.success(`已送出「${values.room}」固定借用申請(${filled.length} 筆)`)
    form.resetFields()
    setEntries([{ key: 1, periods: [] }])
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <PageHeader title="固定場地借用" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        整學期固定時段之教室借用;送學務處審核,時段衝突者依送件順序協調。
      </div>

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form form={form} layout="vertical" onFinish={submit} requiredMark>
          <div className="form-grid-2">
            <Form.Item name="room" label="教室" rules={[{ required: true, message: '請選擇教室' }]} style={{ marginBottom: 0 }}>
              <Select
                placeholder="請選擇"
                options={VENUES.filter((v) => v.allowFixed).map((v) => ({
                  value: v.name,
                  label: `${v.name}(${v.capacity} 人)`,
                }))}
              />
            </Form.Item>
            <Form.Item name="note" label="用途" style={{ marginBottom: 0 }}>
              <Input placeholder="例:社課練習" />
            </Form.Item>
          </div>

          <div style={{ fontSize: 13, fontWeight: 500, margin: '18px 0 8px' }}>
            借用時段 <span style={{ color: '#C13B34' }}>*</span>
            <span style={{ fontWeight: 400, color: 'var(--steel)', marginLeft: 8, fontSize: 12 }}>
              填寫後自動增列;節次可按住拖曳批量選取
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.map((e) => (
              <div key={e.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 6, padding: '10px 12px' }}>
                <DatePicker
                  format="YYYY/MM/DD"
                  placeholder="日期"
                  onChange={(_, ds) => updateEntry(e.key, { date: (ds as string) || undefined })}
                />
                <div style={{ flex: 1, minWidth: 260 }}>
                  <PeriodPicker size="small" value={e.periods} onChange={(ps) => updateEntry(e.key, { periods: ps })} />
                </div>
              </div>
            ))}
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
            {mine.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>{r.room}</td>
                <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                  {r.entries.map((x) => `${x.date} 第${x.period}節`).join('、')}
                </td>
                <td style={{ width: 110 }}><StatusPill status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

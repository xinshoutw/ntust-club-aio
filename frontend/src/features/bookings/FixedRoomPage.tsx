import { useState } from 'react'
import { App, Button, DatePicker, Form, Input, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { PERIODS, ROOM_REQUESTS, VENUES } from './mock'

interface Entry {
  key: number
  date?: string
  period?: string
}

export default function FixedRoomPage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [entries, setEntries] = useState<Entry[]>([{ key: 1 }])
  const [nextKey, setNextKey] = useState(2)
  const mine = ROOM_REQUESTS.filter((r) => r.club === user?.club)

  const submit = (values: { room: string; note?: string }) => {
    if (entries.some((e) => !e.date !== !e.period)) {
      message.error('請補齊或刪除未完成的時段列。')
      return
    }
    const filled = entries.filter((e) => e.date && e.period)
    if (!filled.length) {
      message.error('請至少新增一筆借用時段。')
      return
    }
    const keys = filled.map((e) => `${e.date}|${e.period}`)
    if (new Set(keys).size !== keys.length) {
      message.error('借用時段重複,請調整。')
      return
    }
    message.success(`已送出「${values.room}」固定借用申請(${filled.length} 個時段)`)
    form.resetFields()
    setEntries([{ key: 1 }])
  }

  return (
    <div style={{ maxWidth: 720 }}>
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
            <span style={{ fontWeight: 400, color: 'var(--steel)', marginLeft: 8, fontSize: 12 }}>可新增多筆</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.map((e) => (
              <div key={e.key} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <DatePicker
                  format="YYYY/MM/DD"
                  placeholder="日期"
                  onChange={(_, ds) =>
                    setEntries((es) => es.map((x) => (x.key === e.key ? { ...x, date: ds as string } : x)))
                  }
                />
                <Select
                  placeholder="節次"
                  style={{ width: 120 }}
                  options={PERIODS.map((p) => ({ value: p, label: `第 ${p} 節` }))}
                  onChange={(v) => setEntries((es) => es.map((x) => (x.key === e.key ? { ...x, period: v } : x)))}
                />
                {entries.length > 1 && (
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() => setEntries((es) => es.filter((x) => x.key !== e.key))}
                  >
                    刪除
                  </button>
                )}
              </div>
            ))}
          </div>
          <Button
            style={{ marginTop: 10, height: 34 }}
            onClick={() => {
              setEntries((es) => [...es, { key: nextKey }])
              setNextKey((k) => k + 1)
            }}
          >
            + 新增時段
          </Button>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit">送出申請</Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>我的申請</div>
        <table className="tb" style={{ minWidth: 560 }}>
          <tbody>
            {mine.map((r) => (
              <tr key={r.id}>
                <td className="num" style={{ color: 'var(--steel)', width: 150 }}>{r.id}</td>
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

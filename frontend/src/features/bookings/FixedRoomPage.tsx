import { useEffect, useRef, useState } from 'react'
import { App, Button, Form, Input, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import {
  DOW_TEXT,
  PERIODS,
  ROOM_REQUESTS,
  VENUES,
  isFixedBookingOpen,
  isFixedBookingOpenByMonth,
  roomEntryText,
} from './mock'

const MAX_PERIODS = 10 // 每社團至多 10 節(1 節 = 1 小時)
const LATE = new Set(['10', 'A', 'B', 'C', 'D']) // 晚間時段:需至少連續 3 節起借

// 依 PERIODS 順序把已選節次切成連續區段
function runsOf(periods: string[]): string[][] {
  const idx = periods.map((p) => PERIODS.indexOf(p)).sort((a, b) => a - b)
  const runs: string[][] = []
  let cur: number[] = []
  for (const i of idx) {
    if (cur.length && i === cur[cur.length - 1] + 1) {
      cur.push(i)
    } else {
      if (cur.length) runs.push(cur.map((x) => PERIODS[x]))
      cur = [i]
    }
  }
  if (cur.length) runs.push(cur.map((x) => PERIODS[x]))
  return runs
}

// 晚間時段規則:含第 10 節或 A–D 節的連續區段需 ≥3 節(合法如 9–A、8–10、A–C、B–D)
function lateRuleError(dow: number, periods: string[]): string | null {
  for (const run of runsOf(periods)) {
    if (run.some((p) => LATE.has(p)) && run.length < 3) {
      return `週${DOW_TEXT[dow]}的第 10 節及 A–D 節至少需連續 3 節(例如 9–A、A–C),目前為「${run.join('–')}」。`
    }
  }
  return null
}

export default function FixedRoomPage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  // 已選時段:'dow|period'(dow 1=週一 … 7=週日)
  const [slots, setSlots] = useState<ReadonlySet<string>>(new Set())
  // 拖曳批量選取(與 PeriodPicker 同手感):按下起點決定「選取/取消」,掃過即套用
  const [dragTo, setDragTo] = useState<boolean | null>(null)
  const slotsRef = useRef(slots)
  slotsRef.current = slots
  const mine = ROOM_REQUESTS.filter((r) => r.club === user?.club).slice(0, 5)

  useEffect(() => {
    const up = () => setDragTo(null)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // 僅於管理員開放期間可用;未開放時側欄反灰,直接輸入網址也只顯示說明
  if (!isFixedBookingOpen()) {
    return (
      <div>
        <PageHeader title="固定場地借用" />
        <div className="card" style={{ marginTop: 20, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>目前未開放申請</div>
          <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 8 }}>
            固定場地借用僅於開放期間受理(預設每年 <span className="num">6</span> 月、<span className="num">1</span> 月,依學務處公告為準)。
          </div>
        </div>
      </div>
    )
  }

  const apply = (key: string, to: boolean) => {
    const has = slotsRef.current.has(key)
    if (to === has) return
    setSlots((s) => {
      const next = new Set(s)
      if (to) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }

  const submit = (values: { room: string; note: string }) => {
    if (slots.size === 0) {
      message.error('請至少選擇一個時段。')
      return
    }
    if (slots.size > MAX_PERIODS) {
      message.error(`每社團固定借用至多 ${MAX_PERIODS} 節,目前已選 ${slots.size} 節。`)
      return
    }
    for (let dow = 1; dow <= 7; dow++) {
      const err = lateRuleError(dow, PERIODS.filter((p) => slots.has(`${dow}|${p}`)))
      if (err) {
        message.error(err)
        return
      }
    }
    message.success(`已送出「${values.room}」固定借用申請(每週 ${slots.size} 節)`)
    form.resetFields()
    setSlots(new Set())
  }

  return (
    <div>
      <PageHeader title="固定場地借用" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        整學期每週固定使用所選時段;衝突由學務處擇一社團核准。
      </div>
      {!isFixedBookingOpenByMonth() && (
        <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>
          本期間由管理員加開;固定借用預設開放月份為 <span className="num">6</span> 月、<span className="num">1</span> 月。
        </div>
      )}

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form form={form} layout="vertical" onFinish={submit} requiredMark>
          <div className="form-grid-2">
            <Form.Item name="room" label="場地" rules={[{ required: true, message: '請選擇場地' }]} style={{ marginBottom: 0 }}>
              <Select
                placeholder="請選擇"
                options={VENUES.filter((v) => v.allowFixed).map((v) => ({
                  value: v.name,
                  label: `${v.name}(${v.capacity} 人)`,
                }))}
              />
            </Form.Item>
            <Form.Item name="note" label="用途" rules={[{ required: true, message: '請輸入用途' }]} style={{ marginBottom: 0 }}>
              <Input placeholder="例:社課練習" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '18px 0 8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              每週時段 <span style={{ color: '#C13B34' }}>*</span>
            </span>
            <span style={{ fontWeight: 400, color: 'var(--steel)', fontSize: 12 }}>
              點擊或按住拖曳批量選取;至多 {MAX_PERIODS} 節,第 10 節及 A–D 節需至少連續 3 節
            </span>
            <span style={{ flex: 1 }} />
            <span className="num" style={{ fontSize: 12, color: slots.size > MAX_PERIODS ? '#C13B34' : 'var(--steel)' }}>
              已選 {slots.size} / {MAX_PERIODS} 節
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 4, width: '100%', tableLayout: 'fixed', minWidth: 640, userSelect: 'none' }}>
              <thead>
                <tr>
                  <th style={{ width: 52, fontSize: 11, fontWeight: 500, color: 'var(--steel)', textAlign: 'left' }}>星期</th>
                  {PERIODS.map((p) => (
                    <th key={p} className="num" style={{ fontSize: 11, fontWeight: 500, color: 'var(--steel)' }}>{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
                  <tr key={dow}>
                    <td style={{ fontSize: 13, color: 'var(--steel)', whiteSpace: 'nowrap' }}>週{DOW_TEXT[dow]}</td>
                    {PERIODS.map((p) => {
                      const key = `${dow}|${p}`
                      const on = slots.has(key)
                      return (
                        <td key={p}>
                          <button
                            type="button"
                            aria-pressed={on}
                            aria-label={`週${DOW_TEXT[dow]} 第${p}節`}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              const to = !on
                              setDragTo(to)
                              apply(key, to)
                            }}
                            onMouseEnter={(e) => {
                              if (dragTo === null) return
                              // 視窗外放開滑鼠收不到 mouseup;按鍵已放開就結束拖曳
                              if (e.buttons === 0) {
                                setDragTo(null)
                                return
                              }
                              apply(key, dragTo)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                apply(key, !on)
                              }
                            }}
                            className="num"
                            style={{
                              width: '100%',
                              height: 28,
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 12,
                              fontFamily: 'inherit',
                              border: on ? '1px solid var(--seal)' : '1px solid var(--line)',
                              background: on ? 'var(--seal)' : '#fff',
                              color: on ? '#fff' : 'var(--ink)',
                            }}
                          >
                            {p}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
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
                  {r.entries.map(roomEntryText).join('、')}
                </td>
                <td style={{ width: 110 }}><StatusPill status={r.status} /></td>
              </tr>
            ))}
            {mine.length === 0 && (
              <tr className="no-hover">
                <td style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>尚無申請紀錄。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

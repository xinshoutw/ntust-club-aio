import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { App, Button, Form, Input, Select, Spin } from 'antd'
import { useFormUnsavedGuard } from '../../app/unsaved'
import PageHeader from '../../components/ui/PageHeader'
import { confirmDialog } from '../../lib/confirm'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols } from '../../components/ui/tableControls'
import {
  DOW_TEXT,
  PERIODS,
  roomEntryText,
  useBookingMutations,
  useFixedWindow,
  useActiveRoomBookings,
  useRecentRoomBookings,
  useVenues,
  venueLabel,
} from '../../api/bookings'

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
      return `週${DOW_TEXT[dow]}的第 10 節及 A–D 節至少需連續 3 節，目前為 ${run.length} 節`
    }
  }
  return null
}

export default function FixedRoomPage() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm()
  // 已選時段:'dow|period'(dow 1=週一 … 7=週日)
  const [slots, setSlots] = useState<ReadonlySet<string>>(new Set())
  const guard = useFormUnsavedGuard(slots.size > 0)
  // 拖曳批量選取(與 PeriodPicker 同手感):按下起點決定「選取/取消」,掃過即套用
  const [dragTo, setDragTo] = useState<boolean | null>(null)
  const [slotsError, setSlotsError] = useState(false)
  const slotsRef = useRef(slots)
  slotsRef.current = slots

  // 開放窗由後端提供(與側欄共用同一查詢);未開放時直接輸入網址也只顯示說明
  const windowQuery = useFixedWindow()
  const venuesQuery = useVenues()
  // 正在申請=進行中全部(不限長度、可取消);最近申請=已結束/退回/取消 近 5 筆
  const activeQuery = useActiveRoomBookings()
  const activeRows = activeQuery.data ?? []
  const recentQuery = useRecentRoomBookings()
  const recent = recentQuery.data ?? []
  const { createRoomBooking, cancelRoomBooking } = useBookingMutations()
  const todayStart = dayjs().startOf('day')

  const cancelRow = (r: { id: number; venueName: string }) =>
    confirmDialog(modal, {
      title: `取消固定借用 ${r.venueName}`,
      content: '取消後不可復原;已核准的借用取消後時段將釋出',
      okText: '取消借用',
      okButtonProps: { danger: true },
      cancelText: '返回',
      onOk: () =>
        cancelRoomBooking.mutate(r.id, {
          onSuccess: () => message.success('已取消'),
          onError: (e) => message.error(e.message),
        }),
    })

  useEffect(() => {
    const up = () => setDragTo(null)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  if (windowQuery.isPending) {
    return (
      <div>
        <PageHeader title="固定場地借用" />
        <div className="card" style={{ marginTop: 20, padding: '48px 24px', textAlign: 'center' }}>
          <Spin />
        </div>
      </div>
    )
  }

  // 開放窗查詢失敗不可誤判為「未開放申請」,顯示錯誤與重試
  if (windowQuery.isError) {
    return (
      <div>
        <PageHeader title="固定場地借用" />
        <div style={{ marginTop: 20 }}>
          <QueryError title="受理期間載入失敗" error={windowQuery.error} onRetry={() => windowQuery.refetch()} />
        </div>
      </div>
    )
  }

  const window_ = windowQuery.data
  if (!window_?.open) {
    return (
      <div>
        <PageHeader title="固定場地借用" />
        <div className="card" style={{ marginTop: 20, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>目前未開放申請</div>
          {window_?.openFrom && window_.openUntil && (
            <div className="num" style={{ fontSize: 13, color: 'var(--steel)', marginTop: 8 }}>
              受理期間 {window_.openFrom} – {window_.openUntil}
            </div>
          )}
        </div>
      </div>
    )
  }

  const apply = (key: string, to: boolean) => {
    const has = slotsRef.current.has(key)
    if (to === has) return
    setSlotsError(false)
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

  const submit = (values: { room: number; note: string }) => {
    if (slots.size === 0) {
      setSlotsError(true)
      message.error('請至少選擇一個時段')
      return
    }
    if (slots.size > MAX_PERIODS) {
      setSlotsError(true)
      message.error(`每社團固定借用至多 ${MAX_PERIODS} 節，目前已選 ${slots.size} 節`)
      return
    }
    for (let dow = 1; dow <= 7; dow++) {
      const err = lateRuleError(dow, PERIODS.filter((p) => slots.has(`${dow}|${p}`)))
      if (err) {
        setSlotsError(true)
        message.error(err)
        return
      }
    }
    createRoomBooking.mutate(
      {
        venueId: values.room,
        purpose: values.note,
        slots: [...slots].map((key) => {
          const [dow, period] = key.split('|')
          return { weekday: Number(dow), period }
        }),
      },
      {
        onSuccess: () => {
          message.success('已送出固定借用申請')
          form.resetFields()
          guard.clear()
          setSlots(new Set())
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  return (
    <div>
      <PageHeader title="固定場地借用" />

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form onValuesChange={guard.onValuesChange} form={form} layout="vertical" onFinish={submit} requiredMark>
          <div className="form-grid-2">
            <Form.Item name="room" label="場地" rules={[{ required: true, message: '請選擇場地' }]} style={{ marginBottom: 0 }}>
              <Select
                placeholder="請選擇"
                loading={venuesQuery.isPending}
                options={(venuesQuery.data ?? [])
                  .filter((v) => v.allowFixed)
                  .map((v) => ({ value: v.id, label: venueLabel(v) }))}
              />
            </Form.Item>
            <Form.Item name="note" label="用途" rules={[{ required: true, message: '請輸入用途' }]} style={{ marginBottom: 0 }}>
              <Input placeholder="簡述說明" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '18px 0 8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              每週時段 <span style={{ color: '#C13B34' }}>*</span>
            </span>
            <span style={{ flex: 1 }} />
            <span className="num" style={{ fontSize: 12, color: slots.size > MAX_PERIODS ? '#C13B34' : 'var(--steel)' }}>
              已選 {slots.size} / {MAX_PERIODS} 節
            </span>
          </div>
          <div className={slotsError ? 'area-error' : undefined} style={{ overflowX: 'auto', border: '1px solid transparent', borderRadius: 6 }}>
            <table aria-label="每週時段選擇" style={{ borderCollapse: 'separate', borderSpacing: 4, width: '100%', tableLayout: 'fixed', minWidth: 640, userSelect: 'none' }}>
              {/* 不設表頭:每格按鈕本身已標節次,星期由列首標示 */}
              <colgroup>
                <col style={{ width: 52 }} />
              </colgroup>
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
            <Button type="primary" htmlType="submit" loading={createRoomBooking.isPending} disabled={createRoomBooking.isPending}>送出申請</Button>
          </div>
        </Form>
      </div>

      <Spin spinning={activeQuery.isPending}>
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>正在申請</div>
          <table className="tb fixed" aria-label="正在申請" style={{ minWidth: 620 }}>
            <Cols widths={['auto', 110, 'auto', 110, 80]} />
            <thead>
              <tr>
                <th scope="col">場地</th>
                <th scope="col">學期起日</th>
                <th scope="col">時段</th>
                <th scope="col">狀態</th>
                <th scope="col" className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.venueName}</td>
                  <td className="num" style={{ fontSize: 13 }}>{r.startDate}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                    {r.entries.map(roomEntryText).join('、')}
                  </td>
                  <td><StatusPill status={r.status} /></td>
                  <td className="r">
                    {r.status === 'pending' || dayjs(r.startDate, 'YYYY/MM/DD').isAfter(todayStart, 'day') ? (
                      <Button size="small" danger onClick={() => cancelRow(r)}>取消</Button>
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
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>目前沒有進行中的申請</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>

      <Spin spinning={recentQuery.isPending}>
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近申請</div>
          <table className="tb fixed" aria-label="最近申請" style={{ minWidth: 560 }}>
            <Cols widths={['30%', 'auto', 110]} />
            <thead>
              <tr>
                <th scope="col">場地</th>
                <th scope="col">時段</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.venueName}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                    {r.entries.map(roomEntryText).join('、')}
                  </td>
                  <td><StatusPill status={r.status} /></td>
                </tr>
              ))}
              {recentQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={3}>
                    <QueryError compact title="申請紀錄載入失敗" error={recentQuery.error} onRetry={() => recentQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!recentQuery.isError && !recentQuery.isPending && recent.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>尚無申請紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>
    </div>
  )
}

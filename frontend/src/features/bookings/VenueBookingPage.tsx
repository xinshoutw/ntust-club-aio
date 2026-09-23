import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useSearchParams } from 'react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { App, Button, DatePicker, Form, Input, Select } from 'antd'
import { MinusOutlined, PlusOutlined } from '@ant-design/icons'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { useFormUnsavedGuard } from '../../app/unsaved'
import PageHeader from '../../components/ui/PageHeader'
import { PHONE_RULE, normalizePhone } from '../../lib/form'
import { confirmDialog } from '../../lib/confirm'
import { bookingStarted, periodKeys, startedPeriods, usePeriods } from '../../lib/periods'
import { notFoundText } from '../../lib/selectOptions'
import { useNoActivityAccount } from '../../lib/noActivityAccount'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols, Pager } from '../../components/ui/tableControls'
import SuspensionNote from '../../components/ui/SuspensionNote'
import { useClubSuspension } from '../../api/clubProfile'
import { ApiError } from '../../api/client'
import {
  useBookingMutations,
  useActiveVenueBookings,
  RECENT_PAGE,
  useRecentVenueBookings,
  useVenues,
  venueLabel,
} from '../../api/bookings'
import { useApprovedActivities } from '../../api/activities'
import PeriodPicker from './PeriodPicker'
import { useDecisionReason } from './DecisionReasonModal'
import { taipeiToday } from '../../lib/today'
import './venueSlots.css'

// 一次送出的時段筆數上限(後端同值:schemas/bookings.MAX_VENUE_SLOTS)
const MAX_SLOTS = 10

/** 一筆時段 = 一天的節次,送出後各成一張單(D-43)。`key` 只給 React 認列,不上後端 */
interface SlotDraft {
  key: number
  date: Dayjs | null
  periods: string[]
}

/** 未存檔守衛的比對值:只看填了東西的列的日期與節次 —— 按「+」多一列空白不算修改,
 *  `key` 隨增刪變也不算 */
const slotsKey = (slots: SlotDraft[]) =>
  slots
    .filter((s) => s.date || s.periods.length)
    .map((s) => `${s.date?.format('YYYY-MM-DD') ?? ''}:${s.periods.join(',')}`)
    .join('|')
const BLANK_KEY = slotsKey([{ key: 0, date: null, periods: [] }])

/** 同一天、節次跟前面某一列重疊的列:送出去就是重複申請(後端 `_no_overlap` 同一條)。
 *  從列的內容當場推,不存成狀態 —— 重疊一解除,紅框就跟著消失。
 *  `first` 是第一個重疊列的「第 N 筆 日期」:同一天可以有好幾列,只給日期分不出是哪一列 */
const overlappingSlots = (slots: SlotDraft[]): { keys: Set<number>; first: string | null } => {
  const keys = new Set<number>()
  let first: string | null = null
  const taken = new Map<string, Set<string>>()
  slots.forEach((s, i) => {
    if (!s.date || !s.periods.length) return
    const day = s.date.format('YYYY/MM/DD')
    const seen = taken.get(day) ?? new Set<string>()
    if (s.periods.some((p) => seen.has(p))) {
      keys.add(s.key)
      first ??= `第 ${i + 1} 筆 ${day}`
    }
    s.periods.forEach((p) => seen.add(p))
    taken.set(day, seen)
  })
  return { keys, first }
}

export default function VenueBookingPage() {
  const { message, modal } = App.useApp()
  const periodCatalogue = usePeriods()
  const periodAxis = periodKeys(periodCatalogue)
  const [form] = Form.useForm()
  const { suspended } = useClubSuspension()
  const noActivity = useNoActivityAccount()  // 802 國際事務處免綁活動(D-36)
  // 借用總覽格子點入時自動帶入場地、日期、時段
  const [params] = useSearchParams()
  const qVenueId = Number(params.get('venue'))
  const rawDate = params.get('date')
  // 嚴格驗證 query 日期(非嚴格 parse 會把 2026/99/99 正規化成別的日期);過去日期不帶入
  const qDate =
    rawDate &&
    dayjs(rawDate, 'YYYY/MM/DD', true).isValid() &&
    !dayjs(rawDate, 'YYYY/MM/DD', true).isBefore(taipeiToday())
      ? rawDate
      : undefined
  const qPeriod = params.get('period')
  const todayStart = taipeiToday()
  // 過去時間全面禁止:過去日期不可選;選「今天」時已開始節次禁選(後端亦擋)
  const started = startedPeriods(periodCatalogue)
  const isToday = (d: Dayjs | null) => !!d?.isSame(todayStart, 'day')
  // 從場況圖點格進來時第一筆已帶好日期與節次。今天已開始的那一節本來就選不到:不帶入 ——
  // 帶了也會被下面的剔除收走,頁面一進來就算已修改,什麼都沒動也被未存檔守衛攔下
  const [slots, setSlots] = useState<SlotDraft[]>(() => {
    const date = qDate ? dayjs(qDate, 'YYYY/MM/DD') : null
    const usable =
      qPeriod && periodAxis.includes(qPeriod) && !(isToday(date) && started.includes(qPeriod))
    return [{ key: 0, date, periods: usable ? [qPeriod] : [] }]
  })
  const nextKey = useRef(1)
  const slotsRef = useRef<HTMLDivElement>(null)
  // 與初值相同不算 dirty(否則從場況圖點進來,一進頁就被攔)
  const [cleanSlots, setCleanSlots] = useState(slots)
  // 比對前先拿掉「今天已開始」的節次:那是時間走過節次起點、由系統剔除的,不是使用者改的。
  // 全部清成空白也不算修改 —— 沒有東西會遺失
  const comparable = (list: SlotDraft[]) =>
    slotsKey(
      list.map((s) =>
        isToday(s.date) ? { ...s, periods: s.periods.filter((p) => !started.includes(p)) } : s,
      ),
    )
  const current = comparable(slots)
  const guard = useFormUnsavedGuard(current !== BLANK_KEY && current !== comparable(cleanSlots))
  // 送出驗證的錯誤集合(design-guide §6):`date:<key>` / `periods:<key>`,改到哪一格就解除哪一格;
  // `row:<key>` 是後端指出的整列(已開始、不開放、與既有申請重複),那一列動了哪一格都解除
  const [slotErrors, setSlotErrors] = useState<ReadonlySet<string>>(new Set())
  // 重疊不進錯誤集合:送出過一次之後照目前的列當場標
  const [checked, setChecked] = useState(false)
  const overlap = overlappingSlots(slots)

  const venuesQuery = useVenues()
  const venues = venuesQuery.data ?? []
  const tempVenues = venues.filter((v) => v.allowTemp)
  // 借用需綁定審核通過之活動(與器材借用一致;共用活動域查詢);排除已結束活動
  const activitiesQuery = useApprovedActivities()
  const approved = activitiesQuery.data ?? [] // 已結束的由後端篩掉
  // 正在申請=進行中全部(不限長度、可取消);最近申請=已結束/退回/取消 近 5 筆
  const activeQuery = useActiveVenueBookings()
  const activeRows = activeQuery.data ?? []
  const [recentPage, setRecentPage] = useState(1)
  const recentQuery = useRecentVenueBookings({ page: recentPage, pageSize: RECENT_PAGE })
  const recent = recentQuery.data?.rows ?? []
  const recentTotal = recentQuery.data?.total ?? 0
  const decision = useDecisionReason()
  const { createVenueBooking, cancelVenueBooking } = useBookingMutations()

  const startedKey = started.join(',')
  const todayRows = slots.filter((s) => isToday(s.date)).map((s) => s.key).join(',')
  useEffect(() => {
    // 某一筆的日期切到今天、或表單開著跨過節次起點時,那幾筆已選到的已開始節次自動剔除
    // (disabled 按鈕不可再點,靠這裡收走,避免卡住送不出)
    if (!startedKey || !todayRows) return
    const off = startedKey.split(',')
    const rows = todayRows.split(',').map(Number)
    setSlots((cur) =>
      cur.map((s) =>
        rows.includes(s.key) && s.periods.some((p) => off.includes(p))
          ? { ...s, periods: s.periods.filter((p) => !off.includes(p)) }
          : s,
      ),
    )
  }, [startedKey, todayRows])

  const patchSlot = (key: number, patch: Partial<Omit<SlotDraft, 'key'>>) => {
    setSlots((cur) => cur.map((s) => (s.key === key ? { ...s, ...patch } : s)))
    const field = 'date' in patch ? 'date' : 'periods'
    setSlotErrors((cur) => {
      const cleared = [`${field}:${key}`, `row:${key}`].filter((k) => cur.has(k))
      if (!cleared.length) return cur
      const next = new Set(cur)
      cleared.forEach((k) => next.delete(k))
      return next
    })
  }
  // 焦點不能跟著被移除或停用的按鈕一起掉到 body(WCAG 2.4.3):移除後落在補位那一列的「+」,
  // 「+」補滿上限(這顆跟著停用)就落在新那一列的「−」。flushSync 讓新的列先畫出來才找得到
  const focusSlotButton = (key: number, action: 'add' | 'remove') =>
    slotsRef.current
      ?.querySelector<HTMLButtonElement>(`[data-slot="${key}"] [data-action="${action}"]`)
      ?.focus()
  // 「+」在這一筆的正下方插一筆空白的;「−」移除這一筆(至少留一筆)
  const addSlotAfter = (key: number) => {
    // key 在 updater 外取號:StrictMode 會把 updater 跑兩次
    const blank: SlotDraft = { key: nextKey.current++, date: null, periods: [] }
    const full = slots.length + 1 >= MAX_SLOTS
    flushSync(() =>
      setSlots((cur) => {
        const at = cur.findIndex((s) => s.key === key) + 1
        return [...cur.slice(0, at), blank, ...cur.slice(at)]
      }),
    )
    if (full) focusSlotButton(blank.key, 'remove')
  }
  const removeSlot = (key: number) => {
    const at = slots.findIndex((s) => s.key === key)
    const neighbor = slots[at + 1] ?? slots[at - 1]
    flushSync(() => setSlots((cur) => cur.filter((s) => s.key !== key)))
    if (neighbor) focusSlotButton(neighbor.key, 'add')
  }

  /** 每一筆都要有日期與節次,同一天的節次不能重疊。回傳要提示的訊息,沒問題回 null */
  const validateSlots = (): string | null => {
    const errors = new Set<string>()
    for (const s of slots) {
      if (!s.date) errors.add(`date:${s.key}`)
      if (!s.periods.length) errors.add(`periods:${s.key}`)
    }
    setSlotErrors(errors)
    setChecked(true)
    // 缺欄位與重疊可能同時存在:兩件都說,不要只說一半
    const problems = [
      ...(errors.size ? ['請為每一筆選擇日期與時段'] : []),
      ...(overlap.first ? [`${overlap.first} 的時段重複`] : []),
    ]
    return problems.length ? problems.join('；') : null
  }
  // 捲到第一個出問題的列(design-guide §6):列一多,紅框可能在畫面外,而提示幾秒就消失。
  // 等這一輪的紅框畫出來再找
  const scrollToFirstSlotError = () =>
    setTimeout(() =>
      slotsRef.current
        ?.querySelector('.slot-row.area-error, .ant-picker-status-error')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )

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

  const submit = (values: { venue: number; activity?: number; purpose: string; phone: string }) => {
    const problem = validateSlots()
    if (problem) {
      message.error(problem)
      scrollToFirstSlotError()
      return
    }
    const venueName = tempVenues.find((v) => v.id === values.venue)?.name ?? ''
    createVenueBooking.mutate(
      {
        venueId: values.venue,
        activityId: noActivity ? null : (values.activity ?? null),
        // validateSlots 已確認每一筆都有日期
        slots: slots.map((s) => ({ date: s.date as Dayjs, periods: s.periods })),
        purpose: values.purpose,
        phone: values.phone,
      },
      {
        onSuccess: (rows) => {
          message.success(
            rows.length === 1
              ? `已送出「${venueName}」借用申請（${rows[0].periods.join('、')}）`
              : `已送出「${venueName}」${rows.length} 筆借用申請`,
          )
          form.resetFields()
          guard.clear()
          setSlots([{ key: nextKey.current++, date: null, periods: [] }])
          setCleanSlots([])
          setChecked(false)
        },
        onError: (e) => {
          message.error(e.message)
          // 後端逐筆才驗得出的錯誤帶著是第幾筆(meta.slot,與訊息的「第 N 筆」同一個 N):
          // 列上沒有看得到的編號,標紅那一列、捲過去,不讓人照著幾秒就消失的提示自己數
          const hit = e instanceof ApiError ? slots[Number(e.meta.slot) - 1] : undefined
          if (!hit) return
          setSlotErrors(new Set([`row:${hit.key}`]))
          // 列本來就在畫面上:當下依 key 捲過去。這裡不在 React 事件裡,紅框要晚一拍才畫 ——
          // 等紅框再找(scrollToFirstSlotError)在 Chromium 與 Firefox 都找不到那一列
          slotsRef.current
            ?.querySelector(`[data-slot="${hit.key}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        },
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
          // 其他欄位沒過時 onFinish 不會跑:時段的問題一起標、一起說,不必送第二次才看到
          // (那些欄位在時段上面,捲動交給 scrollToFirstError)
          onFinishFailed={() => {
            const problem = validateSlots()
            if (problem) message.error(problem)
          }}
          scrollToFirstError
          requiredMark
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
              rules={noActivity ? [] : [{ required: true, message: '請選擇活動' }]}
              style={{ marginBottom: 0 }}
            >
              <Select
                disabled={noActivity}
                placeholder={noActivity ? '無需填寫' : '請選擇活動'}
                loading={!noActivity && activitiesQuery.isPending}
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
              normalize={normalizePhone}
              rules={[{ required: true, message: '請輸入聯絡電話' }, PHONE_RULE]}
              style={{ marginBottom: 0 }}
            >
              {/* 不設 maxLength:DOM 的 maxlength 在 normalize 之前就把貼上的內容截掉 */}
              <Input className="num" placeholder="0912-345-678 或 4 碼分機" />
            </Form.Item>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, margin: '18px 0 8px' }}>
            時段 <span style={{ color: '#C13B34' }}>*</span>
          </div>
          <div
            ref={slotsRef}
            className="slot-rows"
            // 日期欄打完字按 Enter 是在確認那個日期,不是送出:冒泡到這裡時 AntD 已經收下日期,
            // 這裡只擋掉瀏覽器的隱式送出 —— 否則多列還沒填完,整批就先送出去了
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault()
            }}
          >
            {slots.map((s, i) => (
              // 每一列的日期欄與節次群組名字都一樣,沒有外層的名字讀螢幕軟體分不出是哪一筆
              <div
                key={s.key}
                data-slot={s.key}
                role="group"
                aria-label={`第 ${i + 1} 筆時段`}
                className={
                  slotErrors.has(`periods:${s.key}`) ||
                  slotErrors.has(`row:${s.key}`) ||
                  (checked && overlap.keys.has(s.key))
                    ? 'slot-row area-error'
                    : 'slot-row'
                }
              >
                <DatePicker
                  className="slot-row-date"
                  format="YYYY/MM/DD"
                  placeholder="日期"
                  // 一行版面的欄寬就是 140;兩行版面(venueSlots.css)讓它在窄螢幕上縮
                  style={{ width: '100%', maxWidth: 140 }}
                  value={s.date}
                  status={slotErrors.has(`date:${s.key}`) ? 'error' : undefined}
                  disabledDate={(d) => d.isBefore(taipeiToday())}
                  onChange={(d) => patchSlot(s.key, { date: d })}
                />
                <div className="slot-row-periods">
                  <PeriodPicker
                    size="small"
                    nowrap
                    value={s.periods}
                    disabledPeriods={isToday(s.date) ? started : []}
                    onChange={(next) => patchSlot(s.key, { periods: next })}
                  />
                </div>
                <div className="slot-row-actions">
                  <Button
                    data-action="add"
                    icon={<PlusOutlined />}
                    aria-label={`在第 ${i + 1} 筆下方新增時段`}
                    disabled={slots.length >= MAX_SLOTS}
                    onClick={() => addSlotAfter(s.key)}
                  />
                  <Button
                    data-action="remove"
                    icon={<MinusOutlined />}
                    aria-label={`移除第 ${i + 1} 筆時段`}
                    disabled={slots.length === 1}
                    onClick={() => removeSlot(s.key)}
                  />
                </div>
              </div>
            ))}
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
              {recent.map((v) => {
                // 退回件與承辦撤銷的取消件可點開原因(舊資料沒留理由時彈窗會說明)
                const row = decision.rowProps(`${v.venueName}（${v.date}）`, v.status, v.decision)
                return (
                  <tr key={v.id} {...row.tr}>
                    <td style={{ fontWeight: 500 }}>{row.wrap(v.venueName)}</td>
                    <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                    <td style={{ color: 'var(--steel)', fontSize: 13 }}>第 {v.periods.join('、')} 節</td>
                    <td><StatusPill status={v.status} /></td>
                  </tr>
                )
              })}
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
        <Pager page={recentPage} pageSize={RECENT_PAGE} total={recentTotal} onChange={setRecentPage} style={{ padding: '10px 0 14px' }} />
      </div>

      {decision.node}
    </div>
  )
}

import { useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { Button, DatePicker, Segmented, Select, Tooltip } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import {
  ArrowLeftOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons'
import QueryError from '../../components/ui/QueryError'
import { useAuth } from '../../app/auth'
import { periodKeys, usePeriods } from '../../lib/periods'
import {
  useAvailability,
  useAvailabilityDays,
  useEquipmentUsage,
  useVenues,
  venueLabel,
  type AvailabilityCell,
  type AvailabilityGrid,
  type AvailabilityState,
  type Venue,
} from '../../api/bookings'
import { CELL, USAGE_SCALE, emptyCellState, usageStep, type CellState } from './cells'
import { taipeiToday } from '../../lib/today'

const VENUE_DAYS = 15 // 單一場地檢視:選擇日 −7 ~ +7 共 15 天
const EQUIPMENT_DAYS = 15 // 器材檢視:選擇日起 15 天(欄=日期)

const LEGEND: CellState[] = ['free', 'fixedOnly', 'closed', 'reviewing', 'temp', 'fixed', 'mine']
const venueLegend = (isClub: boolean): CellState[] =>
  isClub ? LEGEND : LEGEND.filter((k) => k !== 'mine')
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

// 後端場況狀態 → 色格狀態;未佔用格依場地開放旗標補 可借/不開放
const STATE_OF: Record<AvailabilityState, CellState> = {
  pending: 'reviewing',
  temp: 'temp',
  fixed: 'fixed',
  mine: 'mine',
  blocked: 'closed', // 不開放規則(Rule Page):不畫方框,hover 顯示原因
}

function cellOf(
  venue: Venue,
  grid: AvailabilityGrid | undefined,
  period: string,
): { state: CellState; club?: string } {
  const c: AvailabilityCell | undefined = grid?.[String(venue.id)]?.[period]
  if (c) return { state: STATE_OF[c.status], club: c.club }
  return { state: emptyCellState(venue) }
}

// 單一場地格:可借才可點(呼叫端決定去哪一頁申請);審核中不可點;不開放不畫方框。
// 過去日期只供查閱歷史借用,空格不是可申請的入口(bookable=false)。
// 被佔用格 hover 顯示借用社團名(mine 顯示「我的社團」語意由色塊表達,仍附社名)
function Cell({ state, label, club, bookable, onBook }: { state: CellState; label: string; club?: string; bookable: boolean; onBook: () => void }) {
  const base: React.CSSProperties = { width: '100%', height: 24, borderRadius: 4, background: CELL[state].bg, display: 'block' }
  if (state === 'free' && bookable) {
    return (
      <button
        type="button"
        aria-label={`${label},點擊前往借用`}
        onClick={onBook}
        style={{ ...base, border: 'none', padding: 0, cursor: 'pointer' }}
      />
    )
  }
  const cell = <div role="img" aria-label={club ? `${label}(${club})` : label} style={base} />
  // 被佔用格(有社團名)才掛 tooltip;不開放格無社名不掛
  return club ? <Tooltip title={`${club}・${CELL[state].label}`}>{cell}</Tooltip> : cell
}

function Legend({ items }: { items: readonly { label: string; bg: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--steel)' }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: it.bg, border: '1px solid rgba(31,36,48,.12)' }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

// 器材格:借用程度上色;未借滿且非過去日可點,直接帶品項與日期跳到器材借用
function UsageCell({ label, bg, bookable, onBook }: { label: string; bg: string; bookable: boolean; onBook: () => void }) {
  const base: React.CSSProperties = { width: '100%', height: 24, borderRadius: 4, background: bg, display: 'block' }
  const cell = bookable ? (
    <button
      type="button"
      aria-label={`${label},點擊前往借用`}
      onClick={onBook}
      style={{ ...base, border: 'none', padding: 0, cursor: 'pointer' }}
    />
  ) : (
    <div role="img" aria-label={label} style={base} />
  )
  return <Tooltip title={label}>{cell}</Tooltip>
}

interface BookingGridProps {
  /** 給了才點得動:社團端去臨時場地借用、行政端去手動借用;未給=純預覽(未登入首頁) */
  onBookVenue?: (venueId: number, date: Dayjs, period: string) => void
  onBookEquipment?: (equipmentId: number, date: Dayjs) => void
  /** 過去日期也可點:行政端手動借用刻意放行(補登紙本舊件正是它的用途) */
  allowPast?: boolean
}

/** 借用情形色格圖:場地(單日全場地 / 單一場地 15 天)與器材(15 天借用程度)兩種檢視。
 *  社團端借用總覽、行政端臨時場地器材借用、未登入首頁共用這一份 —— 同一張圖只有一個實作。 */
export default function BookingGrid({ onBookVenue, onBookEquipment, allowPast = false }: BookingGridProps) {
  const periodAxis = periodKeys(usePeriods())
  // 「我的借用」只有社團帳號標得出來(後端以 own_club_id 判定);
  // 行政端與未登入首頁列了也永遠不會出現,圖例就不該有那一格
  const isClub = useAuth().user?.role === 'club'
  // 同一張圖兩種資料:場地看節次佔用、器材看借出比例
  const [view, setView] = useState<'venue' | 'equipment'>('venue')
  const [gridDate, setGridDate] = useState<Dayjs>(() => dayjs())
  // 場地檢視:點場地名稱進入,以當時檢視日為中心 −7~+7 共 15 天。
  // 過去日期可查(查歷史借用紀錄的唯一入口),只是空格不能拿來申請
  const [venueView, setVenueView] = useState<number | null>(null)
  const [venueStart, setVenueStart] = useState<Dayjs>(() => taipeiToday())
  const todayStart = taipeiToday()

  const venuesQuery = useVenues()
  const venues = venuesQuery.data ?? []
  const venueDef = venueView != null ? venues.find((v) => v.id === venueView) : undefined

  // 單日全場地 / 單一場地 15 天(單一批次區間查詢,見 api/bookings.useAvailabilityDays)
  const dayQuery = useAvailability(gridDate)
  const venueDates = useMemo(
    () => Array.from({ length: VENUE_DAYS }, (_, i) => venueStart.add(i, 'day')),
    [venueStart],
  )
  const rangeQuery = useAvailabilityDays(venueDef ? venueDates : [], venueDef?.id)

  // 器材檢視:列=器材、欄=檢視日起 15 天(單一批次區間查詢)
  const equipmentDates = useMemo(
    () => Array.from({ length: EQUIPMENT_DAYS }, (_, i) => gridDate.startOf('day').add(i, 'day')),
    [gridDate],
  )
  const isEquipmentView = view === 'equipment'
  const usageQuery = useEquipmentUsage(
    [equipmentDates[0], equipmentDates[EQUIPMENT_DAYS - 1]],
    isEquipmentView,
  )
  const usage = usageQuery.data
  const equipment = usage?.items ?? []
  // 手上這份資料涵蓋哪一段:翻日期時新露出的欄位還沒載到,不能當成「沒人借」
  const usageKnown = (iso: string) => usage != null && iso >= usage.start && iso <= usage.end

  const openVenue = (id: number) => {
    setVenueView(id)
    setVenueStart(gridDate.startOf('day').subtract(7, 'day'))
  }

  const gridPending = isEquipmentView
    ? usageQuery.isPending
    : venueDef
      ? rangeQuery.isPending
      : venuesQuery.isPending || dayQuery.isPending
  // 場況圖來源查詢失敗時整卡顯示錯誤,不畫預設色格;
  // 15 天檢視為單一批次查詢,重試即重抓整段區間
  // 器材:手上有資料就照常渲染(格值以絕對日期為鍵,對得上的那幾欄還是真的),
  // 只有首載失敗才換錯誤畫面 —— 背景重抓失敗不該把讀得到的資料變成不能用
  const gridError = isEquipmentView
    ? usageQuery.isLoadingError
      ? { error: usageQuery.error, retry: () => void usageQuery.refetch() }
      : null
    : venuesQuery.isError
      ? { error: venuesQuery.error, retry: () => void venuesQuery.refetch() }
      : !venueDef && dayQuery.isError
        ? { error: dayQuery.error, retry: () => void dayQuery.refetch() }
        : venueDef && rangeQuery.isError
          ? { error: rangeQuery.error, retry: rangeQuery.refetchErrored }
          : null

  const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: 'var(--steel)' }

  // 可點=呼叫端給得出入口,且那一天還借得到
  const canBook = (d: Dayjs) => !!onBookVenue && (allowPast || !d.isBefore(todayStart, 'day'))
  const canBorrow = (d: Dayjs) => !!onBookEquipment && (allowPast || !d.isBefore(todayStart, 'day'))

  return (
    <div className="card" style={{ marginTop: 20, padding: '16px 20px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Segmented
          size="small"
          value={view}
          // 切到器材時退出單一場地檢視:那是場地才有的下鑽
          onChange={(v) => {
            setView(v as 'venue' | 'equipment')
            setVenueView(null)
          }}
          options={[
            { label: '場地', value: 'venue' },
            { label: '器材', value: 'equipment' },
          ]}
        />
        {!venueDef ? (
          <>
            <Tooltip title="前一週">
              <Button
                size="small"
                icon={<DoubleLeftOutlined />}
                aria-label="前一週"
                onClick={() => setGridDate((d) => d.subtract(7, 'day'))}
              />
            </Tooltip>
            <Tooltip title="前一天">
              <Button
                size="small"
                icon={<LeftOutlined />}
                aria-label="前一天"
                onClick={() => setGridDate((d) => d.subtract(1, 'day'))}
              />
            </Tooltip>
            <DatePicker
              format={(d) => `${d.format('YYYY/MM/DD')} (${WEEKDAY[d.day()]})`}
              size="small"
              allowClear={false}
              suffixIcon={null}
              style={{ width: 120 }}
              styles={{ input: { textAlign: 'center' } }}
              value={gridDate}
              onChange={(d) => d && setGridDate(d)}
            />
            <Tooltip title="後一天">
              <Button size="small" icon={<RightOutlined />} aria-label="後一天" onClick={() => setGridDate((d) => d.add(1, 'day'))} />
            </Tooltip>
            <Tooltip title="後一週">
              <Button size="small" icon={<DoubleRightOutlined />} aria-label="後一週" onClick={() => setGridDate((d) => d.add(7, 'day'))} />
            </Tooltip>
            <Button size="small" onClick={() => setGridDate(dayjs())}>今天</Button>
          </>
        ) : (
          <>
            <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => setVenueView(null)}>
              總覽
            </Button>
            <Select
              size="small"
              value={venueView}
              onChange={setVenueView}
              options={venues.map((v) => ({ value: v.id, label: venueLabel(v) }))}
              style={{ minWidth: 190 }}
              popupMatchSelectWidth={false}
            />
            <Tooltip title={`前 ${VENUE_DAYS} 天`}>
              <Button
                size="small"
                icon={<LeftOutlined />}
                aria-label={`前 ${VENUE_DAYS} 天`}
                onClick={() => setVenueStart((s) => s.subtract(VENUE_DAYS, 'day'))}
              />
            </Tooltip>
            <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>
              {venueStart.format('MM/DD')} – {venueStart.add(VENUE_DAYS - 1, 'day').format('MM/DD')}
            </span>
            <Tooltip title={`後 ${VENUE_DAYS} 天`}>
              <Button
                size="small"
                icon={<RightOutlined />}
                aria-label={`後 ${VENUE_DAYS} 天`}
                onClick={() => setVenueStart((s) => s.add(VENUE_DAYS, 'day'))}
              />
            </Tooltip>
            {/* 與點場地進來的定位一致:以今天為中心的 −7~+7,不是把今天當起點 */}
            <Button size="small" onClick={() => setVenueStart(todayStart.subtract(7, 'day'))}>今天</Button>
          </>
        )}
        <div style={{ flex: 1 }} />
        <Legend
          items={isEquipmentView ? USAGE_SCALE : venueLegend(isClub).map((k) => CELL[k])}
        />
      </div>

      <LoadingBlock pending={gridPending}>
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          {gridError ? (
            <QueryError
              compact
              title={isEquipmentView ? '器材借用情形載入失敗' : '場地借用情形載入失敗'}
              error={gridError.error}
              onRetry={gridError.retry}
            />
          ) : isEquipmentView ? (
            // 不淡化重抓中的舊資料:格值以絕對日期為鍵,對得上的那幾欄本來就還是真的,
            // 只有新露出的日期是未知(留白),不必整張表閃一下
            <table aria-label="各器材借用情形" style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%', tableLayout: 'fixed', minWidth: 900 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...thStyle, width: 176, textAlign: 'left', paddingRight: 8 }}>器材</th>
                  {equipmentDates.map((d) => {
                    const isToday = d.isSame(todayStart, 'day')
                    return (
                      <th
                        scope="col"
                        key={d.format('YYYY/MM/DD')}
                        className="num"
                        style={{ ...thStyle, color: isToday ? 'var(--seal)' : 'var(--steel)', fontWeight: isToday ? 600 : 500 }}
                      >
                        {d.format('MM/DD')}
                        <div style={{ fontWeight: 400 }}>{WEEKDAY[d.day()]}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {equipment.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap', paddingRight: 8 }}>
                      {e.name}
                      <span className="num" style={{ fontSize: 11, color: 'var(--steel)', marginLeft: 5 }}>{e.totalQty}</span>
                    </td>
                    {equipmentDates.map((d) => {
                      const iso = d.format('YYYY-MM-DD')
                      // 舊資料涵蓋不到的日期是「還沒載到」,不是 0
                      const known = usageKnown(iso)
                      const used = e.used[iso] ?? 0
                      // 借滿、過去日期、還沒載到的格子都不是可申請的入口
                      const bookable = known && used < e.totalQty && canBorrow(d)
                      return (
                        <td key={d.format('YYYY/MM/DD')}>
                          <UsageCell
                            label={known ? `${used} / ${e.totalQty}` : '載入中'}
                            bg={known ? usageStep(used, e.totalQty).bg : 'transparent'}
                            bookable={bookable}
                            onBook={() => onBookEquipment?.(e.id, d)}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {!usageQuery.isPending && equipment.length === 0 && (
                  <tr>
                    <td colSpan={EQUIPMENT_DAYS + 1} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>
                      無啟用中的器材
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : !venueDef ? (
            <table aria-label="各場地單日借用情形" style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%', tableLayout: 'fixed', minWidth: 720 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...thStyle, width: 176, textAlign: 'left', paddingRight: 8 }}>場地</th>
                  {periodAxis.map((p) => (
                    <th scope="col" key={p} className="num" style={thStyle}>{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {venues.map((v) => (
                  <tr key={v.id}>
                    <td style={{ whiteSpace: 'nowrap', paddingRight: 8 }}>
                      <button
                        type="button"
                        className="venue-btn"
                        aria-label={`檢視 ${v.name} ${VENUE_DAYS} 天場況`}
                        onClick={() => openVenue(v.id)}
                      >
                        {v.name}
                      </button>
                      {v.capacity != null && (
                        <span className="num" style={{ fontSize: 11, color: 'var(--steel)', marginLeft: 5 }}>{v.capacity}</span>
                      )}
                    </td>
                    {periodAxis.map((p) => {
                      const { state, club } = cellOf(v, dayQuery.data, p)
                      const label = `${v.name} 第${p}節:${CELL[state].label}`
                      return (
                        <td key={p}>
                          <Cell
                            state={state}
                            label={label}
                            club={club}
                            bookable={canBook(gridDate)}
                            onBook={() => onBookVenue?.(v.id, gridDate, p)}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table aria-label={`${venueDef.name} ${VENUE_DAYS} 天借用情形`} style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%', tableLayout: 'fixed', minWidth: 720 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...thStyle, width: 110, textAlign: 'left', paddingRight: 8 }}>日期</th>
                  {periodAxis.map((p) => (
                    <th scope="col" key={p} className="num" style={thStyle}>{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {venueDates.map((d) => {
                  const isToday = d.isSame(todayStart, 'day')
                  const grid = rangeQuery.byDate[d.format('YYYY-MM-DD')]
                  return (
                    <tr key={d.format('YYYY/MM/DD')}>
                      <td className="num" style={{ whiteSpace: 'nowrap', paddingRight: 8, fontSize: 12, fontWeight: isToday ? 600 : 400, color: isToday ? 'var(--seal)' : 'var(--ink)' }}>
                        {d.format('MM/DD')}（{WEEKDAY[d.day()]}）
                      </td>
                      {periodAxis.map((p) => {
                        const { state, club } = cellOf(venueDef, grid, p)
                        const label = `${d.format('MM/DD')} 第${p}節:${CELL[state].label}`
                        return (
                          <td key={p}>
                            <Cell
                              state={state}
                              label={label}
                              club={club}
                              bookable={canBook(d)}
                              onBook={() => onBookVenue?.(venueDef.id, d, p)}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </LoadingBlock>
    </div>
  )
}

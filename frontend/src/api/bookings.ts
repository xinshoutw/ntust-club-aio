// 空間與器材借用 API 層:snake_case ↔ camelCase 與日期(後端 ISO ↔ 顯示 YYYY/MM/DD)轉換集中在此;
// 查詢鍵集中管理,mutation 一律 invalidate 整域(送出借用會同時影響場況圖/可借數/我的借用)
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { api, apiPaged, qs } from './client'
import { useInvalidateBadges } from './badges'
import { fetchAllPages } from './fetchAll'
import type { StatusKey } from '../lib/status'
import { periodRank } from '../lib/periods'

export const DOW_TEXT = ['', '一', '二', '三', '四', '五', '六', '日']

const DATE_FMT = 'YYYY/MM/DD'
const toIso = (d: Dayjs): string => d.format('YYYY-MM-DD')
const fromIso = (s: string): string => dayjs(s).format(DATE_FMT)

/** 承辦退回或撤銷時填的原因與時間(後端由 approval_records 補);社團自行取消為 undefined */
export interface DecisionInfo {
  reason: string
  at: string // YYYY/MM/DD HH:mm
}

/** 三種借用的輸出共用同一組欄位;後端一律帶,沒有處置紀錄時是 null */
interface DecisionOut {
  decision_reason: string | null
  decided_at: string | null
}

const toDecision = (o: DecisionOut): DecisionInfo | undefined =>
  o.decision_reason && o.decided_at
    ? { reason: o.decision_reason, at: dayjs(o.decided_at).format('YYYY/MM/DD HH:mm') }
    : undefined

export interface PageParams {
  page: number
  pageSize: number
}

/** 借用區間(起、訖;含頭含尾) */
export type DateRange = [Dayjs, Dayjs]

// ---- 場地主檔 ----

export interface Venue {
  id: number
  name: string
  category: string
  capacity?: number
  allowFixed: boolean
  allowTemp: boolean
}

interface VenueOut {
  id: number
  name: string
  capacity: number | null
  category: string
  allow_fixed: boolean
  allow_temp: boolean
}

const toVenue = (v: VenueOut): Venue => ({
  id: v.id,
  name: v.name,
  category: v.category,
  capacity: v.capacity ?? undefined,
  allowFixed: v.allow_fixed,
  allowTemp: v.allow_temp,
})

/** 場地名稱(含容納人數)下拉標籤 */
export const venueLabel = (v: Venue): string => (v.capacity ? `${v.name} (${v.capacity} 人)` : v.name)

// ---- 器材主檔(可借數為後端推導) ----

export interface EquipmentItem {
  id: number
  name: string
  totalQty: number
  needsSerial: boolean // False=一般、True=依序點交
  available: number
  /** 單次可借上限(undefined=不限) */
  maxLeaseCount?: number
}

interface EquipmentOut {
  id: number
  name: string
  total_qty: number
  max_lease_count: number | null
  needs_serial: boolean
  available: number
}

const toEquipment = (e: EquipmentOut): EquipmentItem => ({
  id: e.id,
  name: e.name,
  totalQty: e.total_qty,
  maxLeaseCount: e.max_lease_count ?? undefined,
  needsSerial: e.needs_serial,
  available: e.available,
})

/** 一次查詢的器材佔用結果;帶回涵蓋區間,呼叫端才分得出「沒佔用」與「還沒載到」 */
export interface EquipmentUsageGrid {
  /** 這份資料涵蓋的區間(ISO,含頭含尾) */
  start: string
  end: string
  items: EquipmentUsage[]
}

/** 器材逐日佔用量(借用總覽的器材檢視) */
export interface EquipmentUsage {
  id: number
  name: string
  totalQty: number
  /** ISO 日期 → 該日佔用件數;未列出=0 */
  used: Record<string, number>
}

interface EquipmentUsageOut {
  id: number
  name: string
  total_qty: number
  used: Record<string, number>
}

// ---- 借用總覽色格(單日場況) ----

/** 後端僅回傳被佔用/審核中的格子;其餘由前端依場地開放旗標補 可借/不開放 */
export type AvailabilityState = 'pending' | 'temp' | 'fixed' | 'mine' | 'blocked'
/** 該格的一筆待審單;id 僅臨時借用有(點格開審核彈窗),固定借用要到 /admin/rooms 審 */
export interface GridPending {
  id: number | null
  club: string
  kind: 'temp' | 'fixed'
}
/** 每格帶狀態與借用社團名(hover 顯示) */
export interface AvailabilityCell {
  status: AvailabilityState
  club: string
  /** 該格**全部**待審單,含被已核准/不開放蓋掉的那些。
   *  只有審這一關的承辦(權限鍵 abooking)拿得到 —— 其餘角色後端不回這個欄位 */
  pending?: GridPending[]
}
export type AvailabilityGrid = Record<string, Partial<Record<string, AvailabilityCell>>>

interface AvailabilityOut {
  date: string
  grid: AvailabilityGrid
}

// ---- 固定場地借用 ----

export interface FixedWindow {
  open: boolean
  openFrom?: string
  openUntil?: string
  /** 未開放的三種情形要分開講:沒設定 / 還沒開始 / 已結束(後端 fixed_window_state) */
  state: 'unset' | 'upcoming' | 'open' | 'closed'
}

/** 社團端另帶額度:跨申請單合計,與後端送出檢核同一份判定 */
export interface ClubFixedWindow extends FixedWindow {
  usedPeriods: number
  maxPeriods: number
}

interface FixedWindowOut {
  open: boolean
  open_from: string | null
  open_until: string | null
  state: FixedWindow['state']
  used_periods: number
  max_periods: number
}

export interface RoomEntry {
  dow: number // 1=週一 … 7=週日
  periods: string[]
}

export const roomEntryText = (e: RoomEntry): string => `週${DOW_TEXT[e.dow]} 第${e.periods.join('、')}節`

export interface RoomBooking {
  id: number
  venueId: number
  venueName: string
  purpose: string
  /** 目標學期起日(YYYY/MM/DD;取消鈕依此判斷是否已開始) */
  startDate: string
  status: StatusKey
  entries: RoomEntry[]
  decision?: DecisionInfo
}

type BookingStatusOut = 'pending' | 'approved' | 'rejected' | 'cancelled'

interface RoomBookingOut extends DecisionOut {
  id: number
  venue_id: number
  venue_name: string
  purpose: string
  start_date: string
  end_date: string
  status: BookingStatusOut
  created_at: string
  slots: { weekday: number; period: string }[]
}

/** 後端以 slots(weekday×period)攤平儲存;顯示時依星期分組、節次照節次表排序 */
export const toRoomBooking = (r: RoomBookingOut): RoomBooking => {
  const byDow = new Map<number, string[]>()
  for (const s of r.slots) {
    const list = byDow.get(s.weekday) ?? []
    byDow.set(s.weekday, [...list, s.period])
  }
  const entries = [...byDow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dow, periods]) => ({
      dow,
      periods: [...periods].sort((a, b) => periodRank(a) - periodRank(b)),
    }))
  return {
    id: r.id,
    venueId: r.venue_id,
    venueName: r.venue_name,
    purpose: r.purpose,
    startDate: fromIso(r.start_date),
    status: r.status,
    entries,
    decision: toDecision(r),
  }
}

// ---- 臨時場地借用 ----

export interface VenueBookingRecord {
  id: number
  venueId: number
  venueName: string
  activityName?: string
  date: string
  periods: string[]
  purpose: string
  status: StatusKey
  decision?: DecisionInfo
}

interface VenueBookingOut extends DecisionOut {
  id: number
  venue_id: number
  venue_name: string
  activity_id: number | null
  activity_name: string | null
  date: string
  periods: string[]
  purpose: string
  status: BookingStatusOut
  created_at: string
}

const toVenueBooking = (v: VenueBookingOut): VenueBookingRecord => ({
  id: v.id,
  venueId: v.venue_id,
  venueName: v.venue_name,
  activityName: v.activity_name ?? undefined,
  date: fromIso(v.date),
  periods: v.periods,
  purpose: v.purpose,
  status: v.status,
  decision: toDecision(v),
})

// ---- 器材借用 ----

export interface EquipmentLoanRecord {
  id: number
  equipmentId: number
  equipmentName: string
  activityName?: string
  qty: number
  startDate: string
  endDate: string
  purpose: string
  status: StatusKey
  borrower?: string
  returnedBy?: string
  decision?: DecisionInfo
}

type LoanStatusOut = BookingStatusOut | 'checked_out' | 'returned'

interface EquipmentLoanOut extends DecisionOut {
  id: number
  equipment_id: number
  equipment_name: string
  activity_id: number | null
  activity_name: string | null
  qty: number
  start_date: string
  end_date: string
  purpose: string
  status: LoanStatusOut
  borrower_name: string | null
  returner_name: string | null
  overdue: boolean
}

/** 逾期為後端推導旗標(僅借出中可能逾期),顯示時優先於原始狀態 */
export const toEquipmentLoan = (l: EquipmentLoanOut): EquipmentLoanRecord => ({
  id: l.id,
  equipmentId: l.equipment_id,
  equipmentName: l.equipment_name,
  activityName: l.activity_name ?? undefined,
  qty: l.qty,
  startDate: fromIso(l.start_date),
  endDate: fromIso(l.end_date),
  purpose: l.purpose,
  status: l.overdue ? 'overdue' : l.status,
  borrower: l.borrower_name ?? undefined,
  returnedBy: l.returner_name ?? undefined,
  decision: toDecision(l),
})

// ---- 查詢鍵 ----

export const keys = {
  all: ['bookings'] as const,
  active: (kind: string) => ['bookings', 'active', kind] as const,
  returned: (page: number) => ['bookings', 'returned', page] as const,
  venues: ['bookings', 'venues'] as const,
  equipment: (range: [string, string] | null) => ['bookings', 'equipment', range] as const,
  equipmentUsage: (startIso: string, endIso: string) =>
    ['bookings', 'equipment-usage', startIso, endIso] as const,
  availability: (iso: string) => ['bookings', 'availability', iso] as const,
  availabilityRange: (startIso: string, endIso: string, venueId?: number) =>
    ['bookings', 'availability-range', startIso, endIso, venueId ?? null] as const,
  fixedWindow: ['bookings', 'fixed-window'] as const,
  fixedOccupancy: (venueId: number | null) => ['bookings', 'fixed-occupancy', venueId] as const,
  rooms: (p: PageParams) => ['bookings', 'room-bookings', p] as const,
  venueBookings: (p: PageParams) => ['bookings', 'venue-bookings', p] as const,
  loans: (p: PageParams) => ['bookings', 'equipment-loans', p] as const,
}

// ---- 查詢 hooks ----

export function useVenues() {
  return useQuery({
    queryKey: keys.venues,
    queryFn: () => api<VenueOut[]>('/public/venues').then((rows) => rows.map(toVenue)),
  })
}

/** 器材列表;帶借用區間時可借數依該區間計算(未帶時後端只扣借出中,呼叫端一律顯示 —) */
export function useEquipmentList(range?: DateRange | null) {
  return useQuery({
    queryKey: keys.equipment(range ? [toIso(range[0]), toIso(range[1])] : null),
    queryFn: () =>
      api<EquipmentOut[]>(
        `/club/equipment${qs({ start: range && toIso(range[0]), end: range && toIso(range[1]) })}`,
      ).then((rows) => rows.map(toEquipment)),
    // 換區間時保留舊列表避免表格閃空;呼叫端以 isPlaceholderData 判斷可借數是否已對應新區間
    placeholderData: keepPreviousData,
  })
}

/** 借用總覽的器材色格:區間內每項器材的逐日佔用量(未列出的日期=0) */
export function useEquipmentUsage(range: DateRange, enabled = true) {
  const [startIso, endIso] = [toIso(range[0]), toIso(range[1])]
  return useQuery({
    queryKey: keys.equipmentUsage(startIso, endIso),
    enabled,
    queryFn: () =>
      api<EquipmentUsageOut[]>(
        `/public/equipment/usage${qs({ start: startIso, end: endIso })}`,
      ).then(
        (rows): EquipmentUsageGrid => ({
          start: startIso,
          end: endIso,
          items: rows.map((e) => ({
            id: e.id,
            name: e.name,
            totalQty: e.total_qty,
            used: e.used,
          })),
        }),
      ),
    // 翻日期時留住舊資料避免表格閃空;舊資料連自己的區間一起帶回來,
    // 落在區間外的日期呼叫端當「還沒載到」處理 —— 沒對到的日期退成 0 會說謊
    placeholderData: keepPreviousData,
  })
}

const fetchAvailability = (d: Dayjs): Promise<AvailabilityGrid> =>
  api<AvailabilityOut>(`/public/bookings/availability${qs({ date: toIso(d) })}`).then((r) => r.grid)

/** 單日全場地場況 */
export function useAvailability(date: Dayjs) {
  return useQuery({
    queryKey: keys.availability(toIso(date)),
    queryFn: () => fetchAvailability(date),
    placeholderData: keepPreviousData,
  })
}

/** 多日場況(單一場地 15 天檢視):批次端點一次撈整段區間,不逐日發 15 個請求;
 *  venue 給定時後端 SQL 即縮小到該場地 */
export function useAvailabilityDays(dates: Dayjs[], venueId?: number) {
  const startIso = dates.length ? toIso(dates[0]) : ''
  const endIso = dates.length ? toIso(dates[dates.length - 1]) : ''
  const query = useQuery({
    queryKey: keys.availabilityRange(startIso, endIso, venueId),
    queryFn: () =>
      api<{ days: { date: string; grid: AvailabilityGrid }[] }>(
        `/public/bookings/availability-range${qs({ start: startIso, end: endIso, venue: venueId })}`,
      ).then((r) => Object.fromEntries(r.days.map((d) => [d.date, d.grid]))),
    enabled: dates.length > 0,
    placeholderData: keepPreviousData,
  })
  return {
    isPending: query.isPending,
    isError: query.isError,
    error: query.error ?? undefined,
    refetchErrored: () => void query.refetch(),
    byDate: (query.data ?? {}) as Record<string, AvailabilityGrid | undefined>,
  }
}

/** 固定借用開放窗(系統設定日期區間;side nav 與固定借用頁共用同一查詢) */
/** 固定借用可用性:格子的佔用原因由後端判定(送出與核准兩關檢核的同一份) */
export type OccupancyReason = 'blocked' | 'fixed' | 'temp'

export const OCCUPANCY_TEXT: Record<OccupancyReason, string> = {
  blocked: '此時段場地不開放',
  // 不寫「其他社團」:本社已核准的借用同樣佔著時段,也同樣不能再申請
  fixed: '此時段已有已核准的固定借用',
  temp: '學期內有已核准的臨時借用',
}

interface FixedOccupancyOut {
  weekday: number
  period: string
  reason: OccupancyReason
}

/**
 * 該場地下一學期每週時段的佔用:key 為 'dow|period'。
 *
 * 三條與**核准**關的檢核同一份判定(送出關只擋不開放規則,固定/臨時是核准時才擋 —— 多社
 * 競爭同一時段本來就允許,由承辦整單擇一)。前端不自行推導:臨時借用要逐日展開、
 * 不開放規則帶自己的日期區間,兩者都算不對。
 */
export function useFixedOccupancy(venueId: number | null) {
  return useQuery({
    queryKey: keys.fixedOccupancy(venueId),
    enabled: venueId != null,
    queryFn: () =>
      api<FixedOccupancyOut[]>(`/club/room-bookings/occupancy${qs({ venue_id: venueId })}`).then(
        (rows) => new Map(rows.map((r) => [`${r.weekday}|${r.period}`, r.reason])),
      ),
  })
}

export function useFixedWindow() {
  return useQuery({
    queryKey: keys.fixedWindow,
    queryFn: () =>
      api<FixedWindowOut>('/club/room-bookings/window').then(
        (w): ClubFixedWindow => ({
          open: w.open,
          openFrom: w.open_from ? fromIso(w.open_from) : undefined,
          openUntil: w.open_until ? fromIso(w.open_until) : undefined,
          state: w.state,
          usedPeriods: w.used_periods,
          maxPeriods: w.max_periods,
        }),
      ),
  })
}




// 正在借用:伺服器端 active=true。三類的判定不同 —— 固定借用看學期結束日、
// 臨時場地看最早節次的起始時刻、器材只看狀態(pending/approved/checked_out)。
// 不含大量歷史紀錄,逐頁抓齊完整呈現、不限長度
export function useActiveRoomBookings() {
  return useQuery({
    queryKey: keys.active('rooms'),
    queryFn: () =>
      fetchAllPages<RoomBookingOut>('/club/room-bookings', { active: true }).then((rows) =>
        rows.map(toRoomBooking),
      ),
  })
}

export function useActiveVenueBookings() {
  return useQuery({
    queryKey: keys.active('venues'),
    queryFn: () =>
      fetchAllPages<VenueBookingOut>('/club/venue-bookings', { active: true }).then((rows) =>
        rows.map(toVenueBooking),
      ),
  })
}

export function useActiveEquipmentLoans() {
  return useQuery({
    queryKey: keys.active('loans'),
    queryFn: () =>
      fetchAllPages<EquipmentLoanOut>('/club/equipment-loans', { active: true }).then((rows) =>
        rows.map(toEquipmentLoan),
      ),
  })
}

/** 已歸還(伺服器端分頁;原整批撈取後前端切頁) */
export function useReturnedEquipmentLoans(p: PageParams) {
  return useQuery({
    queryKey: keys.returned(p.page),
    queryFn: () =>
      apiPaged<EquipmentLoanOut[]>(
        `/club/equipment-loans${qs({ status: 'returned', page: p.page, page_size: p.pageSize })}`,
      ).then(({ data, total }) => ({ rows: data.map(toEquipmentLoan), total })),
    placeholderData: keepPreviousData,
  })
}

// 最近借用(已結束/退回/取消/歸還;active=false)。
// 伺服器端分頁:退回件排在借用日之後,不翻頁就永遠看不到自己被退回的原因
export const RECENT_PAGE = 5

export interface RecentPage<T> {
  rows: T[]
  total: number
}

export function useRecentRoomBookings(p: PageParams) {
  return useQuery({
    queryKey: keys.rooms(p),
    queryFn: (): Promise<RecentPage<RoomBooking>> =>
      apiPaged<RoomBookingOut[]>(
        `/club/room-bookings${qs({ active: false, page: p.page, page_size: p.pageSize })}`,
      ).then(({ data, total }) => ({ rows: data.map(toRoomBooking), total })),
    placeholderData: keepPreviousData,
  })
}

export function useRecentVenueBookings(p: PageParams) {
  return useQuery({
    queryKey: keys.venueBookings(p),
    queryFn: (): Promise<RecentPage<VenueBookingRecord>> =>
      apiPaged<VenueBookingOut[]>(
        `/club/venue-bookings${qs({ active: false, page: p.page, page_size: p.pageSize })}`,
      ).then(({ data, total }) => ({ rows: data.map(toVenueBooking), total })),
    placeholderData: keepPreviousData,
  })
}

export function useRecentEquipmentLoans(p: PageParams) {
  return useQuery({
    queryKey: keys.loans(p),
    queryFn: (): Promise<RecentPage<EquipmentLoanRecord>> =>
      apiPaged<EquipmentLoanOut[]>(
        `/club/equipment-loans${qs({ active: false, page: p.page, page_size: p.pageSize })}`,
      ).then(({ data, total }) => ({ rows: data.map(toEquipmentLoan), total })),
    placeholderData: keepPreviousData,
  })
}

// ---- 送出申請 ----
// (借用綁定的「審核通過活動」下拉共用 api/activities.ts 的 useActivityList({ status: 'approved' }))

export interface RoomBookingInput {
  venueId: number
  purpose: string
  slots: { weekday: number; period: string }[]
}

export interface VenueBookingInput {
  venueId: number
  /** null = 免綁活動(僅 802 國際事務處,見 VenueBookingPage) */
  activityId: number | null
  date: Dayjs
  periods: string[]
  purpose: string
  phone: string
}

export interface EquipmentLoanInput {
  equipmentId: number
  /** null = 免綁活動(見 lib/noActivityAccount) */
  activityId: number | null
  qty: number
  range: DateRange
  purpose: string
  phone: string
}

export function useBookingMutations() {
  const qc = useQueryClient()
  const invalidateBadges = useInvalidateBadges()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.all })
    invalidateBadges()
  }
  const createRoomBooking = useMutation({
    mutationFn: (b: RoomBookingInput) =>
      api<RoomBookingOut>('/club/room-bookings', {
        method: 'POST',
        body: JSON.stringify({ venue_id: b.venueId, purpose: b.purpose, slots: b.slots }),
      }),
    onSuccess: invalidate,
  })
  const createVenueBooking = useMutation({
    mutationFn: (b: VenueBookingInput) =>
      api<VenueBookingOut>('/club/venue-bookings', {
        method: 'POST',
        body: JSON.stringify({
          venue_id: b.venueId,
          activity_id: b.activityId,
          date: toIso(b.date),
          periods: b.periods,
          purpose: b.purpose,
          phone: b.phone.trim(),
        }),
      }),
    onSuccess: invalidate,
  })
  const createEquipmentLoan = useMutation({
    mutationFn: (b: EquipmentLoanInput) =>
      api<EquipmentLoanOut>('/club/equipment-loans', {
        method: 'POST',
        body: JSON.stringify({
          equipment_id: b.equipmentId,
          activity_id: b.activityId,
          qty: b.qty,
          start_date: toIso(b.range[0]),
          end_date: toIso(b.range[1]),
          purpose: b.purpose,
          phone: b.phone.trim(),
        }),
      }),
    onSuccess: invalidate,
  })
  // 取消:審核中隨時可取消;已核准僅開始日前可取消
  const cancelRoomBooking = useMutation({
    mutationFn: (id: number) =>
      api<null>(`/club/room-bookings/${id}/cancel`, { method: 'POST' }),
    onSuccess: invalidate,
  })
  const cancelVenueBooking = useMutation({
    mutationFn: (id: number) =>
      api<null>(`/club/venue-bookings/${id}/cancel`, { method: 'POST' }),
    onSuccess: invalidate,
  })
  const cancelEquipmentLoan = useMutation({
    mutationFn: (id: number) =>
      api<null>(`/club/equipment-loans/${id}/cancel`, { method: 'POST' }),
    onSuccess: invalidate,
  })
  return {
    createRoomBooking,
    createVenueBooking,
    createEquipmentLoan,
    cancelRoomBooking,
    cancelVenueBooking,
    cancelEquipmentLoan,
  }
}

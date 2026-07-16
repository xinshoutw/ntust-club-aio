// 空間與器材借用 API 層:snake_case ↔ camelCase 與日期(後端 ISO ↔ 顯示 YYYY/MM/DD)轉換集中在此;
// 查詢鍵集中管理,mutation 一律 invalidate 整域(送出借用會同時影響場況圖/可借數/我的借用)
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { api, apiPaged, apiWithMeta, qs } from './client'
import type { StatusKey } from '../lib/status'

// 節次:第 1–10 節與 A–D 節(與後端 booking_service.PERIODS 對齊)
export const PERIODS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'A', 'B', 'C', 'D']
export const DOW_TEXT = ['', '一', '二', '三', '四', '五', '六', '日']

const DATE_FMT = 'YYYY/MM/DD'
const toIso = (d: Dayjs): string => d.format('YYYY-MM-DD')
const fromIso = (s: string): string => dayjs(s).format(DATE_FMT)

export interface PageParams {
  page: number
  pageSize: number
}

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
  category: string
  totalQty: number
  needsSerial: boolean
  available: number
}

/** 依關聯活動推導的借用區間(顯示格式) */
export interface LoanWindow {
  start: string
  end: string
}

export interface EquipmentList {
  items: EquipmentItem[]
  /** 帶 activity_id 查詢時後端 meta 回傳的推導區間;未帶時為 null */
  window: LoanWindow | null
}

interface EquipmentOut {
  id: number
  name: string
  category: string
  total_qty: number
  needs_serial: boolean
  available: number
}

const toEquipment = (e: EquipmentOut): EquipmentItem => ({
  id: e.id,
  name: e.name,
  category: e.category,
  totalQty: e.total_qty,
  needsSerial: e.needs_serial,
  available: e.available,
})

// ---- 借用總覽色格(單日場況) ----

/** 後端僅回傳被佔用/審核中的格子;其餘由前端依場地開放旗標補 可借/不開放 */
export type AvailabilityState = 'pending' | 'temp' | 'fixed' | 'mine'
export type AvailabilityGrid = Record<string, Partial<Record<string, AvailabilityState>>>

interface AvailabilityOut {
  date: string
  grid: AvailabilityGrid
}

// ---- 教室固定借用 ----

export interface FixedWindow {
  open: boolean
  openFrom?: string
  openUntil?: string
}

interface FixedWindowOut {
  open: boolean
  open_from: string | null
  open_until: string | null
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
  status: StatusKey
  entries: RoomEntry[]
}

type BookingStatusOut = 'pending' | 'approved' | 'rejected'

interface RoomBookingOut {
  id: number
  venue_id: number
  venue_name: string
  purpose: string
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
      periods: [...periods].sort((a, b) => PERIODS.indexOf(a) - PERIODS.indexOf(b)),
    }))
  return {
    id: r.id,
    venueId: r.venue_id,
    venueName: r.venue_name,
    purpose: r.purpose,
    status: r.status,
    entries,
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
}

interface VenueBookingOut {
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
  serials?: string[]
  borrower?: string
  returnedBy?: string
}

type LoanStatusOut = BookingStatusOut | 'checked_out' | 'returned'

interface EquipmentLoanOut {
  id: number
  equipment_id: number
  equipment_name: string
  activity_id: number
  activity_name: string | null
  qty: number
  start_date: string
  end_date: string
  purpose: string
  status: LoanStatusOut
  serials: string[] | null
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
  serials: l.serials ?? undefined,
  borrower: l.borrower_name ?? undefined,
  returnedBy: l.returner_name ?? undefined,
})

// ---- 查詢鍵 ----

const keys = {
  all: ['bookings'] as const,
  venues: ['bookings', 'venues'] as const,
  equipment: (activityId: number | null) => ['bookings', 'equipment', activityId] as const,
  availability: (iso: string) => ['bookings', 'availability', iso] as const,
  availabilityRange: (startIso: string, endIso: string) =>
    ['bookings', 'availability-range', startIso, endIso] as const,
  fixedWindow: ['bookings', 'fixed-window'] as const,
  rooms: (p: PageParams | 'all') => ['bookings', 'room-bookings', p] as const,
  venueBookings: (p: PageParams | 'all') => ['bookings', 'venue-bookings', p] as const,
  loans: (p: PageParams | 'all') => ['bookings', 'equipment-loans', p] as const,
}

// ---- 查詢 hooks ----

export function useVenues() {
  return useQuery({
    queryKey: keys.venues,
    queryFn: () => api<VenueOut[]>('/club/venues').then((rows) => rows.map(toVenue)),
  })
}

/** 器材列表;帶 activityId 時可借數依該活動推導區間計算,並回傳區間(meta) */
export function useEquipmentList(activityId?: number) {
  return useQuery({
    queryKey: keys.equipment(activityId ?? null),
    queryFn: async (): Promise<EquipmentList> => {
      const { data, meta } = await apiWithMeta<EquipmentOut[], { loan_start: string; loan_end: string }>(
        `/club/equipment${qs({ activity_id: activityId })}`,
      )
      return {
        items: data.map(toEquipment),
        window: meta?.loan_start && meta.loan_end ? { start: fromIso(meta.loan_start), end: fromIso(meta.loan_end) } : null,
      }
    },
    // 換活動時保留舊列表避免表格閃空;呼叫端以 isPlaceholderData 判斷可借數是否已對應新活動
    placeholderData: keepPreviousData,
  })
}

const fetchAvailability = (d: Dayjs): Promise<AvailabilityGrid> =>
  api<AvailabilityOut>(`/club/bookings/availability${qs({ date: toIso(d) })}`).then((r) => r.grid)

/** 單日全場地場況 */
export function useAvailability(date: Dayjs) {
  return useQuery({
    queryKey: keys.availability(toIso(date)),
    queryFn: () => fetchAvailability(date),
    placeholderData: keepPreviousData,
  })
}

/** 多日場況(單一場地 15 天檢視):批次端點一次撈整段區間(2026-07-17,取代逐日 15 請求) */
export function useAvailabilityDays(dates: Dayjs[]) {
  const startIso = dates.length ? toIso(dates[0]) : ''
  const endIso = dates.length ? toIso(dates[dates.length - 1]) : ''
  const query = useQuery({
    queryKey: keys.availabilityRange(startIso, endIso),
    queryFn: () =>
      api<{ days: { date: string; grid: AvailabilityGrid }[] }>(
        `/club/bookings/availability-range${qs({ start: startIso, end: endIso })}`,
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
export function useFixedWindow() {
  return useQuery({
    queryKey: keys.fixedWindow,
    queryFn: () =>
      api<FixedWindowOut>('/club/room-bookings/window').then(
        (w): FixedWindow => ({
          open: w.open,
          openFrom: w.open_from ? fromIso(w.open_from) : undefined,
          openUntil: w.open_until ? fromIso(w.open_until) : undefined,
        }),
      ),
  })
}

export function useRoomBookings(p: PageParams) {
  return useQuery({
    queryKey: keys.rooms(p),
    queryFn: () =>
      apiPaged<RoomBookingOut[]>(`/club/room-bookings${qs({ page: p.page, page_size: p.pageSize })}`).then(
        ({ data, total }) => ({ rows: data.map(toRoomBooking), total }),
      ),
    placeholderData: keepPreviousData,
  })
}

export function useVenueBookings(p: PageParams) {
  return useQuery({
    queryKey: keys.venueBookings(p),
    queryFn: () =>
      apiPaged<VenueBookingOut[]>(`/club/venue-bookings${qs({ page: p.page, page_size: p.pageSize })}`).then(
        ({ data, total }) => ({ rows: data.map(toVenueBooking), total }),
      ),
    placeholderData: keepPreviousData,
  })
}

export function useEquipmentLoans(p: PageParams) {
  return useQuery({
    queryKey: keys.loans(p),
    queryFn: () =>
      apiPaged<EquipmentLoanOut[]>(`/club/equipment-loans${qs({ page: p.page, page_size: p.pageSize })}`).then(
        ({ data, total }) => ({ rows: data.map(toEquipmentLoan), total }),
      ),
    placeholderData: keepPreviousData,
  })
}

/** 逐頁抓齊(借用總覽的進行中/已歸還需以狀態切分,後端列表無狀態篩選) */
async function fetchAllPages<T>(path: string): Promise<T[]> {
  const PAGE_SIZE = 100 // 後端 page_size 上限
  const out: T[] = []
  for (let page = 1; ; page++) {
    const { data, total } = await apiPaged<T[]>(`${path}${qs({ page, page_size: PAGE_SIZE })}`)
    out.push(...data)
    // 不足一頁即為最後一頁;total 僅作輔助上限(防 meta 異常時提早/無限迴圈)
    if (data.length < PAGE_SIZE || out.length >= total) break
  }
  return out
}

export function useAllRoomBookings() {
  return useQuery({
    queryKey: keys.rooms('all'),
    queryFn: () => fetchAllPages<RoomBookingOut>('/club/room-bookings').then((rows) => rows.map(toRoomBooking)),
  })
}

export function useAllVenueBookings() {
  return useQuery({
    queryKey: keys.venueBookings('all'),
    queryFn: () => fetchAllPages<VenueBookingOut>('/club/venue-bookings').then((rows) => rows.map(toVenueBooking)),
  })
}

export function useAllEquipmentLoans() {
  return useQuery({
    queryKey: keys.loans('all'),
    queryFn: () => fetchAllPages<EquipmentLoanOut>('/club/equipment-loans').then((rows) => rows.map(toEquipmentLoan)),
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
  activityId: number
  date: Dayjs
  periods: string[]
  purpose: string
}

export interface EquipmentLoanInput {
  equipmentId: number
  activityId: number
  qty: number
  purpose: string
}

export function useBookingMutations() {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: keys.all })
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
          purpose: b.purpose,
        }),
      }),
    onSuccess: invalidate,
  })
  return { createRoomBooking, createVenueBooking, createEquipmentLoan }
}

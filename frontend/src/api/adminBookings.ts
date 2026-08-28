// 行政端借用審核 API 層:臨時場地/器材(權限鍵 abooking)+ 固定場地借用(aroom)
// snake_case ↔ camelCase 與日期(ISO ↔ YYYY/MM/DD)轉換集中在此;
// 另帶 apiId(數字主鍵)供 approve/reject 呼叫,頁面不顯示單號
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { api, apiPaged, qs } from './client'
import { useInvalidateBadges } from './badges'
import type { FixedWindow } from './bookings'
import type { StatusKey } from '../lib/status'
import { periodRank } from '../lib/periods'

const toDisplayDate = (iso: string): string => dayjs(iso).format('YYYY/MM/DD')

// ---- 場地主檔(場況圖列首) ----

export interface AdminVenue {
  id: number
  name: string
  capacity: number | null
  category: string
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

const toVenue = (v: VenueOut): AdminVenue => ({
  id: v.id,
  name: v.name,
  capacity: v.capacity,
  category: v.category,
  allowFixed: v.allow_fixed,
  allowTemp: v.allow_temp,
})

// ---- 全校單日場況 ----

export type GridStatus = 'pending' | 'temp' | 'fixed' | 'blocked'

/** 該格的一筆待審單;id 僅臨時借用有(點格開審核彈窗),固定借用要到 /admin/rooms 審 */
export interface GridPending {
  id: number | null
  club: string
  kind: 'temp' | 'fixed'
}

export interface GridCell {
  status: GridStatus
  club: string | null // 決定格色的借用社團(blocked 格為不開放原因)
  pending: GridPending[] // 該格全部待審單;已核准蓋過審核中時,被蓋掉的仍在這裡
}

/** venue_id → 節次 → 格值;未列出的格=可借 */
export type AvailabilityGrid = Record<string, Record<string, GridCell>>

// 格值欄位皆為 snake_case 無關的單字,直接沿用回應形狀(不需轉換層)
interface AvailabilityOut {
  date: string
  grid: AvailabilityGrid
}

// ---- 臨時場地借用 ----

export interface AdminVenueBooking {
  id: string // 字串化 API id:列表 key 與場況格對照用,不顯示
  apiId: number
  club: string
  venue: string
  date: string // YYYY/MM/DD
  periods: string[]
  purpose: string
  phone: string
  activity?: string
  status: StatusKey
}

interface AdminVenueBookingOut {
  id: number
  club_id: number
  club_name: string
  venue_id: number
  venue_name: string
  activity_id: number | null
  activity_name: string | null
  date: string
  periods: string[]
  purpose: string
  phone: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

const toVenueBooking = (b: AdminVenueBookingOut): AdminVenueBooking => ({
  id: String(b.id),
  apiId: b.id,
  club: b.club_name,
  venue: b.venue_name,
  date: toDisplayDate(b.date),
  periods: b.periods,
  purpose: b.purpose,
  phone: b.phone ?? '',
  activity: b.activity_name ?? undefined,
  status: b.status,
})

// ---- 器材借用 ----

/** availableExcludingSelf=該區間可借數(排除本單,僅待審單) */
export interface AdminEquipmentLoan {
  id: string
  apiId: number
  club: string
  equipment: string
  qty: number
  activity?: string
  startDate: string // YYYY/MM/DD
  endDate: string // YYYY/MM/DD
  purpose: string
  phone: string
  status: StatusKey
  /** 上次寄出歸還提醒(MM/DD HH:mm);排程每 3 個上班日自動寄一次 */
  lastRemindedAt?: string
  availableExcludingSelf?: number
}

interface AdminEquipmentLoanOut {
  id: number
  club_id: number
  club_name: string
  equipment_id: number
  equipment_name: string
  activity_id: number
  activity_name: string | null
  qty: number
  start_date: string
  end_date: string
  purpose: string
  phone: string | null
  status: 'pending' | 'approved' | 'rejected' | 'checked_out' | 'returned'
  created_at: string
  overdue: boolean
  available_excluding_self: number | null
}

const toEquipmentLoan = (l: AdminEquipmentLoanOut): AdminEquipmentLoan => ({
  id: String(l.id),
  apiId: l.id,
  club: l.club_name,
  equipment: l.equipment_name,
  qty: l.qty,
  activity: l.activity_name ?? undefined,
  startDate: toDisplayDate(l.start_date),
  endDate: toDisplayDate(l.end_date),
  purpose: l.purpose,
  phone: l.phone ?? '',
  status: l.overdue ? 'overdue' : l.status, // 逾期為推導旗標,顯示上視為狀態
  availableExcludingSelf: l.available_excluding_self ?? undefined,
})

// ---- 固定場地借用 ----

/** venueId 與目標學期起訖供衝突偵測(同場地、學期區間重疊、同星期同節次) */
export interface AdminRoomRequest {
  id: string
  apiId: number
  venueId: number
  club: string
  room: string
  entries: { dow: number; periods: string[] }[] // dow: 1=週一 … 7=週日
  note: string
  status: StatusKey
  /** 目標學期起訖 YYYY/MM/DD(可比大小的格式) */
  startDate: string
  endDate: string
  /** 僅待審單:`dow|period` → 衝突種類(後端算,判定與核准端的檢核同一份) */
  conflicts: Map<string, RoomConflictKind>
}

interface RoomSlotOut {
  weekday: number
  period: string
}

interface AdminRoomBookingOut {
  id: number
  club_id: number
  club_name: string
  venue_id: number
  venue_name: string
  purpose: string
  status: 'pending' | 'approved' | 'rejected'
  start_date: string
  end_date: string
  created_at: string
  slots: RoomSlotOut[]
  conflict_slots: { weekday: number; period: string; kind: RoomConflictKind }[]
}

/** slots(weekday×period 平面列)→ 依星期分組、節次照課表順序排序 */
export const slotsToEntries = (slots: RoomSlotOut[]): AdminRoomRequest['entries'] => {
  const byDow = new Map<number, string[]>()
  for (const s of slots) {
    byDow.set(s.weekday, [...(byDow.get(s.weekday) ?? []), s.period])
  }
  return [...byDow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dow, periods]) => ({
      dow,
      periods: [...periods].sort((a, b) => periodRank(a) - periodRank(b)),
    }))
}

/** 待審單某時段的衝突種類(後端 `booking_service.fixed_conflict_slots` 逐格算好帶回):
 *  `pending`=與別張待審單互撞(擇一核准);`taken`=已被核准的**固定**借用佔用;
 *  `temp`=學期內有已核准的**單日臨時**借用落在這一格。後兩者核准必吃 409 SLOT_TAKEN */
export type RoomConflictKind = 'pending' | 'taken' | 'temp'

/** 逐時段的衝突標示;兩個審核彈窗與待審表共用一份,不各寫各的 */
export const CONFLICT_TEXT: Record<RoomConflictKind, string> = {
  pending: '(衝突)',
  taken: '(已核准佔用)',
  temp: '(臨時借用佔用)',
}

/** 整單的衝突說明:撞到已核准的單就不是「擇一」的問題,核准必被後端擋下 */
export const conflictNote = (kinds: (RoomConflictKind | undefined)[]): string | null =>
  kinds.includes('taken')
    ? '此申請的時段與已核准的固定借用衝突，請退回此申請或撤銷已核准的那筆'
    : kinds.includes('temp')
      ? '此申請的時段與已核准的臨時借用衝突，請退回此申請或撤銷那筆臨時借用'
      : kinds.includes('pending')
        ? '此申請與其他申請衝突，請擇一核准'
        : null

const toRoomRequest = (r: AdminRoomBookingOut): AdminRoomRequest => ({
  id: String(r.id),
  apiId: r.id,
  venueId: r.venue_id,
  club: r.club_name,
  room: r.venue_name,
  entries: slotsToEntries(r.slots),
  note: r.purpose,
  status: r.status,
  startDate: toDisplayDate(r.start_date),
  endDate: toDisplayDate(r.end_date),
  conflicts: new Map(r.conflict_slots.map((c) => [`${c.weekday}|${c.period}`, c.kind])),
})

// ---- queries ----

export const keys = {
  all: ['adminBookings'] as const,
  venues: ['adminBookings', 'venues'] as const,
  availability: (date: string) => ['adminBookings', 'availability', date] as const,
  venueBookings: (p: PendingListParams) => ['adminBookings', 'venueBookings', p] as const,
  equipmentLoans: (p: PendingListParams) => ['adminBookings', 'equipmentLoans', p] as const,
  roomBookings: (p: PendingListParams) => ['adminBookings', 'roomBookings', p] as const,
  fixedWindow: ['adminBookings', 'fixedWindow'] as const,
}

interface FixedWindowOut {
  open: boolean
  open_from: string | null
  open_until: string | null
  state: FixedWindow['state']
}

/** 固定借用受理期間(行政端):**只供頁面上方的說明橫幅**。
 *  期間不擋審核(decisions.md D-04),側欄與清單都不吃它;一般 admin 即可讀,不綁 aroom */
export function useAdminFixedWindow() {
  return useQuery({
    queryKey: keys.fixedWindow,
    queryFn: () =>
      api<FixedWindowOut>('/admin/room-bookings/window').then(
        (w): FixedWindow => ({
          open: w.open,
          openFrom: w.open_from ? toDisplayDate(w.open_from) : undefined,
          openUntil: w.open_until ? toDisplayDate(w.open_until) : undefined,
          state: w.state,
        }),
      ),
  })
}

export interface PendingListParams {
  page: number
  pageSize: number
}

export function useAdminVenues() {
  return useQuery({
    queryKey: keys.venues,
    queryFn: () => api<VenueOut[]>('/admin/venues').then((rows) => rows.map(toVenue)),
  })
}

/** date:ISO(YYYY-MM-DD) */
export function useAdminAvailability(date: string) {
  return useQuery({
    queryKey: keys.availability(date),
    queryFn: () =>
      api<AvailabilityOut>(`/admin/bookings/availability${qs({ date })}`).then((out) => out.grid),
    placeholderData: keepPreviousData,
  })
}

export function usePendingVenueBookings(p: PendingListParams) {
  return useQuery({
    queryKey: keys.venueBookings(p),
    queryFn: () =>
      apiPaged<AdminVenueBookingOut[]>(
        `/admin/venue-bookings${qs({ status: 'pending', page: p.page, page_size: p.pageSize })}`,
      ).then(({ data, total }) => ({ bookings: data.map(toVenueBooking), total })),
    placeholderData: keepPreviousData,
  })
}

export function usePendingEquipmentLoans(p: PendingListParams) {
  return useQuery({
    queryKey: keys.equipmentLoans(p),
    queryFn: () =>
      apiPaged<AdminEquipmentLoanOut[]>(
        `/admin/equipment-loans${qs({ status: 'pending', page: p.page, page_size: p.pageSize })}`,
      ).then(({ data, total }) => ({ loans: data.map(toEquipmentLoan), total })),
    placeholderData: keepPreviousData,
  })
}

export function usePendingRoomBookings(p: PendingListParams) {
  return useQuery({
    queryKey: keys.roomBookings(p),
    queryFn: () =>
      apiPaged<AdminRoomBookingOut[]>(
        `/admin/room-bookings${qs({ status: 'pending', page: p.page, page_size: p.pageSize })}`,
      ).then(({ data, total }) => ({ requests: data.map(toRoomRequest), total })),
    placeholderData: keepPreviousData,
  })
}

// ---- mutations(成功後 invalidate 整域:待審列表與場況圖一起刷新) ----

interface RejectParams {
  id: number
  reason: string
}

export function useAdminBookingMutations() {
  const qc = useQueryClient()
  const invalidateBadges = useInvalidateBadges()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.all })
    invalidateBadges() // 側欄徽章與總覽數字卡
  }
  const post = (path: string, body?: object) =>
    api<unknown>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })

  const approveVenue = useMutation({
    mutationFn: (id: number) => post(`/admin/venue-bookings/${id}/approve`),
    onSuccess: invalidate,
  })
  const rejectVenue = useMutation({
    mutationFn: ({ id, reason }: RejectParams) =>
      post(`/admin/venue-bookings/${id}/reject`, { reason }),
    onSuccess: invalidate,
  })
  const approveLoan = useMutation({
    mutationFn: (id: number) => post(`/admin/equipment-loans/${id}/approve`),
    onSuccess: invalidate,
  })
  const rejectLoan = useMutation({
    mutationFn: ({ id, reason }: RejectParams) =>
      post(`/admin/equipment-loans/${id}/reject`, { reason }),
    onSuccess: invalidate,
  })
  const approveRoom = useMutation({
    mutationFn: (id: number) => post(`/admin/room-bookings/${id}/approve`),
    onSuccess: invalidate,
  })
  const rejectRoom = useMutation({
    mutationFn: ({ id, reason }: RejectParams) =>
      post(`/admin/room-bookings/${id}/reject`, { reason }),
    onSuccess: invalidate,
  })
  // 撤銷已核准:狀態落 cancelled(佔用判定本來就排除),原因必填
  const revokeVenue = useMutation({
    mutationFn: ({ id, reason }: RejectParams) =>
      post(`/admin/venue-bookings/${id}/revoke`, { reason }),
    onSuccess: invalidate,
  })
  const revokeLoan = useMutation({
    mutationFn: ({ id, reason }: RejectParams) =>
      post(`/admin/equipment-loans/${id}/revoke`, { reason }),
    onSuccess: invalidate,
  })
  const revokeRoom = useMutation({
    mutationFn: ({ id, reason }: RejectParams) =>
      post(`/admin/room-bookings/${id}/revoke`, { reason }),
    onSuccess: invalidate,
  })
  return {
    approveVenue,
    rejectVenue,
    revokeVenue,
    approveLoan,
    rejectLoan,
    revokeLoan,
    approveRoom,
    rejectRoom,
    revokeRoom,
  }
}


// ---- 最高權限手動借用:club NULL=行政,顯示「學務處」,直接核准 ----

export interface ManualVenueInput {
  venueId: number
  date: Dayjs
  periods: string[]
  purpose: string
  phone?: string
}

export interface ManualEquipmentInput {
  equipmentId: number
  qty: number
  range: [Dayjs, Dayjs]
  purpose: string
  phone?: string
}

export function useManualBookingMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.all })
    void qc.invalidateQueries({ queryKey: ['bookings'] })
  }
  const createVenue = useMutation({
    mutationFn: (b: ManualVenueInput) =>
      api<unknown>('/admin/bookings/manual-venue', {
        method: 'POST',
        body: JSON.stringify({
          venue_id: b.venueId,
          date: b.date.format('YYYY-MM-DD'),
          periods: b.periods,
          purpose: b.purpose,
          phone: b.phone?.trim() || null,
        }),
      }),
    onSuccess: invalidate,
  })
  const createEquipment = useMutation({
    mutationFn: (b: ManualEquipmentInput) =>
      api<unknown>('/admin/bookings/manual-equipment', {
        method: 'POST',
        body: JSON.stringify({
          equipment_id: b.equipmentId,
          qty: b.qty,
          start_date: b.range[0].format('YYYY-MM-DD'),
          end_date: b.range[1].format('YYYY-MM-DD'),
          purpose: b.purpose,
          phone: b.phone?.trim() || null,
        }),
      }),
    onSuccess: invalidate,
  })
  return { createVenue, createEquipment }
}

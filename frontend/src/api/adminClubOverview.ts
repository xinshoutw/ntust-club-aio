// 行政端「社團總覽」接線:單一社團的進行中活動申請/三類借用/報修列表。
// 活動詳情與簽核 mutations 直接沿用 adminActivities.ts(彈窗資料形狀=ReviewItem);
// 借用類轉換沿用 adminBookings.ts 匯出的型別與 slotsToEntries,
// 查詢鍵掛各 domain 前綴(adminActivities/adminBookings/adminMaintenance)下,
// 對應 mutations 的整域 invalidate 可一併刷新本頁列表
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import type { StatusKey } from '../lib/status'
import {
  slotsToEntries,
  type AdminEquipmentLoan,
  type AdminRoomRequest,
  type RoomConflictKind,
  type AdminVenueBooking,
} from './adminBookings'
import { apiPaged, qs } from './client'
import { slashDate } from './adminClubs'
import { fetchAllPages } from './fetchAll'

// ---- 活動申請(僅進行中;點列後詳情走 adminActivities.useAdminActivityDetail) ----

type ActivityStatusOut =
  | 'draft'
  | 'pending_advisor'
  | 'pending_chief'
  | 'pending_dean'
  | 'approved'
  | 'rejected'
  | 'closing_pending_advisor'
  | 'closed'

interface ActivityListOut {
  id: number
  name: string
  status: ActivityStatusOut
}

export interface AdminActivityRow {
  id: number
  name: string
  status: StatusKey
}

// 「進行中申請」=尚在簽核流程中的申請(申請三關+結案單關)
const IN_PROGRESS: readonly ActivityStatusOut[] = [
  'pending_advisor',
  'pending_chief',
  'pending_dean',
  'closing_pending_advisor',
]

const overviewKeys = {
  // 掛 adminActivities 前綴:useAdminActivityMutations 的 invalidate 一併刷新
  activities: (clubId: number) => ['adminActivities', 'club', clubId] as const,
  roomBookings: (clubId: number) => ['adminBookings', 'club', clubId, 'rooms'] as const,
  venueBookings: (clubId: number) => ['adminBookings', 'club', clubId, 'venues'] as const,
  equipmentLoans: (p: LoanListParams) => ['adminBookings', 'loans', p] as const,
  overdueLoans: (page: number) => ['adminBookings', 'loans', 'overdue', page] as const,
  maintenance: (clubId: number) => ['adminMaintenance', 'club', clubId] as const,
}

// 薄殼列表(只讀 id/name/status;完整形狀在 adminActivities.ts):
// 與 useAdminActivities 分開實作是為了 clubId 未定時的 enabled 擋載
// canView:呼叫端依 permissions 決定;無權限的區塊不發 API(避免整排 403)
export function useAdminClubActivities(clubId: number | null, canView = true) {
  return useQuery({
    queryKey: overviewKeys.activities(clubId ?? 0),
    enabled: clubId != null && canView,
    // 進行中的狀態交給後端篩(status 收多值):這頁只顯示進行中,不該把該社歷年申請都抓回來
    queryFn: () =>
      fetchAllPages<ActivityListOut>('/admin/activities', {
        club_id: clubId,
        status: [...IN_PROGRESS],
      }).then((rows) =>
        rows.map((a): AdminActivityRow => ({ id: a.id, name: a.name, status: a.status })),
      ),
  })
}

// ---- 借用類(單一社團;資料形狀=adminBookings.ts 的相容型別,可直接餵 BookingReviewModal)----
// DTO 介面與 adminBookings.ts 重複宣告:依「src/api 只新建自己檔案」的分工約定,
// 待平行作業合流後再抽共用(轉換邏輯已透過匯出的型別/slotsToEntries 對齊)

interface AdminVenueBookingOut {
  id: number
  club_name: string
  venue_name: string
  activity_name: string | null
  date: string
  periods: string[]
  purpose: string
  phone: string | null
  status: 'pending' | 'approved' | 'rejected'
}

interface AdminRoomBookingOut {
  id: number
  club_name: string
  venue_id: number
  venue_name: string
  purpose: string
  status: 'pending' | 'approved' | 'rejected'
  start_date: string
  end_date: string
  slots: { weekday: number; period: string }[]
  conflict_slots: { weekday: number; period: string; kind: RoomConflictKind }[]
}

interface AdminEquipmentLoanOut {
  id: number
  club_name: string
  equipment_name: string
  activity_name: string | null
  qty: number
  start_date: string
  end_date: string
  purpose: string
  phone: string | null
  status: 'pending' | 'approved' | 'rejected' | 'checked_out' | 'returned'
  overdue: boolean
  last_reminded_at: string | null
  available_excluding_self: number | null
}

const toVenueBooking = (b: AdminVenueBookingOut): AdminVenueBooking => ({
  id: String(b.id),
  apiId: b.id,
  club: b.club_name,
  venue: b.venue_name,
  date: slashDate(b.date),
  periods: b.periods,
  purpose: b.purpose,
  phone: b.phone ?? '',
  activity: b.activity_name ?? undefined,
  status: b.status,
})

const toRoomRequest = (r: AdminRoomBookingOut): AdminRoomRequest => ({
  id: String(r.id),
  apiId: r.id,
  venueId: r.venue_id,
  club: r.club_name,
  room: r.venue_name,
  entries: slotsToEntries(r.slots),
  note: r.purpose,
  status: r.status,
  startDate: slashDate(r.start_date),
  endDate: slashDate(r.end_date),
  conflicts: new Map(r.conflict_slots.map((c) => [`${c.weekday}|${c.period}`, c.kind])),
})

const toEquipmentLoan = (l: AdminEquipmentLoanOut): AdminEquipmentLoan => ({
  id: String(l.id),
  apiId: l.id,
  club: l.club_name,
  equipment: l.equipment_name,
  qty: l.qty,
  activity: l.activity_name ?? undefined,
  startDate: slashDate(l.start_date),
  endDate: slashDate(l.end_date),
  phone: l.phone ?? '',
  purpose: l.purpose,
  status: l.overdue ? 'overdue' : l.status, // 逾期為推導旗標,顯示上視為狀態
  lastRemindedAt: l.last_reminded_at ? dayjs(l.last_reminded_at).format('MM/DD HH:mm') : undefined,
  availableExcludingSelf: l.available_excluding_self ?? undefined,
})

// 借用類三張表都只顯示「進行中」的單,判定在後端 active=true(與社團端總覽同一支推導):
// 借用不會因為日期過了就換狀態,只篩 status 會把整段歷史都當成進行中抓回來。
export function useAdminClubRoomBookings(clubId: number | null, canView = true) {
  return useQuery({
    queryKey: overviewKeys.roomBookings(clubId ?? 0),
    enabled: clubId != null && canView,
    queryFn: () =>
      fetchAllPages<AdminRoomBookingOut>('/admin/room-bookings', {
        club_id: clubId,
        active: true,
      }).then((rows) => rows.map(toRoomRequest)),
  })
}

export function useAdminClubVenueBookings(clubId: number | null, canView = true) {
  return useQuery({
    queryKey: overviewKeys.venueBookings(clubId ?? 0),
    enabled: clubId != null && canView,
    queryFn: () =>
      fetchAllPages<AdminVenueBookingOut>('/admin/venue-bookings', {
        club_id: clubId,
        active: true,
      }).then((rows) => rows.map(toVenueBooking)),
  })
}

export interface LoanListParams {
  clubId?: number | null
  /** 進行中(審核中/已核准/借出中);判定在後端,見 booking_service */
  active?: boolean
}

/** 器材借用列表:社團總覽用(帶 clubId + active)。逾期追蹤走 `useOverdueLoans`(伺服器分頁) */
export function useAdminEquipmentLoanList(p: LoanListParams, canView = true) {
  return useQuery({
    queryKey: overviewKeys.equipmentLoans(p),
    enabled: p.clubId !== null && canView, // null=社團主檔尚未載入;undefined=不以社團篩選
    queryFn: () =>
      fetchAllPages<AdminEquipmentLoanOut>('/admin/equipment-loans', {
        club_id: p.clubId,
        active: p.active,
      }).then((rows) => rows.map(toEquipmentLoan)),
  })
}

export const OVERDUE_PAGE_SIZE = 20

/** 逾期追蹤頁:逾期未還器材(伺服器端分頁;逾期為後端推導,排序=逾越最久在前) */
export function useOverdueLoans(page: number) {
  return useQuery({
    queryKey: overviewKeys.overdueLoans(page),
    queryFn: () =>
      apiPaged<AdminEquipmentLoanOut[]>(
        `/admin/equipment-loans${qs({ status: 'overdue', page, page_size: OVERDUE_PAGE_SIZE })}`,
      ).then(({ data, total }) => ({ rows: data.map(toEquipmentLoan), total })),
  })
}

// ---- 線上申請:空間報修(幹部證明/郵局異動由 /admin/applications 管理頁承載,本頁暫不列) ----

export interface AdminMaintenanceRow {
  id: number
  location: string
  items: string
  status: StatusKey // pending | in_progress | done
  handleNote?: string
  createdAt: string
  /** 佐證照片/影片:報修最主要的判斷依據(下載走 GET /files/{id}) */
  evidence: { id: string; name: string }[]
}

interface AdminMaintenanceOut {
  id: number
  location: string
  items: string
  status: 'pending' | 'in_progress' | 'done'
  handle_note: string | null
  created_at: string
  evidence: { id: string; original_name: string }[]
}

export function useAdminClubMaintenance(clubId: number | null, canView = true) {
  return useQuery({
    queryKey: overviewKeys.maintenance(clubId ?? 0),
    enabled: clubId != null && canView,
    // 只顯示未完成的報修:狀態交給後端篩
    queryFn: () =>
      fetchAllPages<AdminMaintenanceOut>('/admin/maintenance', {
        club_id: clubId,
        status: ['pending', 'in_progress'],
      }).then((rows) =>
        rows.map(
          (m): AdminMaintenanceRow => ({
            id: m.id,
            location: m.location,
            items: m.items,
            status: m.status,
            handleNote: m.handle_note ?? undefined,
            createdAt: slashDate(m.created_at),
            evidence: (m.evidence ?? []).map((f) => ({ id: f.id, name: f.original_name })),
          }),
        ),
      ),
  })
}

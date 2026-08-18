// 工讀生端 API 層(prefix /staff):違規開立/查詢、器材借出/歸還點交、逾期追蹤。
// snake↔camel 與日期轉換集中在此;query keys 分 domain、mutation onSuccess invalidate 整域。
// club_name 為 null=行政手動借用 → 統一在此層顯示為「學務處」(manual 旗標供頁面判斷)。
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { api, apiPaged, qs } from './client'

export const STAFF_PAGE_SIZE = 20

// ---- 基礎資料(違規開立下拉/項目目錄) ----

export interface StaffClub {
  id: number
  name: string
  isActive: boolean
}

interface StaffClubOut {
  id: number
  name: string
  is_active: boolean
}

// ---- 違規 ----

export type StaffViolationStatus = 'violation_open' | 'violation_resolved'

export interface StaffViolation {
  id: number
  club: string
  date: string // 發生日 YYYY/MM/DD
  location: string
  items: string[]
  other?: string
  filler: string // 填寫人(工讀生)
  status: StaffViolationStatus
  deadline: string // 銷案期限 YYYY/MM/DD(開立日 +1 個月;後端推導)
  expired: boolean // 已逾銷案期限(後端推導)
}

interface StaffViolationOut {
  id: number
  club_name: string
  occurred_on: string
  location: string
  items: string[]
  other: string | null
  filler_name: string
  status: 'open' | 'resolved'
  resolve_deadline: string | null
  resolve_expired: boolean
}

const toViolation = (v: StaffViolationOut): StaffViolation => ({
  id: v.id,
  club: v.club_name,
  date: dayjs(v.occurred_on).format('YYYY/MM/DD'),
  location: v.location,
  items: v.items,
  other: v.other ?? undefined,
  filler: v.filler_name,
  status: v.status === 'open' ? 'violation_open' : 'violation_resolved',
  deadline: v.resolve_deadline ? dayjs(v.resolve_deadline).format('YYYY/MM/DD') : '',
  expired: v.resolve_expired,
})

// ---- 器材借用(點交工作清單) ----

export type StaffLoanStatus = 'approved' | 'checked_out' | 'overdue'

export interface StaffLoan {
  id: number
  club: string // club_name null → 學務處(行政手動借用)
  manual: boolean // 行政手動借用:無社團可通知(逾期頁提醒鈕停用)
  equipment: string
  needsSerial: boolean // 依序點交:點交畫面提醒現場核對序號(序號不入系統)
  qty: number
  start: string // YYYY/MM/DD
  end: string
  purpose: string
  phone: string // 申請時填的聯絡人電話(手動借用可能為空)
  borrower?: string // 借出點交時登記
  overdue: boolean
  due: string // 應歸還時限 YYYY/MM/DD HH:mm(結束日之隔天上班日;後端推導)
  lastRemindedAt?: string // 上次提醒 MM/DD HH:mm;排程每 3 個上班日自動寄一次
  daysLate: number // 已逾天數(台北時區日差;未逾期為 0)
}

interface StaffLoanOut {
  id: number
  club_name: string | null
  equipment_name: string
  needs_serial: boolean
  qty: number
  start_date: string
  end_date: string
  purpose: string
  phone: string | null
  status: string
  borrower_name: string | null
  overdue: boolean
  overdue_deadline: string | null
  last_reminded_at: string | null
}

// 台北時區「今天」:使用者可能不在 +08:00,不可直接用本地日期
const taipeiToday = () => dayjs(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }))

// 應歸還時限帶 +08:00 生成,ISO 字串日期部即台北當地日 → 直接取日差
const daysLate = (deadlineIso: string): number =>
  Math.max(taipeiToday().diff(dayjs(deadlineIso.slice(0, 10)), 'day'), 0)

const toLoan = (l: StaffLoanOut): StaffLoan => ({
  id: l.id,
  club: l.club_name ?? '學務處',
  manual: l.club_name == null,
  equipment: l.equipment_name,
  needsSerial: l.needs_serial,
  qty: l.qty,
  start: dayjs(l.start_date).format('YYYY/MM/DD'),
  end: dayjs(l.end_date).format('YYYY/MM/DD'),
  purpose: l.purpose,
  phone: l.phone ?? '',
  borrower: l.borrower_name ?? undefined,
  lastRemindedAt: l.last_reminded_at ? dayjs(l.last_reminded_at).format('MM/DD HH:mm') : undefined,
  overdue: l.overdue,
  due: l.overdue_deadline ? dayjs(l.overdue_deadline).format('YYYY/MM/DD HH:mm') : '',
  daysLate: l.overdue_deadline ? daysLate(l.overdue_deadline) : 0,
})

// ---- queries ----

const keys = {
  all: ['staff'] as const,
  clubs: ['staff', 'clubs'] as const,
  violationItems: ['staff', 'violationItems'] as const,
  violations: (page: number, sort: string | undefined) => ['staff', 'violations', page, sort] as const,
  loans: (status: StaffLoanStatus, page: number) => ['staff', 'loans', status, page] as const,
}

export function useStaffClubs() {
  return useQuery({
    queryKey: keys.clubs,
    queryFn: () =>
      api<StaffClubOut[]>('/staff/clubs').then((rows) =>
        rows.map((c): StaffClub => ({ id: c.id, name: c.name, isActive: c.is_active })),
      ),
  })
}

export function useViolationItems() {
  return useQuery({
    queryKey: keys.violationItems,
    queryFn: () => api<string[]>('/staff/violation-items'),
  })
}

/** sort:逗號多鍵(白名單 date/location/items/filler/deadline/status);未帶=後端預設 未銷案在前+發生日升冪 */
export function useStaffViolations(page: number, sort?: string) {
  return useQuery({
    queryKey: keys.violations(page, sort),
    queryFn: () =>
      apiPaged<StaffViolationOut[]>(
        `/staff/violations${qs({ sort, page, page_size: STAFF_PAGE_SIZE })}`,
      ).then(({ data, total }) => ({ violations: data.map(toViolation), total })),
    placeholderData: keepPreviousData,
  })
}

export function useStaffLoans(status: StaffLoanStatus, page: number) {
  return useQuery({
    queryKey: keys.loans(status, page),
    queryFn: () =>
      apiPaged<StaffLoanOut[]>(
        `/staff/equipment-loans${qs({ status, page, page_size: STAFF_PAGE_SIZE })}`,
      ).then(({ data, total }) => ({ loans: data.map(toLoan), total })),
    placeholderData: keepPreviousData,
  })
}

// ---- mutations ----

export interface ViolationInput {
  clubId: number
  occurredOn: Dayjs
  location: string
  items: string[]
  other?: string
}

export function useStaffMutations() {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: keys.all })
  const fileViolation = useMutation({
    mutationFn: (b: ViolationInput) =>
      api<StaffViolationOut>('/staff/violations', {
        method: 'POST',
        body: JSON.stringify({
          club_id: b.clubId,
          occurred_on: b.occurredOn.format('YYYY-MM-DD'),
          location: b.location,
          items: b.items,
          other: b.other || undefined,
        }),
      }),
    onSuccess: invalidate,
  })
  const checkout = useMutation({
    mutationFn: ({ id, borrower }: { id: number; borrower: string }) =>
      api<StaffLoanOut>(`/staff/equipment-loans/${id}/checkout`, {
        method: 'POST',
        body: JSON.stringify({ borrower_name: borrower }),
      }),
    onSuccess: invalidate,
  })
  const checkin = useMutation({
    mutationFn: ({ id, returner, note }: { id: number; returner: string; note?: string }) =>
      api<StaffLoanOut>(`/staff/equipment-loans/${id}/checkin`, {
        method: 'POST',
        body: JSON.stringify({ returner_name: returner, note: note || undefined }),
      }),
    onSuccess: invalidate,
  })
  // 提醒不改借用狀態,毋須 invalidate
  const remind = useMutation({
    mutationFn: (id: number) => api<null>(`/staff/equipment-loans/${id}/remind`, { method: 'POST' }),
  })
  return { fileViolation, checkout, checkin, remind }
}

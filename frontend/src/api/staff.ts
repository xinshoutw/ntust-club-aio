// 工讀生端 API 層(prefix /staff):違規開立/查詢、器材借出/歸還點交、逾期追蹤。
// snake↔camel 與日期轉換集中在此;query keys 分 domain、mutation onSuccess invalidate 整域。
// club_name 為 null=行政手動借用 → 統一在此層顯示為「學務處」(manual 旗標供頁面判斷)。
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { api, apiPaged, qs } from './client'
import { taipeiToday } from '../lib/today'
import { useInvalidateBadges } from './badges'
import { PartialUploadError, uploadFile } from './applications'

export const STAFF_PAGE_SIZE = 20

// ---- 基礎資料(違規開立下拉/項目目錄) ----

export interface StaffClub {
  id: number
  name: string
  /** 社團性質:二級選單的第一層資料夾;停社舊社可能為 null → 「未分類」 */
  attribute: string | null
  isActive: boolean
}

interface StaffClubOut {
  id: number
  name: string
  attribute: string | null
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
  /** 現場照片/影片(未歸檔者;下載走 GET /files/{id}) */
  attachments: { id: string; name: string }[]
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
  attachments: { id: string; original_name: string }[]
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
  attachments: (v.attachments ?? []).map((f) => ({ id: f.id, name: f.original_name })),
})

/** 每張勸導單附件上限;後端 staff.MAX_VIOLATION_ATTACHMENTS 為權威 */
export const MAX_VIOLATION_ATTACHMENTS = 5

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
  borrower?: string // 收件人(借出點交時登記)
  lender?: string // 出借人(辦理借出點交的工讀生;未借出或舊資料為空)
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
  checkout_by_name: string | null
  overdue: boolean
  overdue_deadline: string | null
  last_reminded_at: string | null
}

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
  lender: l.checkout_by_name ?? undefined,
  lastRemindedAt: l.last_reminded_at ? dayjs(l.last_reminded_at).format('MM/DD HH:mm') : undefined,
  overdue: l.overdue,
  due: l.overdue_deadline ? dayjs(l.overdue_deadline).format('YYYY/MM/DD HH:mm') : '',
  daysLate: l.overdue_deadline ? daysLate(l.overdue_deadline) : 0,
})

// ---- queries ----

const keys = {
  all: ['staff'] as const,
  clubs: ['staff', 'clubs'] as const,
  config: ['staff', 'config'] as const,
  violationItems: ['staff', 'violationItems'] as const,
  violations: (page: number, sort: string | undefined) => ['staff', 'violations', page, sort] as const,
  loans: (status: StaffLoanStatus, page: number) => ['staff', 'loans', status, page] as const,
}

export function useStaffClubs() {
  return useQuery({
    queryKey: keys.clubs,
    queryFn: () =>
      api<StaffClubOut[]>('/staff/clubs').then((rows) =>
        rows.map((c): StaffClub => ({
          id: c.id,
          name: c.name,
          attribute: c.attribute,
          isActive: c.is_active,
        })),
      ),
  })
}

export interface StaffConfig {
  /** 勸導單附件的單檔上限(bytes);後端 system_settings upload_limits 為權威 */
  imgBytes: number
  videoBytes: number
}

const MB = 1024 * 1024

export function useStaffConfig() {
  return useQuery({
    queryKey: keys.config,
    queryFn: () =>
      api<{ upload_limits: { img_mb: number; video_mb: number } }>('/staff/config').then(
        (o): StaffConfig => ({
          imgBytes: o.upload_limits.img_mb * MB,
          videoBytes: o.upload_limits.video_mb * MB,
        }),
      ),
    staleTime: 5 * 60 * 1000, // 組態變動不頻繁,快取 5 分鐘
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
  /** 現場照片/影片(選填):主體建立後逐檔上傳 */
  files: File[]
}

export function useStaffMutations() {
  const qc = useQueryClient()
  const invalidateBadges = useInvalidateBadges()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.all })
    invalidateBadges()
  }
  // 兩段式(與空間報修同):先 POST 主體,再逐檔上傳附件。第二步失敗時勸導單已經開立,
  // 訊息要說清楚 —— 再送一張等於重複勸導(每張都扣行政分),補附件要到「違規紀錄查詢」
  const fileViolation = useMutation({
    mutationFn: async (b: ViolationInput) => {
      const row = await api<StaffViolationOut>('/staff/violations', {
        method: 'POST',
        body: JSON.stringify({
          club_id: b.clubId,
          occurred_on: b.occurredOn.format('YYYY-MM-DD'),
          location: b.location,
          items: b.items,
          other: b.other || undefined,
        }),
      })
      try {
        for (const f of b.files) {
          await uploadFile(`/staff/violations/${row.id}/attachments`, f)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`勸導單已開立，但附件上傳失敗（${msg}），請勿重送，可至「違規紀錄查詢」補傳`)
      }
      return row
    },
    // 主體建立後不論附件成敗,列表都已變動
    onSettled: invalidate,
  })
  /** 補傳附件:失敗時回報已上傳成功的檔案,呼叫端把它們移出待傳清單 */
  const addAttachments = useMutation({
    mutationFn: async ({ id, files }: { id: number; files: File[] }) => {
      const done: File[] = []
      for (const f of files) {
        try {
          await uploadFile(`/staff/violations/${id}/attachments`, f)
        } catch (e) {
          throw new PartialUploadError(e instanceof Error ? e.message : String(e), done)
        }
        done.push(f)
      }
    },
    onSettled: invalidate,
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
  return { fileViolation, addAttachments, checkout, checkin, remind }
}

// 行政端活動審核/結案審核 API 層:snake_case ↔ camelCase 與日期(ISO ↔ YYYY/MM/DD)
// 轉換集中在此;列表/詳情形狀相容 ReviewItem(id=數字字串),審核彈窗可直接沿用;
// 查詢鍵集中管理,mutation 一律 invalidate 整域 + 總覽數字卡
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'
import { fileUrl } from './activities'
import type { SessionUser } from './auth'
import type { StatusKey } from '../lib/status'
import type { ReviewItem } from '../features/admin/reviewMock'

// ---- 前端型別 ----

/** 後端實際儲存的活動狀態(locked 為前端推導顯示鍵,不可作查詢參數) */
export type AdminActivityStatus =
  | 'pending_advisor'
  | 'pending_chief'
  | 'pending_dean'
  | 'approved'
  | 'rejected'
  | 'closing_pending_advisor'
  | 'closed'

export interface AdminActivity extends ReviewItem {
  activityId: number
  clubId: number
  endDate: string // YYYY/MM/DD(未跨日 = date)
  /** 送件時間(後端無獨立送出時間戳,以建立時間近似)YYYY/MM/DD HH:mm */
  submittedAt: string
  selfFundTotal: number
  approvedTotal?: number
  closeLocked: boolean
  closeDeadline?: string // 結案期限=活動結束日+鎖定月數(推導)
  semester: string
}

export interface AdminFileRef {
  id: string
  name: string
  url: string
}

export interface AdminCloseReport {
  memberCount: number
  nonMemberCount: number
  actualStart: string // HH:mm
  actualEnd: string
  actualLocation: string
  highlights: string
  goals: string
  others: string
  reviewMeeting: boolean
  reviewDate?: string // YYYY/MM/DD
  reviewAttendees?: number
  reviewTopics?: string
  reviewConclusion?: string
  videoUrl?: string
  expense: number
  submittedAt: string // YYYY/MM/DD HH:mm
  reflections: { name: string; dept: string; text: string }[]
}

export interface AdminActivityDetail extends AdminActivity {
  detail: NonNullable<ReviewItem['detail']>
  report?: AdminCloseReport
  photos: AdminFileRef[]
}

// ---- 後端 schema(backend/app/schemas/activities.py)----

interface BudgetItemOut {
  id: number
  category: string
  description: string
  self_fund: number
  requested_subsidy: number
  approved_subsidy: number | null
}

interface FileOut {
  id: string
  original_name: string
  size: number
  mime: string
}

interface ReportOut {
  member_count: number
  non_member_count: number
  actual_start: string
  actual_end: string
  actual_location: string
  highlights: string
  goals: string
  others: string
  review_meeting: boolean
  review_date: string | null
  review_attendees: number | null
  review_topics: string | null
  review_conclusion: string | null
  video_url: string | null
  expense: number
  submitted_at: string
  reflections: { id: number; student_name: string; dept: string; body: string }[]
}

interface AdminActivityOut {
  id: number
  club_id: number
  club_name: string
  name: string
  type: ReviewItem['type']
  is_large: boolean
  is_large_approved: boolean | null
  date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  location: string
  content: string
  participants_in: number
  participants_out: number
  fund_source: string | null
  school_approved: number | null
  status: string
  created_at: string
  self_fund_total: number
  requested_total: number
  approved_total: number | null
  semester: string
  close_locked: boolean
  close_deadline: string | null
  can_close: boolean
}

interface AdminActivityDetailOut extends AdminActivityOut {
  budget_items: BudgetItemOut[]
  report: ReportOut | null
  photos: FileOut[]
  attachments: FileOut[]
}

// ---- 轉換 ----

const slashDate = (iso: string): string => dayjs(iso).format('YYYY/MM/DD')
const slashDateTime = (iso: string): string => dayjs(iso).format('YYYY/MM/DD HH:mm')
const hm = (t: string): string => t.slice(0, 5) // 'HH:MM:SS' → 'HH:MM'

// 逾期鎖定為推導狀態:已核准且 close_locked 時以前端顯示鍵 'locked' 呈現
const toStatusKey = (o: AdminActivityOut): StatusKey =>
  o.status === 'approved' && o.close_locked ? 'locked' : (o.status as StatusKey)

const toAdminActivity = (o: AdminActivityOut): AdminActivity => ({
  id: String(o.id),
  activityId: o.id,
  clubId: o.club_id,
  club: o.club_name,
  name: o.name,
  type: o.type,
  isLarge: o.is_large,
  largeApproved: o.is_large_approved ?? undefined,
  date: slashDate(o.date),
  endDate: slashDate(o.end_date),
  requested: o.requested_total,
  selfFundTotal: o.self_fund_total,
  approvedTotal: o.approved_total ?? undefined,
  status: toStatusKey(o),
  fundSource: o.fund_source ?? undefined,
  submittedAt: slashDateTime(o.created_at),
  closeLocked: o.close_locked,
  closeDeadline: o.close_deadline ? slashDate(o.close_deadline) : undefined,
  semester: o.semester,
})

const toFileRef = (f: FileOut): AdminFileRef => ({ id: f.id, name: f.original_name, url: fileUrl(f.id) })

const toReport = (r: ReportOut): AdminCloseReport => ({
  memberCount: r.member_count,
  nonMemberCount: r.non_member_count,
  actualStart: hm(r.actual_start),
  actualEnd: hm(r.actual_end),
  actualLocation: r.actual_location,
  highlights: r.highlights,
  goals: r.goals,
  others: r.others,
  reviewMeeting: r.review_meeting,
  reviewDate: r.review_date ? slashDate(r.review_date) : undefined,
  reviewAttendees: r.review_attendees ?? undefined,
  reviewTopics: r.review_topics ?? undefined,
  reviewConclusion: r.review_conclusion ?? undefined,
  videoUrl: r.video_url ?? undefined,
  expense: r.expense,
  submittedAt: slashDateTime(r.submitted_at),
  reflections: r.reflections.map((x) => ({ name: x.student_name, dept: x.dept, text: x.body })),
})

// 日期時間彙整:跨日附結束日,有填時間附 HH:mm–HH:mm
const timeRangeOf = (o: AdminActivityOut): string => {
  const days = o.end_date !== o.date ? `${slashDate(o.date)} – ${slashDate(o.end_date)}` : slashDate(o.date)
  const time = o.start_time && o.end_time ? ` ${hm(o.start_time)}–${hm(o.end_time)}` : ''
  return `${days}${time}`
}

const toAdminDetail = (o: AdminActivityDetailOut): AdminActivityDetail => ({
  ...toAdminActivity(o),
  detail: {
    timeRange: timeRangeOf(o),
    location: o.location,
    participantsIn: o.participants_in,
    participantsOut: o.participants_out,
    submittedAt: slashDateTime(o.created_at),
    attachments: o.attachments.map((f) => f.original_name),
    attachmentFiles: o.attachments.map(toFileRef),
    budget: o.budget_items.map((b) => ({
      id: b.id,
      category: b.category,
      description: b.description,
      selfFund: b.self_fund,
      requested: b.requested_subsidy,
      approved: b.approved_subsidy ?? b.requested_subsidy, // 未核定前以擬請值預填
    })),
  },
  report: o.report ? toReport(o.report) : undefined,
  photos: o.photos.map(toFileRef),
})

// ---- 「本關」推導 ----
// 後端未回可操作性欄位,依 status + 登入者 permissions 推導,
// 對齊後端 _require_stage_key:學務長關卡須本人持 approve_dean(super 不得代簽)

export type ReviewStage = 'advisor' | 'chief' | 'dean'

const STAGE_BY_STATUS: Partial<Record<StatusKey, ReviewStage>> = {
  pending_advisor: 'advisor',
  pending_chief: 'chief',
  pending_dean: 'dean',
}

export const stageOfStatus = (status: StatusKey): ReviewStage | undefined => STAGE_BY_STATUS[status]

/** 申請審核:登入管理員可否簽核此狀態 */
export function canActOn(user: SessionUser | null, status: StatusKey): boolean {
  const stage = STAGE_BY_STATUS[status]
  if (!user || user.role !== 'admin' || !stage) return false
  if (stage === 'dean') return user.permissions.includes('approve_dean')
  return user.isSuper || user.permissions.includes(`approve_${stage}`)
}

/** 結案審核(輔導老師單關)可否簽核 */
export const canActOnClose = (user: SessionUser | null): boolean =>
  !!user && user.role === 'admin' && (user.isSuper || user.permissions.includes('approve_advisor'))

// ---- 查詢 ----

export interface AdminActivityListParams {
  status?: AdminActivityStatus
  clubId?: number
}

const keys = {
  all: ['adminActivities'] as const,
  list: (p: AdminActivityListParams) => ['adminActivities', 'list', p] as const,
  detail: (id: number) => ['adminActivities', 'detail', id] as const,
}

export const adminActivityKeys = keys

// 後端無排序參數(id 降冪);逐頁抓齊後由前端排序/篩選/分頁,
// 保留現有 UX(佇列送件早在前、多選標籤篩選皆非後端可表達)
async function fetchAllAdminActivities(p: AdminActivityListParams): Promise<AdminActivity[]> {
  const out: AdminActivity[] = []
  for (let page = 1; ; page++) {
    const { data, total } = await apiPaged<AdminActivityOut[]>(
      `/admin/activities${qs({ status: p.status, club_id: p.clubId, page, page_size: 100 })}`,
    )
    out.push(...data.map(toAdminActivity))
    if (data.length === 0 || out.length >= total) break
  }
  return out
}

export function useAdminActivities(p: AdminActivityListParams = {}) {
  return useQuery({
    queryKey: keys.list(p),
    queryFn: () => fetchAllAdminActivities(p),
    placeholderData: keepPreviousData,
  })
}

export function useAdminActivityDetail(id: number | undefined) {
  return useQuery({
    queryKey: keys.detail(id ?? -1),
    enabled: id != null,
    queryFn: () => api<AdminActivityDetailOut>(`/admin/activities/${id}`).then(toAdminDetail),
  })
}

// ---- 簽核 mutations ----

export interface ApproveActivityInput {
  id: number
  /** 第一關必填(有申請補助時);其後關卡免帶 */
  fundSource?: string
  budget: { itemId: number; approvedSubsidy: number }[]
  /** 大型活動認可:僅類型=活動時帶;undefined=不異動 */
  isLargeApproved?: boolean
}

export function useAdminActivityMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.all })
    void qc.invalidateQueries({ queryKey: ['adminOverview'] })
  }
  const approve = useMutation({
    mutationFn: ({ id, ...v }: ApproveActivityInput) =>
      api<AdminActivityOut>(`/admin/activities/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          fund_source: v.fundSource?.trim() || null,
          budget: v.budget.map((b) => ({ item_id: b.itemId, approved_subsidy: b.approvedSubsidy })),
          is_large_approved: v.isLargeApproved ?? null,
        }),
      }).then(toAdminActivity),
    onSuccess: invalidate,
  })
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api<null>(`/admin/activities/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: invalidate,
  })
  const closeApprove = useMutation({
    // 後端 close-approve 尚無 body:繳交確認勾選僅前端提示,未落庫(gap,待後端補)
    mutationFn: (id: number) => api<null>(`/admin/activities/${id}/close-approve`, { method: 'POST' }),
    onSuccess: invalidate,
  })
  const closeReject = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api<null>(`/admin/activities/${id}/close-reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: invalidate,
  })
  const unlock = useMutation({
    mutationFn: (id: number) => api<null>(`/admin/activities/${id}/unlock`, { method: 'POST' }),
    onSuccess: invalidate,
  })
  return { approve, reject, closeApprove, closeReject, unlock }
}

// ---- 總覽數字卡(page_size=1 只取 meta.total;多路徑加總)----

const totalOf = async (path: string): Promise<number> => (await apiPaged<unknown[]>(path)).total

function useAdminTotal(name: string, paths: string[]) {
  return useQuery({
    queryKey: ['adminOverview', name] as const,
    queryFn: async () => (await Promise.all(paths.map(totalOf))).reduce((sum, n) => sum + n, 0),
  })
}

const countPath = (base: string, status: string): string => `${base}${qs({ status, page_size: 1 })}`

/** 待審活動申請(三關合計) */
export const usePendingActivityTotal = () =>
  useAdminTotal(
    'pendingActivities',
    ['pending_advisor', 'pending_chief', 'pending_dean'].map((s) => countPath('/admin/activities', s)),
  )

/** 待審結案 */
export const usePendingCloseTotal = () =>
  useAdminTotal('pendingClose', [countPath('/admin/activities', 'closing_pending_advisor')])

/** 待審教室固定借用 */
export const usePendingRoomBookingTotal = () =>
  useAdminTotal('pendingRoomBookings', [countPath('/admin/room-bookings', 'pending')])

/** 待審臨時借用(臨時場地+器材) */
export const usePendingTempBookingTotal = () =>
  useAdminTotal('pendingTempBookings', [
    countPath('/admin/venue-bookings', 'pending'),
    countPath('/admin/equipment-loans', 'pending'),
  ])

/** 逾期未還器材(推導:結束日之隔天上班日 10:30 未歸還) */
export const useOverdueLoanTotal = () =>
  useAdminTotal('overdueLoans', [countPath('/admin/equipment-loans', 'overdue')])

/** 未銷案違規 */
export const useOpenViolationTotal = () =>
  useAdminTotal('openViolations', [countPath('/admin/violations', 'open')])

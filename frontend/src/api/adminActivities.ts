// 行政端活動審核/結案審核 API 層:snake_case ↔ camelCase 與日期(ISO ↔ YYYY/MM/DD)
// 轉換集中在此;查詢鍵集中管理,mutation 一律 invalidate 整域 + 總覽數字卡
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'
import { useInvalidateBadges } from './badges'
import { fetchAllPages } from './fetchAll'
import { fileUrl } from './activities'
import type { SessionUser } from './auth'
import type { StatusKey } from '../lib/status'

// ---- 前端型別 ----

/** 審核彈窗吃的活動形狀;三個審核頁與社團總覽的唯讀檢視共用 */
export interface ReviewItem {
  id: string // 數字主鍵字串化(String(activity.id))
  club: string
  name: string
  type: '社課或會議' | '活動'
  isLarge?: boolean // 社團申請大型活動
  largeApproved?: boolean // undefined=未處理;true=已認可;false=已否准(仍以一般活動續審)
  date: string
  requested: number
  status: StatusKey
  fundSource?: string // 第一關認定的經費來源(後端 fund_source)
  // 行政端社團總覽以社團端活動資料組出唯讀檢視,部分欄位可能缺漏(彈窗以 — 呈現)
  detail?: {
    timeRange?: string
    location?: string
    participantsIn?: number
    participantsOut?: number
    submittedAt?: string
    submittedBy?: string
    attachments: string[]
    attachmentFiles?: { id: string; name: string; url: string }[]
    budget: { id: number; category: string; description: string; selfFund: number; requested: number; approved: number }[]
  }
}

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
  /** 最近審核時間=申請/結案簽核紀錄的 max(created_at)YYYY/MM/DD HH:mm;無審核紀錄=undefined */
  reviewedAt?: string
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
  reviewed_at: string | null
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
  reviewedAt: o.reviewed_at ? slashDateTime(o.reviewed_at) : undefined,
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

/** 結案審核(承辦人單關)可否簽核:`aclose` 涵蓋核准與退回(decisions.md D-08),
 *  看得到就簽得下去 —— 後端 `_require_close_key` 認同一組鍵 */
export const canActOnClose = (user: SessionUser | null): boolean =>
  !!user &&
  user.role === 'admin' &&
  (user.isSuper || ['aclose', 'approve_advisor'].some((k) => user.permissions.includes(k)))

// ---- 查詢 ----

export interface AdminActivityListParams {
  /** 可帶多值(後端 status 多選) */
  statuses?: AdminActivityStatus[]
  clubId?: number
}

/** 伺服器端分頁查詢(14k+ 筆禁止整批撈取) */
export interface AdminActivityPageParams {
  statuses?: AdminActivityStatus[]
  clubIds?: number[]
  /** 類型標籤(社課或會議/活動/大型活動;大型為後端推導型別) */
  types?: string[]
  /** 僅逾期鎖定(已核准+超過結案期限+未解鎖;後端推導) */
  locked?: boolean
  /** 全部逾期未結案(已核准+超過結案期限,不分鎖定與否;closeLocked 區分兩者) */
  overdue?: boolean
  /** 排序白名單:club/name/type/date/status/created_at/reviewed_at;前綴 - 為降冪 */
  sort?: string
  page: number
  pageSize: number
  /** 用於「這個帳號看不到這批狀態」的情形:不送查詢,而不是送出去吃 403 */
  enabled?: boolean
}

const keys = {
  all: ['adminActivities'] as const,
  list: (p: AdminActivityListParams) => ['adminActivities', 'list', p] as const,
  paged: (p: AdminActivityPageParams) => ['adminActivities', 'paged', p] as const,
  detail: (id: number) => ['adminActivities', 'detail', id] as const,
}

export const adminActivityKeys = keys

// 僅限小結果集(待審佇列等);大清單一律走 useAdminActivitiesPaged
async function fetchAllAdminActivities(p: AdminActivityListParams): Promise<AdminActivity[]> {
  const out: AdminActivity[] = []
  out.push(
    ...(
      await fetchAllPages<AdminActivityOut>('/admin/activities', {
        status: p.statuses,
        club_id: p.clubId,
      })
    ).map(toAdminActivity),
  )
  return out
}

export function useAdminActivities(p: AdminActivityListParams = {}, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.list(p),
    queryFn: () => fetchAllAdminActivities(p),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  })
}

export function useAdminActivitiesPaged(p: AdminActivityPageParams) {
  return useQuery({
    queryKey: keys.paged(p),
    enabled: p.enabled ?? true,
    queryFn: () =>
      apiPaged<AdminActivityOut[]>(
        `/admin/activities${qs({
          status: p.statuses,
          club_id: p.clubIds?.map(String),
          type: p.types,
          locked: p.locked ? true : undefined,
          overdue: p.overdue ? true : undefined,
          sort: p.sort,
          page: p.page,
          page_size: p.pageSize,
        })}`,
      ).then(({ data, total }) => ({ rows: data.map(toAdminActivity), total })),
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
  const invalidateBadges = useInvalidateBadges()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.all })
    invalidateBadges()
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
    // 繳交確認落庫:未確認之項目評鑑以 0 分計(後端 scoring 讀取)
    mutationFn: ({
      id,
      photosConfirmed,
      reportConfirmed,
      reflectionsConfirmed,
    }: {
      id: number
      photosConfirmed: boolean
      reportConfirmed: boolean
      reflectionsConfirmed: boolean
    }) =>
      api<null>(`/admin/activities/${id}/close-approve`, {
        method: 'POST',
        body: JSON.stringify({
          photos_confirmed: photosConfirmed,
          report_confirmed: reportConfirmed,
          reflections_confirmed: reflectionsConfirmed,
        }),
      }),
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

// ---- 未銷案違規數(違規管理頁的標題數字;側欄徽章與總覽卡走 GET /badges)----

const countPath = (base: string, status: string): string => `${base}${qs({ status, page_size: 1 })}`

export const useOpenViolationTotal = (enabled = true) =>
  useQuery({
    queryKey: ['adminOverview', 'openViolations'] as const,
    queryFn: async () => (await apiPaged<unknown[]>(countPath('/admin/violations', 'open'))).total,
    enabled,
  })

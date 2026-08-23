// 活動申請/結案 API 層:snake_case ↔ camelCase 轉換集中在此,頁面只碰 camelCase 型別;
// 日期後端 ISO(YYYY-MM-DD / datetime)↔ 前端顯示 YYYY/MM/DD、時間 HH:mm;
// 查詢鍵集中管理,mutation 一律 invalidate 整域
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { API_BASE, api, apiPaged, qs } from './client'
import { useInvalidateBadges } from './badges'
import { fetchAllPages } from './fetchAll'
import type { StatusKey } from '../lib/status'
import { fileTypeOf, type EvalFile, type EvalFileType } from '../features/eval/types'
import { staffTextToWorks } from '../features/activities/types'
import type { ActivityReport, BudgetItem, Reflection, WorkItem } from '../features/activities/types'

export type ActivityType = '社課或會議' | '活動'

export interface ClubActivity {
  id: number
  name: string
  type: ActivityType
  isLarge: boolean
  largeApproved?: boolean // 管理員認可後行政分才享大型 ×3 加權
  date?: string // YYYY/MM/DD(開始日期);草稿可部分填寫,僅草稿可能缺
  endDate?: string // YYYY/MM/DD(未跨日 = date)
  timeRange?: string // 'HH:mm–HH:mm'
  location: string
  content: string
  participantsIn: number
  participantsOut: number
  works: WorkItem[]
  status: StatusKey // approved+close_locked 映射為 'locked'(前端顯示鍵)
  semester: string
  selfFundTotal: number
  requestedTotal: number
  approvedTotal?: number
  closeLocked: boolean
  canClose: boolean
  hasCloseDraft: boolean
}

export interface ActivityRejectReason {
  by: string
  date: string
  text: string
}

export interface ClubActivityDetail extends ClubActivity {
  budget: BudgetItem[]
  closeDraft?: Partial<ActivityReport> // 前端自訂 JSON 形狀(後端 close_draft 為 opaque dict)
  report?: ActivityReport
  photos: EvalFile[]
  attachments: EvalFile[]
  rejectReason?: ActivityRejectReason
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
  sha256: string
}

interface ReflectionOut {
  id: number
  student_name: string
  dept: string
  body: string
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
  reflections: ReflectionOut[]
}

interface ApprovalOut {
  stage: string
  decision: string
  reason: string | null
  created_at: string
}

export interface ActivityOut {
  id: number
  club_id: number
  created_at: string
  name: string
  type: ActivityType
  is_large: boolean
  is_large_approved: boolean | null
  date: string | null // 僅草稿可能為 null(部分填寫)
  end_date: string | null
  start_time: string | null
  end_time: string | null
  location: string
  content: string
  participants_in: number
  participants_out: number
  staff_text: string
  status: string
  self_fund_total: number
  requested_total: number
  approved_total: number | null
  semester: string
  close_locked: boolean
  can_close: boolean
  has_close_draft: boolean
}

export interface ActivityDetailOut extends ActivityOut {
  budget_items: BudgetItemOut[]
  close_draft: Record<string, unknown> | null
  report: ReportOut | null
  photos: FileOut[]
  attachments: FileOut[]
  approvals: ApprovalOut[]
}

// ---- 轉換 ----

const slashDate = (iso: string): string => dayjs(iso).format('YYYY/MM/DD')
const isoDate = (slash: string): string => dayjs(slash, 'YYYY/MM/DD').format('YYYY-MM-DD')
const hm = (t: string): string => t.slice(0, 5) // 'HH:MM:SS' → 'HH:MM'

// 工作分配 ↔ staff_text:每列「項目:負責人」一行(後端僅存文字,格式為前端約定)
const worksToStaffText = (works: WorkItem[]): string =>
  works.map((w) => `${w.task}:${w.owner}`).join('\n')


// 逾期鎖定為推導狀態:已核准且 close_locked 時以前端顯示鍵 'locked' 呈現
const toStatusKey = (o: ActivityOut): StatusKey =>
  o.status === 'approved' && o.close_locked ? 'locked' : (o.status as StatusKey)

export const toActivity = (o: ActivityOut): ClubActivity => ({
  id: o.id,
  name: o.name,
  type: o.type,
  isLarge: o.is_large,
  largeApproved: o.is_large_approved ?? undefined,
  date: o.date ? slashDate(o.date) : undefined,
  endDate: o.end_date ? slashDate(o.end_date) : undefined,
  timeRange: o.start_time && o.end_time ? `${hm(o.start_time)}–${hm(o.end_time)}` : undefined,
  location: o.location,
  content: o.content,
  participantsIn: o.participants_in,
  participantsOut: o.participants_out,
  works: staffTextToWorks(o.staff_text),
  status: toStatusKey(o),
  semester: o.semester,
  selfFundTotal: o.self_fund_total,
  requestedTotal: o.requested_total,
  approvedTotal: o.approved_total ?? undefined,
  closeLocked: o.close_locked,
  canClose: o.can_close,
  hasCloseDraft: o.has_close_draft,
})

const typeFromMime = (mime: string, name: string): EvalFileType => {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.includes('msword') || mime.includes('wordprocessingml')) return 'doc'
  return fileTypeOf(name)
}

export const fileUrl = (fileId: string): string => `${API_BASE}/files/${fileId}`

const toFile = (f: FileOut): EvalFile => ({
  id: f.id,
  name: f.original_name,
  type: typeFromMime(f.mime, f.original_name),
  size: f.size,
  url: fileUrl(f.id),
  hash: f.sha256, // 既有照片與新選檔的內容去重
  uploadedAt: '—', // 後端 FileOut 不含時間戳
})

const toReport = (r: ReportOut): ActivityReport => ({
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
  videoLink: r.video_url ?? undefined,
  expense: r.expense,
  reflections: r.reflections.map((x) => ({ name: x.student_name, dept: x.dept, text: x.body })),
  submittedAt: slashDate(r.submitted_at),
})

// close_draft 是 opaque JSON,可能被舊版或直接 API 寫成非預期形狀:
// 逐欄驗型別、不符即丟棄(hydrate 時走各欄 fallback),避免壞草稿讓結案頁整頁崩潰
const asStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const asNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
const toCloseDraft = (raw: Record<string, unknown> | null): Partial<ActivityReport> | undefined => {
  if (!raw) return undefined
  return {
    memberCount: asNum(raw.memberCount),
    nonMemberCount: asNum(raw.nonMemberCount),
    actualStart: asStr(raw.actualStart),
    actualEnd: asStr(raw.actualEnd),
    actualLocation: asStr(raw.actualLocation),
    highlights: asStr(raw.highlights),
    goals: asStr(raw.goals),
    others: asStr(raw.others),
    reviewMeeting: typeof raw.reviewMeeting === 'boolean' ? raw.reviewMeeting : undefined,
    reviewDate: asStr(raw.reviewDate),
    reviewAttendees: asNum(raw.reviewAttendees),
    reviewTopics: asStr(raw.reviewTopics),
    reviewConclusion: asStr(raw.reviewConclusion),
    videoLink: asStr(raw.videoLink),
    expense: asNum(raw.expense),
    reflections: Array.isArray(raw.reflections)
      ? raw.reflections.map((x) => {
          const o = (x ?? {}) as Record<string, unknown>
          return { name: asStr(o.name) ?? '', dept: asStr(o.dept) ?? '', text: asStr(o.text) ?? '' }
        })
      : undefined,
  }
}

// 簽核關卡顯示詞(社團端不顯示個人姓名,僅關卡;
// 第一關顯示「承辦人」,程式鍵 advisor 不變)
const STAGE_LABEL: Record<string, string> = {
  advisor: '承辦人',
  chief: '課外組組長',
  dean: '學務長',
}

export const toDetail = (o: ActivityDetailOut): ClubActivityDetail => {
  const lastReject = [...o.approvals].reverse().find((x) => x.decision === 'reject')
  return {
    ...toActivity(o),
    budget: o.budget_items.map((b) => ({
      id: b.id,
      category: b.category,
      description: b.description,
      selfFund: b.self_fund,
      requestedSubsidy: b.requested_subsidy,
      approvedSubsidy: b.approved_subsidy,
    })),
    closeDraft: toCloseDraft(o.close_draft),
    report: o.report ? toReport(o.report) : undefined,
    photos: o.photos.map(toFile),
    attachments: o.attachments.map(toFile),
    rejectReason:
      o.status === 'rejected' && lastReject
        ? {
            by: STAGE_LABEL[lastReject.stage] ?? lastReject.stage,
            date: slashDate(lastReject.created_at),
            text: lastReject.reason ?? '',
          }
        : undefined,
  }
}

// 成果報告/心得 PDF:後端於下載時動態生成(inline),包成 EvalFile 供 FileChip 預覽/下載。
// base 決定走哪一端的端點:社團端那兩支由 session 認社團,承辦讀別社時要走 admin 版
export type PdfBase = 'club' | 'admin'

const pdfPath = (base: PdfBase, id: number, kind: string): string =>
  `${API_BASE}/${base === 'admin' ? 'admin' : 'club'}/activities/${id}/${kind}`

export const activityReportPdf = (
  a: Pick<ClubActivity, 'id' | 'name'>,
  submittedAt?: string,
  base: PdfBase = 'club',
): EvalFile => ({
  id: `report-pdf-${a.id}`,
  name: `${a.name}_成果報告表.pdf`,
  type: 'pdf',
  size: 0,
  url: pdfPath(base, a.id, 'report-pdf'),
  uploadedAt: submittedAt ?? '—',
})

export const activityReflectionsPdf = (
  a: Pick<ClubActivity, 'id' | 'name'>,
  submittedAt?: string,
  base: PdfBase = 'club',
): EvalFile => ({
  id: `reflections-pdf-${a.id}`,
  name: `${a.name}_學習心得.pdf`,
  type: 'pdf',
  size: 0,
  url: pdfPath(base, a.id, 'reflections-pdf'),
  uploadedAt: submittedAt ?? '—',
})

// ---- 查詢 ----

export interface ActivityListParams {
  semester?: string
  /** 可多值(後端 status 收多值) */
  statuses?: string[]
  /** 類型多選(後端 type 收多值) */
  types?: string[]
  /** 排序白名單:name/type/date/budget/status/created_at;前綴 - 為降冪 */
  sort?: string
  page: number
  pageSize: number
}

const keys = {
  all: ['activities'] as const,
  list: (p: ActivityListParams) => ['activities', 'list', p] as const,
  drafts: ['activities', 'drafts'] as const,
  approved: ['activities', 'approved'] as const,
  closable: ['activities', 'closable'] as const,
  detail: (id: number) => ['activities', 'detail', id] as const,
  semesters: ['activities', 'semesters'] as const,
}

export const activityKeys = keys

export const ACTIVITY_PAGE_SIZE = 20

/** 活動列表:篩選、排序、分頁全在後端(經費排序=自籌+擬請補助合計) */
export function useActivityList(params: ActivityListParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () =>
      apiPaged<ActivityOut[]>(
        `/club/activities${qs({
          semester: params.semester,
          status: params.statuses,
          type: params.types,
          sort: params.sort,
          page: params.page,
          page_size: params.pageSize,
        })}`,
      ).then(({ data, total }) => ({ rows: data.map(toActivity), total })),
    // 沿用上一份,換頁/換條件時才不會整表閃成「本學期尚無活動」、分頁器閃成「2 / 1」;
    // 呼叫端以 isPlaceholderData 淡化舊資料,空狀態則等 isFetching 結束才顯示
    placeholderData: keepPreviousData,
  })
}

/** 草稿:量少且排序特殊(未填日期的最需要補,排在最前),整批抓回前端自排 */
export function useDraftActivities() {
  return useQuery({
    queryKey: keys.drafts,
    queryFn: () =>
      fetchAllPages<ActivityOut>('/club/activities', { status: 'draft' }).then((rows) =>
        rows.map(toActivity),
      ),
  })
}

/** 已核准且尚未結束的活動:借用綁定的下拉選項來源(已結束的借不了,由後端篩) */
export function useApprovedActivities() {
  return useQuery({
    queryKey: keys.approved,
    queryFn: () =>
      fetchAllPages<ActivityOut>('/club/activities', {
        status: 'approved',
        ended: false,
      }).then((rows) => rows.map(toActivity)),
  })
}

/** 可結案活動:資格(已核准、已結束、未鎖定)由後端判定,前端不再抓全部已核准再篩 */
export function useClosableActivities() {
  return useQuery({
    queryKey: keys.closable,
    queryFn: () =>
      fetchAllPages<ActivityOut>('/club/activities', { closable: true }).then((rows) =>
        rows.map(toActivity),
      ),
  })
}

export function useActivitySemesters() {
  return useQuery({
    queryKey: keys.semesters,
    queryFn: () => api<string[]>('/club/activities/semesters'),
  })
}

export function useActivityDetail(id: number | undefined) {
  return useQuery({
    queryKey: keys.detail(id ?? -1),
    enabled: id != null,
    queryFn: () => api<ActivityDetailOut>(`/club/activities/${id}`).then(toDetail),
  })
}

export function useInvalidateActivities() {
  const qc = useQueryClient()
  const invalidateBadges = useInvalidateBadges()
  return () => {
    void qc.invalidateQueries({ queryKey: keys.all })
    invalidateBadges()
  }
}

// ---- 申請(建立/更新/送出/刪除)----

export interface ActivityBudgetInput {
  category: string
  description: string
  selfFund: number
  requestedSubsidy: number
}

/** 草稿允許部分填寫:日期/時間/人數可缺(送審時後端檢核必填) */
export interface ActivityInput {
  name: string
  type: ActivityType
  isLarge: boolean
  date?: string // YYYY/MM/DD
  endDate?: string
  startTime?: string // HH:mm
  endTime?: string
  location: string
  content: string
  participantsIn?: number
  participantsOut?: number
  works: WorkItem[]
  budget: ActivityBudgetInput[]
}

const toActivityBody = (v: ActivityInput): string =>
  JSON.stringify({
    name: v.name,
    type: v.type,
    is_large: v.isLarge,
    date: v.date ? isoDate(v.date) : null,
    end_date: v.endDate ? isoDate(v.endDate) : null,
    start_time: v.startTime ?? null,
    end_time: v.endTime ?? null,
    location: v.location,
    content: v.content,
    participants_in: v.participantsIn ?? 0,
    participants_out: v.participantsOut ?? 0,
    staff_text: worksToStaffText(v.works),
    budget_items: v.budget.map((b) => ({
      category: b.category,
      description: b.description,
      self_fund: b.selfFund,
      requested_subsidy: b.requestedSubsidy,
    })),
  })

export const createActivity = (v: ActivityInput): Promise<ClubActivity> =>
  api<ActivityOut>('/club/activities', { method: 'POST', body: toActivityBody(v) }).then(toActivity)

export const updateActivity = (id: number, v: ActivityInput): Promise<ClubActivity> =>
  api<ActivityOut>(`/club/activities/${id}`, { method: 'PUT', body: toActivityBody(v) }).then(toActivity)

export const submitActivity = (id: number): Promise<ClubActivity> =>
  api<ActivityOut>(`/club/activities/${id}/submit`, { method: 'POST' }).then(toActivity)

// 列表頁動作(送出/刪除草稿)
export function useActivityMutations() {
  const qc = useQueryClient()
  const invalidateBadges = useInvalidateBadges()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.all })
    invalidateBadges()
  }
  const submit = useMutation({ mutationFn: submitActivity, onSuccess: invalidate })
  const remove = useMutation({
    mutationFn: (id: number) => api<null>(`/club/activities/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  return { submit, remove }
}

// ---- 檔案(申請附件/結案照片;上傳走 FormData,client.ts 已處理 boundary 與 CSRF)----

const uploadFile = (path: string, file: File): Promise<EvalFile> => {
  const fd = new FormData()
  fd.append('file', file)
  return api<FileOut>(path, { method: 'POST', body: fd }).then(toFile)
}

export const uploadActivityAttachment = (id: number, file: File): Promise<EvalFile> =>
  uploadFile(`/club/activities/${id}/attachments`, file)

export const deleteActivityAttachment = (id: number, fileId: string): Promise<null> =>
  api<null>(`/club/activities/${id}/attachments/${fileId}`, { method: 'DELETE' })

export const uploadActivityPhoto = (id: number, file: File): Promise<EvalFile> =>
  uploadFile(`/club/activities/${id}/photos`, file)

export const deleteActivityPhoto = (id: number, fileId: string): Promise<null> =>
  api<null>(`/club/activities/${id}/photos/${fileId}`, { method: 'DELETE' })

// ---- 結案(草稿/送出)----

export const saveCloseDraft = (id: number, data: Partial<ActivityReport>): Promise<null> =>
  api<null>(`/club/activities/${id}/close-draft`, { method: 'PUT', body: JSON.stringify({ data }) })

export interface CloseSubmitInput {
  memberCount: number
  nonMemberCount: number
  actualStart: string // HH:mm
  actualEnd: string
  actualLocation: string
  highlights: string
  goals: string
  others: string
  reviewMeeting: boolean
  reviewDate?: string // YYYY/MM/DD(檢討會=是 時必填)
  reviewAttendees?: number
  reviewTopics?: string
  reviewConclusion?: string
  videoLink?: string
  expense: number
  reflections: Reflection[]
}

export const submitClose = (id: number, v: CloseSubmitInput): Promise<ClubActivity> =>
  api<ActivityOut>(`/club/activities/${id}/close`, {
    method: 'POST',
    body: JSON.stringify({
      member_count: v.memberCount,
      non_member_count: v.nonMemberCount,
      actual_start: v.actualStart,
      actual_end: v.actualEnd,
      actual_location: v.actualLocation,
      highlights: v.highlights,
      goals: v.goals,
      others: v.others,
      review_meeting: v.reviewMeeting,
      review_date: v.reviewMeeting && v.reviewDate ? isoDate(v.reviewDate) : null,
      review_attendees: v.reviewMeeting ? (v.reviewAttendees ?? null) : null,
      review_topics: v.reviewMeeting ? (v.reviewTopics ?? null) : null,
      review_conclusion: v.reviewMeeting ? (v.reviewConclusion ?? null) : null,
      video_url: v.videoLink?.trim() || null,
      expense: v.expense,
      reflections: v.reflections.map((r) => ({ student_name: r.name, dept: r.dept, body: r.text })),
    }),
  }).then(toActivity)

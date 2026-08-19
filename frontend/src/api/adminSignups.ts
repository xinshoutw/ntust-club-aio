// 行政端報名管理 API 層(權限鍵 asignup)。
// - 基本欄位(姓名/學號/系級)必須包含在 signup_items.fields:後端 validate_answers 會拒絕
//   answers 內的未知欄位鍵,而社團端送出的參加人資料含 name/studentId/dept,
//   故建立活動時一律把 BASE_FIELDS 前置到自訂欄位前;管理端顯示/匯出時再把它們與自訂欄位分開。
// - 簽到:PUT /{id}/attendance {club_id, attended, session_id?};非場次制免帶 session_id
//   (後端自動建立/沿用單一預設場次);場次制(負責人會議)session_id 必填,
//   場次由 GET/POST/DELETE /{id}/sessions 管理(建立僅場次制可用,非場次制 409)。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'
import { FIELD_TYPE_LABEL, type FieldType, type SignupField, type SignupKind } from '../features/signup/types'

const DATETIME_FMT = 'YYYY/MM/DD HH:mm'

/** 報名表單固定的基本欄位(兩端 UI 均獨立呈現,不列入「資訊調查」自訂欄位) */
export const BASE_FIELDS: SignupField[] = [
  { key: 'name', label: '姓名', type: 'text', required: true },
  { key: 'studentId', label: '學號', type: 'text', required: true },
  { key: 'dept', label: '系級', type: 'text', required: true },
]
const BASE_KEYS = new Set(BASE_FIELDS.map((f) => f.key))

export interface AdminSignupItem {
  id: number
  name: string
  kind: SignupKind
  status: 'open' | 'ended' // 推導:報名窗內=open
  deadline: string // 報名截止 YYYY/MM/DD(未設=—)
  maxParticipants: number
  clubsCount: number
  peopleCount: number
  pendingCount: number // 審核制:待確認的報名社團數
  sessionBased: boolean
  isEval: boolean // 競賽報名:名單帶參賽獎項
  eventAt?: string // 活動時間 YYYY/MM/DD HH:mm
  eventEnded: boolean // 活動日已過(可登錄簽到;後端以場次/活動日檢核)
  fields: SignupField[] // 自訂欄位(已排除基本欄位)
  // 以下供編輯彈窗回填(decisions.md D-09)
  place?: string
  description: string
  signupStart: string // YYYY/MM/DD HH:mm
  signupEnd?: string // YYYY/MM/DD HH:mm(deadline 是只到日的顯示版)
  requiresConfirmation: boolean
  isOpen: boolean
}

interface SignupFieldOut {
  key: string
  label: string
  type: string
  required?: boolean
  options?: string[]
}

interface AdminSignupItemOut {
  id: number
  name: string
  kind: SignupKind
  event_at: string | null
  signup_end: string | null
  max_participants: number
  session_based: boolean
  is_eval: boolean
  accepting: boolean
  place: string | null
  description: string
  signup_start: string
  requires_confirmation: boolean
  is_open: boolean
  clubs_count: number
  people_count: number
  pending_count: number
  fields: SignupFieldOut[]
}

const toField = (f: SignupFieldOut): SignupField => ({
  key: f.key,
  label: f.label,
  type: (f.type in FIELD_TYPE_LABEL ? f.type : 'text') as FieldType,
  required: !!f.required,
  options: f.options,
})

const toItem = (s: AdminSignupItemOut): AdminSignupItem => ({
  id: s.id,
  name: s.name,
  kind: s.kind,
  status: s.accepting ? 'open' : 'ended',
  deadline: s.signup_end ? dayjs(s.signup_end).format('YYYY/MM/DD') : '—',
  maxParticipants: s.max_participants,
  clubsCount: s.clubs_count,
  peopleCount: s.people_count,
  pendingCount: s.pending_count,
  sessionBased: s.session_based,
  isEval: s.is_eval,
  eventAt: s.event_at ? dayjs(s.event_at).format(DATETIME_FMT) : undefined,
  eventEnded: !s.event_at || !dayjs(s.event_at).isAfter(dayjs(), 'day'),
  fields: s.fields.filter((f) => !BASE_KEYS.has(f.key)).map(toField),
  place: s.place ?? undefined,
  description: s.description,
  signupStart: dayjs(s.signup_start).format(DATETIME_FMT),
  signupEnd: s.signup_end ? dayjs(s.signup_end).format(DATETIME_FMT) : undefined,
  requiresConfirmation: s.requires_confirmation,
  isOpen: s.is_open,
})

// ---- 報名名單(單活動管理彈窗) ----

export interface Registration {
  clubId: number
  club: string
  count: number
  confirmed: boolean
  attendedSessions: number
  participants: Record<string, unknown>[] // 每人填答:{name, studentId, dept, ...自訂欄位}
  awards: string[] // 競賽報名勾選的獎項名;非競賽報名為空
}

interface RegistrationOut {
  club_id: number
  club_name: string
  count: number
  confirmed: boolean
  created_at: string
  attended_sessions: number
  entries: { id: number; answers: Record<string, unknown> }[]
  awards: string[]
}

const toRegistration = (r: RegistrationOut): Registration => ({
  clubId: r.club_id,
  club: r.club_name,
  count: r.count,
  confirmed: r.confirmed,
  attendedSessions: r.attended_sessions,
  participants: r.entries.map((e) => e.answers),
  awards: r.awards ?? [],
})

// ---- 場次(負責人會議等場次制活動的逐場簽到) ----

export interface SessionAttendance {
  clubId: number
  attended: boolean
}

export interface SignupSession {
  id: number
  name: string
  date: string // YYYY/MM/DD
  semester: string
  attendance: SessionAttendance[] // 已登錄過簽到的社團(未登錄者不在列)
}

interface SessionOut {
  id: number
  name: string
  date: string // ISO date
  semester: string
  attendance: { club_id: number; attended: boolean }[]
}

const toSession = (s: SessionOut): SignupSession => ({
  id: s.id,
  name: s.name,
  date: dayjs(s.date).format('YYYY/MM/DD'),
  semester: s.semester,
  attendance: s.attendance.map((a) => ({ clubId: a.club_id, attended: a.attended })),
})

const keys = {
  all: ['adminSignups'] as const,
  list: (page: number) => ['adminSignups', 'list', page] as const,
  openTotal: ['adminSignups', 'openTotal'] as const,
  registrations: (itemId: number) => ['adminSignups', 'registrations', itemId] as const,
  sessions: (itemId: number) => ['adminSignups', 'sessions', itemId] as const,
}

export const SIGNUP_PAGE_SIZE = 20

/** 伺服器端分頁(排序由後端固定為新→舊) */
export function useAdminSignupItems(page: number) {
  return useQuery({
    queryKey: keys.list(page),
    queryFn: () =>
      apiPaged<AdminSignupItemOut[]>(
        `/admin/signup-items${qs({ page, page_size: SIGNUP_PAGE_SIZE })}`,
      ).then(({ data, total }) => ({ rows: data.map(toItem), total })),
  })
}

/** 開放中件數(報名窗判定在後端;page_size=1 只取 meta.total) */
export function useOpenSignupTotal() {
  return useQuery({
    queryKey: keys.openTotal,
    queryFn: async () =>
      (await apiPaged<unknown[]>(`/admin/signup-items${qs({ accepting: true, page_size: 1 })}`))
        .total,
  })
}

export function useRegistrations(itemId: number | undefined) {
  return useQuery({
    queryKey: keys.registrations(itemId ?? 0),
    queryFn: () =>
      api<RegistrationOut[]>(`/admin/signup-items/${itemId}/registrations`).then((rows) =>
        rows.map(toRegistration),
      ),
    enabled: itemId != null,
  })
}

/** 場次清單(含各場已登錄的簽到狀態);非場次制項目傳 undefined 即不發查詢 */
export function useSessions(itemId: number | undefined) {
  return useQuery({
    queryKey: keys.sessions(itemId ?? 0),
    queryFn: () =>
      api<SessionOut[]>(`/admin/signup-items/${itemId}/sessions`).then((rows) => rows.map(toSession)),
    enabled: itemId != null,
  })
}

// ---- 建立報名活動(SignupBuilder) ----

export interface SignupFieldInput {
  label: string
  type: FieldType
  required: boolean
  options: string[]
}

export interface SignupItemInput {
  name: string
  kind: SignupKind
  place?: string
  description: string
  eventAt: string // YYYY/MM/DD HH:mm(當地=台北時間;後端以台北時間解讀無時區輸入)
  signupStart: string
  signupEnd: string
  maxParticipants: number
  requiresConfirmation: boolean
  isEval: boolean // 競賽報名:社團送出時須勾選至少一個獎項
  fields: SignupFieldInput[] // 陣列順序=顯示順序(拖曳排序後整包送)
}

/** 編輯活動:只帶要改的欄位(decisions.md D-09) */
export interface SignupItemPatch {
  name?: string
  /** null = 清空地點(唯一可以清空的欄位);undefined = 不動 */
  place?: string | null
  description?: string
  eventAt?: string // YYYY/MM/DD HH:mm
  signupEnd?: string // YYYY/MM/DD HH:mm
  maxParticipants?: number
  requiresConfirmation?: boolean
  isOpen?: boolean
}

const toNaiveIso = (display: string): string =>
  dayjs(display, DATETIME_FMT).format('YYYY-MM-DDTHH:mm:ss')

export function useSignupItemMutations() {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: keys.all })
  const create = useMutation({
    mutationFn: (b: SignupItemInput) =>
      api<AdminSignupItemOut>('/admin/signup-items', {
        method: 'POST',
        body: JSON.stringify({
          name: b.name,
          kind: b.kind,
          place: b.place || undefined,
          description: b.description,
          event_at: toNaiveIso(b.eventAt),
          signup_start: toNaiveIso(b.signupStart),
          signup_end: toNaiveIso(b.signupEnd),
          max_participants: b.maxParticipants,
          requires_confirmation: b.requiresConfirmation,
          is_eval: b.isEval,
          // 基本欄位前置(見檔頭);自訂欄位不帶 key,由後端依序補 f1、f2…
          fields: [
            ...BASE_FIELDS.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required })),
            ...b.fields.map((f) => ({ label: f.label, type: f.type, required: f.required, options: f.options })),
          ],
        }),
      }),
    onSuccess: invalidate,
  })
  // 修改已建立的活動(decisions.md D-09):只送有動到的欄位,**後端不發通知**
  const update = useMutation({
    mutationFn: ({ itemId, patch }: { itemId: number; patch: SignupItemPatch }) =>
      api<AdminSignupItemOut>(`/admin/signup-items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: patch.name,
          place: patch.place,
          description: patch.description,
          event_at: patch.eventAt ? toNaiveIso(patch.eventAt) : undefined,
          signup_end: patch.signupEnd ? toNaiveIso(patch.signupEnd) : undefined,
          max_participants: patch.maxParticipants,
          requires_confirmation: patch.requiresConfirmation,
          is_open: patch.isOpen,
        }),
      }),
    onSuccess: invalidate,
  })
  // 補登實際到場但沒線上報名的社團(decisions.md DEC-07)
  const addRegistration = useMutation({
    mutationFn: ({ itemId, clubId }: { itemId: number; clubId: number }) =>
      api<null>(`/admin/signup-items/${itemId}/registrations`, {
        method: 'POST',
        body: JSON.stringify({ club_id: clubId }),
      }),
    onSuccess: invalidate,
  })
  /** 撤除補登:選錯社團時的回頭路(只撤得掉沒有名單、沒簽到的補登單) */
  const removeRegistration = useMutation({
    mutationFn: ({ itemId, clubId }: { itemId: number; clubId: number }) =>
      api<null>(`/admin/signup-items/${itemId}/registrations/${clubId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  const confirm = useMutation({
    mutationFn: ({ itemId, clubId }: { itemId: number; clubId: number }) =>
      api<null>(`/admin/signup-items/${itemId}/registrations/${clubId}/confirm`, { method: 'PUT' }),
    onSuccess: invalidate,
  })
  const markAttendance = useMutation({
    mutationFn: ({ itemId, clubId, attended, sessionId }: { itemId: number; clubId: number; attended: boolean; sessionId?: number }) =>
      api<{ session_id: number; attended_sessions: number }>(`/admin/signup-items/${itemId}/attendance`, {
        method: 'PUT',
        body: JSON.stringify({ club_id: clubId, attended, session_id: sessionId }),
      }),
    onSuccess: invalidate,
  })
  // 場次增刪:出席場次數(registrations.attended_sessions)隨場次/簽到變動,一併失效
  const invalidateSessions = (itemId: number) => {
    void qc.invalidateQueries({ queryKey: keys.sessions(itemId) })
    void qc.invalidateQueries({ queryKey: keys.registrations(itemId) })
  }
  const createSession = useMutation({
    mutationFn: ({ itemId, name, date }: { itemId: number; name: string; date: string /* YYYY/MM/DD */ }) =>
      api<SessionOut>(`/admin/signup-items/${itemId}/sessions`, {
        method: 'POST',
        body: JSON.stringify({ name, date: dayjs(date, 'YYYY/MM/DD').format('YYYY-MM-DD') }),
      }),
    onSuccess: (_, { itemId }) => invalidateSessions(itemId),
  })
  const deleteSession = useMutation({
    mutationFn: ({ itemId, sessionId }: { itemId: number; sessionId: number }) =>
      api<null>(`/admin/signup-items/${itemId}/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: (_, { itemId }) => invalidateSessions(itemId),
  })
  return { create, update, addRegistration, removeRegistration, confirm, markAttendance, createSession, deleteSession }
}

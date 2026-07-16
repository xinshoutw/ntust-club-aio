// 行政端報名管理 API 層(權限鍵 asignup/areg)。
// - 基本欄位(姓名/學號/系級)必須包含在 signup_items.fields:後端 validate_answers 會拒絕
//   answers 內的未知欄位鍵,而社團端送出的參加人資料含 name/studentId/dept,
//   故建立活動時一律把 BASE_FIELDS 前置到自訂欄位前;管理端顯示/匯出時再把它們與自訂欄位分開。
// - 簽到:PUT /{id}/attendance {club_id, attended, session_id?};非場次制免帶 session_id
//   (後端自動建立/沿用單一預設場次);場次制(負責人會議)session_id 必填,
//   但後端目前未提供場次列表/建立 API,前端暫無法取得場次 id(見頁面停用說明)。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api } from './client'
import { fetchAllPages } from './fetchAll'
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
  eventAt?: string // 活動時間 YYYY/MM/DD HH:mm
  eventEnded: boolean // 活動日已過(可登錄簽到;後端以場次/活動日檢核)
  fields: SignupField[] // 自訂欄位(已排除基本欄位)
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
  accepting: boolean
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
  eventAt: s.event_at ? dayjs(s.event_at).format(DATETIME_FMT) : undefined,
  eventEnded: !s.event_at || !dayjs(s.event_at).isAfter(dayjs(), 'day'),
  fields: s.fields.filter((f) => !BASE_KEYS.has(f.key)).map(toField),
})

// ---- 報名名單(單活動管理彈窗) ----

export interface Registration {
  clubId: number
  club: string
  count: number
  confirmed: boolean
  attendedSessions: number
  participants: Record<string, unknown>[] // 每人填答:{name, studentId, dept, ...自訂欄位}
}

interface RegistrationOut {
  club_id: number
  club_name: string
  count: number
  confirmed: boolean
  created_at: string
  attended_sessions: number
  entries: { id: number; answers: Record<string, unknown> }[]
}

const toRegistration = (r: RegistrationOut): Registration => ({
  clubId: r.club_id,
  club: r.club_name,
  count: r.count,
  confirmed: r.confirmed,
  attendedSessions: r.attended_sessions,
  participants: r.entries.map((e) => e.answers),
})

const keys = {
  all: ['adminSignups'] as const,
  list: ['adminSignups', 'list'] as const,
  registrations: (itemId: number) => ['adminSignups', 'registrations', itemId] as const,
}

export function useAdminSignupItems() {
  return useQuery({
    queryKey: keys.list,
    queryFn: () =>
      fetchAllPages<AdminSignupItemOut>('/admin/signup-items').then((rows) => rows.map(toItem)),
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
  fields: SignupFieldInput[] // 陣列順序=顯示順序(拖曳排序後整包送)
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
          // 基本欄位前置(見檔頭);自訂欄位不帶 key,由後端依序補 f1、f2…
          fields: [
            ...BASE_FIELDS.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required })),
            ...b.fields.map((f) => ({ label: f.label, type: f.type, required: f.required, options: f.options })),
          ],
        }),
      }),
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
  return { create, confirm, markAttendance }
}

// 線上報名 API 層:snake_case ↔ camelCase 與日期時間(後端 ISO ↔ 顯示 YYYY/MM/DD HH:mm)轉換集中在此。
// 報名 datetime 後端以台北時間解讀(無時區輸入);顯示端 dayjs 依瀏覽器時區,本系統僅供台灣使用。
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'
import { FIELD_TYPE_LABEL, type FieldType, type SignupField, type SignupKind } from '../features/signup/types'

export type MyStatus = 'none' | 'draft' | 'pending' | 'signed'

/** 一位參加人的填答:{欄位 key: 值};checkbox 值為選項陣列 */
export type Participant = Record<string, unknown>

export interface SignupItem {
  id: number
  name: string
  description: string
  kind: SignupKind
  eventAt?: string
  place?: string
  /** 報名截止(signup_end);未設定=無期限 */
  deadline?: string
  maxParticipants: number
  requiresConfirmation: boolean
  isEval: boolean
  /** 推導:開放中且在報名窗內 */
  accepting: boolean
  myStatus: MyStatus
  fields: SignupField[]
}

export interface MySignup {
  confirmed: boolean
  submittedAt: string
  participants: Participant[]
}

export interface SignupItemDetail extends SignupItem {
  mySignup?: MySignup
  myDraft?: Participant[]
}

interface SignupFieldOut {
  key: string
  label: string
  type: string
  required?: boolean
  options?: string[]
}

interface SignupItemOut {
  id: number
  name: string
  description: string
  kind: SignupKind
  event_at: string | null
  place: string | null
  signup_end: string | null
  max_participants: number
  requires_confirmation: boolean
  is_eval: boolean
  accepting: boolean
  my_status: MyStatus
  fields: SignupFieldOut[]
}

interface SignupItemDetailOut extends SignupItemOut {
  my_signup: {
    confirmed: boolean
    created_at: string
    entries: { id: number; answers: Participant }[]
  } | null
  my_draft: Participant[] | null
}

const DATETIME_FMT = 'YYYY/MM/DD HH:mm'

const toField = (f: SignupFieldOut): SignupField => ({
  key: f.key,
  label: f.label,
  type: (f.type in FIELD_TYPE_LABEL ? f.type : 'text') as FieldType,
  required: !!f.required,
  options: f.options,
})

export const toSignupItem = (s: SignupItemOut): SignupItem => ({
  id: s.id,
  name: s.name,
  description: s.description,
  kind: s.kind,
  eventAt: s.event_at ? dayjs(s.event_at).format(DATETIME_FMT) : undefined,
  place: s.place ?? undefined,
  deadline: s.signup_end ? dayjs(s.signup_end).format(DATETIME_FMT) : undefined,
  maxParticipants: s.max_participants,
  requiresConfirmation: s.requires_confirmation,
  isEval: s.is_eval,
  accepting: s.accepting,
  myStatus: s.my_status,
  fields: s.fields.map(toField),
})

const toDetail = (s: SignupItemDetailOut): SignupItemDetail => ({
  ...toSignupItem(s),
  mySignup: s.my_signup
    ? {
        confirmed: s.my_signup.confirmed,
        submittedAt: dayjs(s.my_signup.created_at).format(DATETIME_FMT),
        participants: s.my_signup.entries.map((e) => e.answers),
      }
    : undefined,
  myDraft: s.my_draft ?? undefined,
})

const keys = {
  all: ['signups'] as const,
  list: (p: { page: number; pageSize: number }) => ['signups', 'list', p] as const,
  detail: (id: number) => ['signups', 'detail', id] as const,
}

export function useSignupItems(p: { page: number; pageSize: number }) {
  return useQuery({
    queryKey: keys.list(p),
    queryFn: () =>
      apiPaged<SignupItemOut[]>(`/club/signup-items${qs({ page: p.page, page_size: p.pageSize })}`).then(
        ({ data, total }) => ({ items: data.map(toSignupItem), total }),
      ),
    placeholderData: keepPreviousData,
  })
}

export function useSignupItem(id: number | undefined) {
  return useQuery({
    queryKey: keys.detail(id ?? 0),
    queryFn: () => api<SignupItemDetailOut>(`/club/signup-items/${id}`).then(toDetail),
    enabled: id != null,
  })
}

export function useSignupMutations() {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: keys.all })
  const saveDraft = useMutation({
    mutationFn: ({ id, participants }: { id: number; participants: Participant[] }) =>
      api<null>(`/club/signup-items/${id}/draft`, {
        method: 'PUT',
        body: JSON.stringify({ participants }),
      }),
    onSuccess: invalidate,
  })
  const submit = useMutation({
    mutationFn: ({ id, participants }: { id: number; participants: Participant[] }) =>
      api<null>(`/club/signup-items/${id}/signup`, {
        method: 'POST',
        body: JSON.stringify({ participants: participants.map((answers) => ({ answers })), awards: [] }),
      }),
    onSuccess: invalidate,
  })
  return { saveDraft, submit }
}

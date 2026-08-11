// 成員列表 API 層(接線範本):snake_case ↔ camelCase 轉換集中在此,
// 頁面只碰 camelCase 型別;查詢鍵集中管理,mutation 一律 invalidate 整域
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'
import { fetchAllPages } from './fetchAll'
import type { MemberKind } from '../lib/roles'

export interface Member {
  id: number
  name: string
  studentId: string
  kind: MemberKind
  title?: string
  phone?: string
  semester: string
  updatedAt: string
}

interface MemberOut {
  id: number
  name: string
  student_id: string
  kind: MemberKind
  title: string | null
  phone: string | null
  semester: string
  updated_at: string
}

const toMember = (m: MemberOut): Member => ({
  id: m.id,
  name: m.name,
  studentId: m.student_id,
  kind: m.kind,
  title: m.title ?? undefined,
  phone: m.phone ?? undefined,
  semester: m.semester,
  updatedAt: dayjs(m.updated_at).format('YYYY/MM/DD HH:mm'),
})

export interface MemberListParams {
  semester?: string
  kinds?: MemberKind[]
  sort?: string
  page: number
  pageSize: number
}

const keys = {
  all: ['members'] as const,
  list: (p: MemberListParams) => ['members', 'list', p] as const,
  semesters: ['members', 'semesters'] as const,
}

export function useMembers(p: MemberListParams) {
  return useQuery({
    queryKey: keys.list(p),
    queryFn: () =>
      apiPaged<MemberOut[]>(
        `/club/members${qs({ semester: p.semester, kind: p.kinds, sort: p.sort, page: p.page, page_size: p.pageSize })}`,
      ).then(({ data, total }) => ({ members: data.map(toMember), total })),
    placeholderData: keepPreviousData,
  })
}

export function useMemberSemesters() {
  return useQuery({
    queryKey: keys.semesters,
    queryFn: () => api<string[]>('/club/members/semesters'),
  })
}

export interface MemberInput {
  name: string
  studentId: string
  kind: MemberKind
  title?: string
  phone?: string
  semester: string
}

export interface ImportResult {
  created: number
  updated: number
  errors: string[]
}

export function useMemberMutations() {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: keys.all })
  const create = useMutation({
    mutationFn: (b: MemberInput) =>
      api<MemberOut>('/club/members', {
        method: 'POST',
        body: JSON.stringify({
          name: b.name,
          student_id: b.studentId,
          kind: b.kind,
          title: b.title,
          phone: b.phone,
          semester: b.semester,
        }),
      }),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: number; kind?: MemberKind; title?: string | null; phone?: string | null }) =>
      api<MemberOut>(`/club/members/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: number) => api<null>(`/club/members/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  const importCsv = useMutation({
    mutationFn: ({ csvText, semester }: { csvText: string; semester: string }) =>
      api<ImportResult>('/club/members/import', {
        method: 'POST',
        body: JSON.stringify({ csv_text: csvText, semester }),
      }),
    onSuccess: invalidate,
  })
  return { create, update, remove, importCsv }
}

/** 匯出用:抓齊指定學期全部成員(逐頁) */
export async function fetchAllMembers(semester: string): Promise<Member[]> {
  const out: Member[] = []
  out.push(
    ...(await fetchAllPages<MemberOut>('/club/members', { semester, sort: 'student_id' })).map(toMember),
  )
  return out
}

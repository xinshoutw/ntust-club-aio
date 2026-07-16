// 行政端社團主檔 API 層(/admin/clubs,權限鍵 amember):
// snake_case ↔ camelCase 與日期(ISO → YYYY/MM/DD)轉換集中在此,頁面只碰 camelCase 型別;
// 主檔列表不分頁(全校 <200 筆),供 ClubCascader/AdminClubContext/管理項目共用
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'
import type { MemberKind } from '../lib/roles'

export const slashDate = (iso: string): string => dayjs(iso).format('YYYY/MM/DD')

// ---- 社團主檔 ----

export interface AdminClub {
  id: number
  name: string
  attribute: string
  username: string | null // 社團帳號(一社一帳號;尚未建立時為 null)
  isActive: boolean
  suspendedUntil: string | null // YYYY/MM/DD;null=未停權
}

export interface AdminClubDetail extends AdminClub {
  intro: string
  websiteUrl: string | null
  contactEmails: string[]
  discordWebhookSet: boolean // 僅回是否設定,不回實值
  advisorName: string | null
  advisorDept: string | null
  advisorEmail: string | null
  advisorExt: string | null
  suspendReason: string | null
}

interface AdminClubOut {
  id: number
  name: string
  attribute: string
  username: string | null
  is_active: boolean
  suspended_until: string | null
}

interface AdminClubDetailOut extends AdminClubOut {
  intro: string
  website_url: string | null
  contact_emails: string[]
  discord_webhook_set: boolean
  advisor_name: string | null
  advisor_dept: string | null
  advisor_email: string | null
  advisor_ext: string | null
  suspend_reason: string | null
}

const toClub = (c: AdminClubOut): AdminClub => ({
  id: c.id,
  name: c.name,
  attribute: c.attribute,
  username: c.username,
  isActive: c.is_active,
  suspendedUntil: c.suspended_until ? slashDate(c.suspended_until) : null,
})

const toDetail = (c: AdminClubDetailOut): AdminClubDetail => ({
  ...toClub(c),
  intro: c.intro,
  websiteUrl: c.website_url,
  contactEmails: c.contact_emails,
  discordWebhookSet: c.discord_webhook_set,
  advisorName: c.advisor_name,
  advisorDept: c.advisor_dept,
  advisorEmail: c.advisor_email,
  advisorExt: c.advisor_ext,
  suspendReason: c.suspend_reason,
})

export interface AdminMemberParams {
  semester?: string
  sort?: string
  page: number
  pageSize: number
}

export const adminClubKeys = {
  all: ['adminClubs'] as const,
  list: ['adminClubs', 'list'] as const,
  options: ['adminClubs', 'options'] as const,
  detail: (id: number) => ['adminClubs', 'detail', id] as const,
  members: (id: number, p: AdminMemberParams) => ['adminClubs', 'members', id, p] as const,
  suspended: ['adminClubs', 'suspended'] as const,
}

export const fetchAdminClubs = (): Promise<AdminClub[]> =>
  api<AdminClubOut[]>('/admin/clubs').then((rows) => rows.map(toClub))

export const fetchAdminClubDetail = (id: number): Promise<AdminClubDetail> =>
  api<AdminClubDetailOut>(`/admin/clubs/${id}`).then(toDetail)

export function useAdminClubs() {
  return useQuery({
    queryKey: adminClubKeys.list,
    queryFn: fetchAdminClubs,
    staleTime: 5 * 60_000, // 主檔異動低頻;所有主檔 mutation 皆會 invalidate 整域
  })
}

// ---- 最小社團選項(任何管理員可讀;跨頁選擇器共用,完整主檔仍限 amember) ----

export interface ClubOption {
  id: number
  name: string
  attribute: string
}

export function useClubOptions() {
  return useQuery({
    queryKey: adminClubKeys.options,
    queryFn: () => api<ClubOption[]>('/admin/clubs/options'),
    staleTime: 5 * 60_000, // 同上;主檔 mutation invalidate 整域時一併更新
  })
}

export function useAdminClubDetail(clubId: number | null) {
  return useQuery({
    queryKey: adminClubKeys.detail(clubId ?? 0),
    enabled: clubId != null,
    queryFn: () => fetchAdminClubDetail(clubId as number),
  })
}

// ---- 成員名單(唯讀;分頁/semester/sort 比照社團端 /club/members) ----

export interface AdminMember {
  id: number
  name: string
  studentId: string
  kind: MemberKind
  title?: string
  semester: string
  updatedAt: string
}

interface MemberOut {
  id: number
  name: string
  student_id: string
  kind: MemberKind
  title: string | null
  semester: string
  updated_at: string
}

const toMember = (m: MemberOut): AdminMember => ({
  id: m.id,
  name: m.name,
  studentId: m.student_id,
  kind: m.kind,
  title: m.title ?? undefined,
  semester: m.semester,
  updatedAt: dayjs(m.updated_at).format('YYYY/MM/DD HH:mm'),
})

export function useAdminClubMembers(clubId: number | null, p: AdminMemberParams) {
  return useQuery({
    queryKey: adminClubKeys.members(clubId ?? 0, p),
    enabled: clubId != null,
    queryFn: () =>
      apiPaged<MemberOut[]>(
        `/admin/clubs/${clubId}/members${qs({ semester: p.semester, sort: p.sort, page: p.page, page_size: p.pageSize })}`,
      ).then(({ data, total }) => ({ members: data.map(toMember), total })),
    placeholderData: keepPreviousData,
  })
}

/** 匯出用:抓齊指定學期(未帶=全部學期)全部成員(逐頁) */
export async function fetchAllAdminMembers(clubId: number, semester?: string): Promise<AdminMember[]> {
  const out: AdminMember[] = []
  for (let page = 1; ; page++) {
    const { data, total } = await apiPaged<MemberOut[]>(
      `/admin/clubs/${clubId}/members${qs({ semester, page, page_size: 100, sort: 'student_id' })}`,
    )
    out.push(...data.map(toMember))
    if (data.length === 0 || out.length >= total) break
  }
  return out
}

// ---- mutations(行政可改:名稱/帳號/啟停用;重設密碼) ----

export interface AdminClubPatch {
  id: number
  name?: string
  username?: string
  isActive?: boolean
}

export function useAdminClubMutations() {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: adminClubKeys.all })
  const update = useMutation({
    mutationFn: ({ id, name, username, isActive }: AdminClubPatch) =>
      api<AdminClubDetailOut>(`/admin/clubs/${id}`, {
        method: 'PATCH',
        // JSON.stringify 會略過 undefined 欄位 → 未變更欄位不送(後端 exclude_unset)
        body: JSON.stringify({ name, username, is_active: isActive }),
      }).then(toDetail),
    onSuccess: invalidate,
  })
  // 一次性明碼僅此回應可見;呼叫端接 OneTimePasswordModal 顯示
  const resetPassword = useMutation({
    mutationFn: (id: number) =>
      api<{ password: string }>(`/admin/clubs/${id}/reset-password`, { method: 'POST' }).then(
        (r) => r.password,
      ),
    onSuccess: invalidate, // 重設會撤銷 session,狀態欄位不變;保守整域刷新
  })
  return { update, resetPassword }
}

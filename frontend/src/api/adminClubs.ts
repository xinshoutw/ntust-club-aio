// 行政端社團主檔 API 層(/admin/clubs;總覽 aclub、成員列表 amember、管理項目 aclubset):
// snake_case ↔ camelCase 與日期(ISO → YYYY/MM/DD)轉換集中在此,頁面只碰 camelCase 型別;
// 主檔列表不分頁(全校 <200 筆),供 ClubCascader/AdminClubContext/管理項目共用
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'
import { fetchAllPages } from './fetchAll'
import type { MemberKind } from '../lib/roles'

export const slashDate = (iso: string): string => dayjs(iso).format('YYYY/MM/DD')

// ---- 社團主檔 ----

export interface AdminClub {
  id: number
  name: string
  kind: string // 社團/學會
  attribute: string | null // 停社舊社團原性質不可考 → null
  username: string | null // 社團帳號(一社一帳號;尚未建立時為 null)
  isActive: boolean
  suspendedUntil: string | null // YYYY/MM/DD;null=未停權
}

export interface AdminClubDetail extends AdminClub {
  enName: string
  intro: string
  websiteUrl: string | null
  contactEmails: string[]
  discordWebhookSet: boolean // 僅回是否設定,不回實值
  advisorName: string | null
  advisorDept: string | null
  advisorEmail: string | null
  advisorOutName: string | null
  advisorOutDept: string | null
  advisorOutEmail: string | null
  suspendReason: string | null
}

interface AdminClubOut {
  id: number
  name: string
  kind: string
  attribute: string | null
  username: string | null
  is_active: boolean
  suspended_until: string | null
}

interface AdminClubDetailOut extends AdminClubOut {
  en_name: string | null
  intro: string
  website_url: string | null
  contact_emails: string[]
  discord_webhook_set: boolean
  advisor_name: string | null
  advisor_dept: string | null
  advisor_email: string | null
  advisor_out_name: string | null
  advisor_out_dept: string | null
  advisor_out_email: string | null
  suspend_reason: string | null
}

const toClub = (c: AdminClubOut): AdminClub => ({
  id: c.id,
  name: c.name,
  kind: c.kind,
  attribute: c.attribute,
  username: c.username,
  isActive: c.is_active,
  suspendedUntil: c.suspended_until ? slashDate(c.suspended_until) : null,
})

const toDetail = (c: AdminClubDetailOut): AdminClubDetail => ({
  ...toClub(c),
  enName: c.en_name ?? '',
  intro: c.intro,
  websiteUrl: c.website_url,
  contactEmails: c.contact_emails,
  discordWebhookSet: c.discord_webhook_set,
  advisorName: c.advisor_name,
  advisorDept: c.advisor_dept,
  advisorEmail: c.advisor_email,
  advisorOutName: c.advisor_out_name,
  advisorOutDept: c.advisor_out_dept,
  advisorOutEmail: c.advisor_out_email,
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
  memberSemesters: (id: number) => ['adminClubs', 'memberSemesters', id] as const,
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

// ---- 最小社團選項(任何管理員可讀;跨頁選擇器共用,完整主檔另有權限)----

/** 社團性質:對應後端 Club.attribute enum(GAP-11 未定案前無主檔表可查) */
export const CLUB_ATTRIBUTES = ['自治性', '學藝性', '服務性', '聯誼性', '藝術性', '體育性'] as const

export interface ClubOption {
  id: number
  name: string
  kind: string // 社團/學會(負責人顯示詞推導)
  attribute: string | null // null 歸「未分類」
  isActive: boolean
}

/** 二級選單只需要這三欄:工讀生端的 /staff/clubs 給的就是這個形狀 */
export type ClubFolderInput = Pick<ClubOption, 'name' | 'attribute' | 'isActive'>

/** 社團的資料夾:停社舊社團的 attribute 為 null,一律歸「未分類」。
 *  二級選單(ClubCascader)與社團漏斗(ClubFilterButton)共用這一份 —— 各寫一份的話,
 *  同一個社團在兩個選單裡會落在不同資料夾 */
export const clubFolder = (c: Pick<ClubOption, 'attribute'>): string => c.attribute ?? '未分類'

/** 依主檔出現順序分成 資料夾 → 社團名(後端已按 性質 → 名稱 排序;null 排最前 → 未分類在頂) */
export function groupClubsByFolder(
  clubs: readonly ClubFolderInput[],
): { label: string; options: string[] }[] {
  return [...new Set(clubs.map(clubFolder))].map((folder) => ({
    label: folder,
    options: clubs.filter((c) => clubFolder(c) === folder).map((c) => c.name),
  }))
}

/** 選單用的資料夾:只列啟用中社團。
 *
 * 全站的社團選擇器(ClubCascader 的每一頁、兩個社團漏斗、工讀生的違規勸導填寫)一律走這一版 ——
 * 停用社團在任何一個「要選一個社團來做事」的地方都不該是選項。
 *
 * **判的是 `is_active`,不是「有沒有性質」**:正式資料裡 67 個 attribute 為 null 的確實全是停社
 * 舊社,但反過來不成立(有性質卻停用的也有),而遷移匯入認不得性質時會留下啟用中卻沒有性質的社團 ——
 * 那些是還在跑的社團,不該藏。
 *
 * 收掉的只是**選項**:已經選中的社團(跨頁帶著舊選擇過來、或用名稱對回 id)仍照常顯示與查詢,
 * 否則社團總覽/成員列表打開會是一個空的選擇器與一頁空白。
 */
export const groupActiveClubs = (
  clubs: readonly ClubFolderInput[],
): { label: string; options: string[] }[] => groupClubsByFolder(clubs.filter((c) => c.isActive))

interface ClubOptionOut {
  id: number
  name: string
  kind: string
  attribute: string | null
  is_active: boolean
}

export function useClubOptions() {
  return useQuery({
    queryKey: adminClubKeys.options,
    queryFn: () =>
      api<ClubOptionOut[]>('/admin/clubs/options').then((rows) =>
        rows.map((c) => ({ ...c, isActive: c.is_active })),
      ),
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
  joinedAt: string
  updatedAt: string
}

interface MemberOut {
  id: number
  name: string
  student_id: string
  kind: MemberKind
  title: string | null
  semester: string
  created_at: string
  updated_at: string
}

const toMember = (m: MemberOut): AdminMember => ({
  id: m.id,
  name: m.name,
  studentId: m.student_id,
  kind: m.kind,
  title: m.title ?? undefined,
  semester: m.semester,
  joinedAt: dayjs(m.created_at).format('YYYY/MM/DD HH:mm'),
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
    // 同社團翻頁/換學期才沿用舊資料;換社團時清空,否則會顯示前一社的名單
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[2] === (clubId ?? 0) ? prev : undefined,
  })
}

/** 該社名單有資料的學期(新到舊):學期下拉的來源,不然查不到歷史學期 */
export function useAdminClubMemberSemesters(clubId: number | null) {
  return useQuery({
    queryKey: adminClubKeys.memberSemesters(clubId ?? 0),
    enabled: clubId != null,
    queryFn: () => api<string[]>(`/admin/clubs/${clubId}/members/semesters`),
  })
}

/** 匯出用:抓齊指定學期(未帶=全部學期)全部成員(逐頁) */
export async function fetchAllAdminMembers(clubId: number, semester?: string): Promise<AdminMember[]> {
  const out: AdminMember[] = []
  out.push(
    ...(
      await fetchAllPages<MemberOut>(`/admin/clubs/${clubId}/members`, {
        semester,
        sort: 'student_id',
      })
    ).map(toMember),
  )
  return out
}

// ---- mutations(行政可改:名稱/帳號/啟停用;建立帳號/重設密碼) ----

export interface AdminClubPatch {
  id: number
  name?: string
  kind?: string // 社團/學會;改名推導不到時手動指定
  attribute?: string // 社團性質;建檔時必填,選錯了要改得回來
  enName?: string
  username?: string
  isActive?: boolean
}

export function useAdminClubMutations() {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: adminClubKeys.all })
  const update = useMutation({
    mutationFn: ({ id, name, kind, attribute, enName, username, isActive }: AdminClubPatch) =>
      api<AdminClubDetailOut>(`/admin/clubs/${id}`, {
        method: 'PATCH',
        // JSON.stringify 會略過 undefined 欄位 → 未變更欄位不送(後端 exclude_unset)
        body: JSON.stringify({ name, kind, attribute, en_name: enName, username, is_active: isActive }),
      }).then(toDetail),
    onSuccess: invalidate,
  })
  // 新增社團主檔:kind 由後端依名稱結尾推導,性質必填(沒有性質的社團不會出現在社團漏斗);
  // 登入用的帳號另走 createAccount —— 建社團與建帳號是兩個動作
  const create = useMutation({
    mutationFn: ({ name, attribute }: { name: string; attribute: string }) =>
      api<AdminClubDetailOut>('/admin/clubs', {
        method: 'POST',
        body: JSON.stringify({ name, attribute }),
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
  // 建立社團帳號(一社一帳號;已有帳號後端回 409):一次性明碼同上
  const createAccount = useMutation({
    mutationFn: ({ id, username }: { id: number; username: string }) =>
      api<{ username: string; password: string }>(`/admin/clubs/${id}/account`, {
        method: 'POST',
        body: JSON.stringify({ username }),
      }),
    onSuccess: invalidate,
  })
  // 刪除社團主檔(連同帳號):社團底下還有資料時後端回 CLUB_HAS_DATA(訊息列出各類筆數),
  // 二次確認後帶 force 再送一次,那些資料會一起刪掉
  const remove = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      api<null>(`/admin/clubs/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  return { create, update, resetPassword, createAccount, remove }
}

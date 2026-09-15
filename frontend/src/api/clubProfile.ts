// 管理項目 API 層:社團簡介/指導老師/聯絡與通知/對外公開資料(GET/PATCH /club/profile)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { API_BASE, api } from './client'
import { suspendedNow } from '../lib/status'

const slashDate = (iso: string): string => dayjs(iso).format('YYYY/MM/DD')

/** 後端 `schemas/clubs.CLUB_TAGS` 是第一份,改動須同步。社團至多選 3 個。 */
export const CLUB_TAGS = [
  '系學會', '技術', '程式', '表演', '音樂', '美術', '遊戲',
  '聯誼', '服務', '喝酒', '運動', '武術', '戶外', '飲食',
] as const
export const MAX_TAGS = 3

/** 後端 `models/enums.RecruitStatus` 是第一份,改動須同步。 */
export const RECRUIT_STATUSES = ['歡迎加入', '暫不開放', '額滿'] as const

/** 形象圖比例(後端 `services/files.CLUB_IMAGE_SIZES` 是第一份)。
 *  橫幅的字卡與詳細頁用**同一個**比例,一張圖兩處都不裁切。 */
export const CLUB_IMAGE_RATIO = { avatar: 1, banner: 3 } as const
export type ClubImageSlot = keyof typeof CLUB_IMAGE_RATIO


export interface ClubProfile {
  /** 預覽按鈕要用它組 /clubs/:id */
  id: number
  name: string
  /** 社團/學會 */
  kind: string
  enName: string
  intro: string
  url: string
  /** 聯絡 Email 固定三欄(未填為空字串),對應表單 email1–3 */
  emails: [string, string, string]
  discordWebhook: string
  advisorName: string
  advisorDept: string
  advisorEmail: string
  advisorOutName: string
  advisorOutDept: string
  advisorOutEmail: string
  /** 停權中才有值(YYYY/MM/DD);社團要看得到自己被停權,而不是送借用撞 403 才知道 */
  suspendedUntil: string | null
  suspendReason: string
  /** 對外公開資料(社團導覽頁);未填一律空字串/空陣列 */
  public: ClubPublicProfile
}

export interface ClubPublicProfile {
  tagline: string
  tags: string[]
  recruitStatus: string
  publicEmail: string
  /** 一平台一格(表單是六個固定欄位);未填的平台不進陣列 */
  /** 帳號 ID,不含網址前綴 */
  instagram: string
  officeLocation: string
  regularSchedule: string
  joinInfo: string
  signupUrl: string
  avatarUrl: string | null
  bannerUrl: string | null
}

/** 公開欄位的原始形狀。後端的 `ClubPublicOut` 也是巢狀掛在行政端詳情底下,
 *  兩端共用同一支轉換(`toPublicProfile`)—— 公開範圍只該有一個定義。 */
export interface ClubPublicOut {
  tagline: string | null
  tags: string[]
  recruit_status: string | null
  public_email: string | null
  instagram: string | null
  office_location: string | null
  regular_schedule: string | null
  join_info: string | null
  signup_url: string | null
  avatar_file_id: string | null
  banner_file_id: string | null
}

interface ClubProfileOut extends ClubPublicOut {
  id: number
  name: string
  kind: string
  en_name: string | null
  attribute: string | null
  intro: string
  website_url: string | null
  contact_emails: string[]
  discord_webhook_url: string | null
  advisor_name: string | null
  advisor_dept: string | null
  advisor_email: string | null
  advisor_out_name: string | null
  advisor_out_dept: string | null
  advisor_out_email: string | null
  suspended_until: string | null
  suspend_reason: string | null
}

const imageUrl = (fileId: string | null): string | null =>
  fileId ? `${API_BASE}/files/${fileId}` : null

export const toPublicProfile = (c: ClubPublicOut): ClubPublicProfile => ({
  tagline: c.tagline ?? '',
  tags: c.tags ?? [],
  recruitStatus: c.recruit_status ?? '',
  publicEmail: c.public_email ?? '',
  instagram: c.instagram ?? '',
  officeLocation: c.office_location ?? '',
  regularSchedule: c.regular_schedule ?? '',
  joinInfo: c.join_info ?? '',
  signupUrl: c.signup_url ?? '',
  avatarUrl: imageUrl(c.avatar_file_id),
  bannerUrl: imageUrl(c.banner_file_id),
})

const toProfile = (c: ClubProfileOut): ClubProfile => ({
  id: c.id,
  name: c.name,
  kind: c.kind,
  enName: c.en_name ?? '',
  intro: c.intro,
  url: c.website_url ?? '',
  emails: [c.contact_emails[0] ?? '', c.contact_emails[1] ?? '', c.contact_emails[2] ?? ''],
  discordWebhook: c.discord_webhook_url ?? '',
  advisorName: c.advisor_name ?? '',
  advisorDept: c.advisor_dept ?? '',
  advisorEmail: c.advisor_email ?? '',
  advisorOutName: c.advisor_out_name ?? '',
  advisorOutDept: c.advisor_out_dept ?? '',
  advisorOutEmail: c.advisor_out_email ?? '',
  suspendedUntil: c.suspended_until ? slashDate(c.suspended_until) : null,
  suspendReason: c.suspend_reason ?? '',
  public: toPublicProfile(c),
})

export const clubProfileKeys = { profile: ['club-profile'] as const }

export function useClubProfile() {
  return useQuery({
    queryKey: clubProfileKeys.profile,
    queryFn: () => api<ClubProfileOut>('/club/profile').then(toProfile),
  })
}

export interface ClubSuspension {
  /** 停權中(含到期當日);與後端 `suspended_until >= today` 一致 */
  suspended: boolean
  /** YYYY/MM/DD;未停權為空字串 */
  until: string
  reason: string
  /** 查詢失敗:`suspended` 這時等於「不知道」,不是「沒有停權」 */
  failed: boolean
}

/** 停權狀態:借用四頁與管理項目共用(見 components/ui/SuspensionNote)。 */
export function useClubSuspension(): ClubSuspension {
  // isLoadingError = 失敗且手上一筆資料都沒有。背景重抓失敗(error 態保留 data)不算 ——
  // 那會把「停權至 2026/09/30」這個已知事實換成「無法確認」,比修之前更糟
  const { data, isLoadingError } = useClubProfile()
  const until = data?.suspendedUntil ?? ''
  return {
    suspended: suspendedNow(until),
    until,
    reason: data?.suspendReason ?? '',
    failed: isLoadingError,
  }
}

export interface ClubProfileInput {
  intro: string
  url: string
  emails: string[]
  discordWebhook: string
  advisorName: string
  advisorDept: string
  advisorEmail: string
  advisorOutName: string
  advisorOutDept: string
  advisorOutEmail: string
  // 對外公開資料
  tagline: string
  tags: string[]
  recruitStatus: string
  publicEmail: string
  /** 帳號 ID,不含網址前綴 */
  instagram: string
  officeLocation: string
  regularSchedule: string
  joinInfo: string
  signupUrl: string
}

export function useUpdateClubProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: ClubProfileInput) =>
      api<ClubProfileOut>('/club/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          intro: b.intro,
          website_url: b.url.trim() || null,
          // 第 1 組必填由表單擋;空欄後端會自行過濾
          contact_emails: b.emails.map((e) => e.trim()),
          discord_webhook_url: b.discordWebhook.trim() || null,
          advisor_name: b.advisorName.trim() || null,
          advisor_dept: b.advisorDept.trim() || null,
          advisor_email: b.advisorEmail.trim() || null,
          advisor_out_name: b.advisorOutName.trim() || null,
          advisor_out_dept: b.advisorOutDept.trim() || null,
          advisor_out_email: b.advisorOutEmail.trim() || null,
          tagline: b.tagline.trim() || null,
          tags: b.tags,
          recruit_status: b.recruitStatus || null,
          public_email: b.publicEmail.trim() || null,
          instagram: b.instagram.trim() || null,
          office_location: b.officeLocation.trim() || null,
          regular_schedule: b.regularSchedule.trim() || null,
          join_info: b.joinInfo.trim() || null,
          signup_url: b.signupUrl.trim() || null,
        }),
      }).then(toProfile),
    // 儲存成功即以 server 回傳值為新基準
    onSuccess: (data) => qc.setQueryData(clubProfileKeys.profile, data),
  })
}


// ---- 形象圖:選檔即上傳,不隨表單儲存(要有預覽可看,壓進 PATCH 就得先傳暫存檔再綁定)----

export function useUploadClubImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ slot, file }: { slot: ClubImageSlot; file: File }) => {
      const fd = new FormData()
      fd.append('file', file)
      return api<ClubProfileOut>(`/club/profile/${slot}/upload`, { method: 'POST', body: fd }).then(
        toProfile,
      )
    },
    onSuccess: (data) => qc.setQueryData(clubProfileKeys.profile, data),
  })
}

export function useRemoveClubImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slot: ClubImageSlot) =>
      api<ClubProfileOut>(`/club/profile/${slot}`, { method: 'DELETE' }).then(toProfile),
    onSuccess: (data) => qc.setQueryData(clubProfileKeys.profile, data),
  })
}

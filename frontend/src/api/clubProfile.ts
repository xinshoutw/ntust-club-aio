// 管理項目 API 層:社團簡介/指導老師/聯絡與通知(GET/PATCH /club/profile)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface ClubProfile {
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
  advisorExt: string
  advisorOutName: string
  advisorOutDept: string
  advisorOutEmail: string
  advisorOutPhone: string
}

interface ClubProfileOut {
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
  advisor_ext: string | null
  advisor_out_name: string | null
  advisor_out_dept: string | null
  advisor_out_email: string | null
  advisor_out_phone: string | null
  suspended_until: string | null
  suspend_reason: string | null
}

const toProfile = (c: ClubProfileOut): ClubProfile => ({
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
  advisorExt: c.advisor_ext ?? '',
  advisorOutName: c.advisor_out_name ?? '',
  advisorOutDept: c.advisor_out_dept ?? '',
  advisorOutEmail: c.advisor_out_email ?? '',
  advisorOutPhone: c.advisor_out_phone ?? '',
})

export const clubProfileKeys = { profile: ['club-profile'] as const }

export function useClubProfile() {
  return useQuery({
    queryKey: clubProfileKeys.profile,
    queryFn: () => api<ClubProfileOut>('/club/profile').then(toProfile),
  })
}

export interface ClubProfileInput {
  intro: string
  enName: string
  url: string
  emails: string[]
  discordWebhook: string
  advisorName: string
  advisorDept: string
  advisorEmail: string
  advisorExt: string
  advisorOutName: string
  advisorOutDept: string
  advisorOutEmail: string
  advisorOutPhone: string
}

export function useUpdateClubProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: ClubProfileInput) =>
      api<ClubProfileOut>('/club/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          intro: b.intro,
          en_name: b.enName.trim() || null,
          website_url: b.url.trim() || null,
          // 第 1 組必填由表單擋;空欄後端會自行過濾
          contact_emails: b.emails.map((e) => e.trim()),
          discord_webhook_url: b.discordWebhook.trim() || null,
          advisor_name: b.advisorName.trim() || null,
          advisor_dept: b.advisorDept.trim() || null,
          advisor_email: b.advisorEmail.trim() || null,
          advisor_ext: b.advisorExt.trim() || null,
          advisor_out_name: b.advisorOutName.trim() || null,
          advisor_out_dept: b.advisorOutDept.trim() || null,
          advisor_out_email: b.advisorOutEmail.trim() || null,
          advisor_out_phone: b.advisorOutPhone.trim() || null,
        }),
      }).then(toProfile),
    // 儲存成功即以 server 回傳值為新基準
    onSuccess: (data) => qc.setQueryData(clubProfileKeys.profile, data),
  })
}

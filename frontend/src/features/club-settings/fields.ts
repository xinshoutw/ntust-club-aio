// 管理項目表單的欄位形狀:哪些欄位屬於 profile(另一支 API 是改密碼)、
// 以及「這次到底有沒有動到 profile」—— 送出與必填驗證都問同一個問題,只能有一份答案
import type { ClubProfile } from '../../api/clubProfile'

export interface SettingsValues {
  advisorName: string
  advisorDept?: string
  advisorEmail?: string
  advisorPhone?: string
  advisorOutName?: string
  advisorOutDept?: string
  advisorOutEmail?: string
  advisorOutPhone?: string
  url?: string
  intro?: string
  email1: string
  email2?: string
  email3?: string
  discordWebhook?: string
  pwCurrent?: string
  pwNew?: string
  pwConfirm?: string
}

// PATCH /club/profile 涵蓋的欄位(密碼另走 /auth/change-password)
export const PROFILE_KEYS = [
  'advisorName',
  'advisorDept',
  'advisorEmail',
  'advisorPhone',
  'advisorOutName',
  'advisorOutDept',
  'advisorOutEmail',
  'advisorOutPhone',
  'url',
  'intro',
  'email1',
  'email2',
  'email3',
  'discordWebhook',
] as const satisfies readonly (keyof SettingsValues)[]

// dirty 基準=最後載入/儲存的 server 值;密碼欄基準恆為空
export const fromProfile = (p: ClubProfile): SettingsValues => ({
  advisorName: p.advisorName,
  advisorDept: p.advisorDept,
  advisorEmail: p.advisorEmail,
  advisorPhone: p.advisorPhone,
  advisorOutName: p.advisorOutName,
  advisorOutDept: p.advisorOutDept,
  advisorOutEmail: p.advisorOutEmail,
  advisorOutPhone: p.advisorOutPhone,
  url: p.url,
  intro: p.intro,
  email1: p.emails[0],
  email2: p.emails[1],
  email3: p.emails[2],
  discordWebhook: p.discordWebhook,
  pwCurrent: '',
  pwNew: '',
  pwConfirm: '',
})

/** 這次有沒有動到 profile 的任何一欄。
 *
 *  必填(網頁連結、簡介)只在這裡為 true 時才擋:密碼是同一張表單裡的另一支 API,
 *  而遷入的社團有一批簡介是空字串、網頁連結是 NULL(`migration/cms_import.py`),
 *  一律擋下去等於那些社團連改個密碼都送不出去。 */
export const profileChanged = (cur: SettingsValues, saved: SettingsValues): boolean =>
  PROFILE_KEYS.some((k) => (cur[k] ?? '') !== (saved[k] ?? ''))

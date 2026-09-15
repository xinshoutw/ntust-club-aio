// 管理項目表單的欄位形狀,以及「這次到底有沒有動到 profile」—— 送出與必填驗證
// 都問同一個問題,只能有一份答案。改密不在這張表單裡(頂欄帳號選單的對話框)
import type { ClubProfile } from '../../api/clubProfile'

export interface SettingsValues {
  advisorName: string
  advisorDept?: string
  advisorEmail?: string
  advisorOutName?: string
  advisorOutDept?: string
  advisorOutEmail?: string
  url?: string
  intro?: string
  email1: string
  email2?: string
  email3?: string
  discordWebhook?: string
  // 對外公開資料
  tagline?: string
  tags?: string[]
  recruitStatus?: string
  publicEmail?: string
  instagram?: string
  officeLocation?: string
  regularSchedule?: string
  joinInfo?: string
  signupUrl?: string
}

// PATCH /club/profile 涵蓋的欄位(形象圖另走上傳端點,選檔即上傳不隨表單儲存)
export const PROFILE_KEYS = [
  'advisorName',
  'advisorDept',
  'advisorEmail',
  'advisorOutName',
  'advisorOutDept',
  'advisorOutEmail',
  'url',
  'intro',
  'email1',
  'email2',
  'email3',
  'discordWebhook',
  'tagline',
  'tags',
  'recruitStatus',
  'publicEmail',
  'instagram',
  'officeLocation',
  'regularSchedule',
  'joinInfo',
  'signupUrl',
] as const satisfies readonly (keyof SettingsValues)[]

/** dirty 比對用的正規化:字串照舊(未填=空字串),陣列與數字走 JSON。
 *
 *  不能只用 `?? ''` —— 標籤是陣列、黑化程度是數字,轉成字串後 `['a','b']` 與 `'a,b'`
 *  分不出來,而 `0` 會被 `??` 放行卻在比較時等於 `'0'`,看起來像沒改。 */
export const normalizeValue = (v: unknown): string =>
  v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)

// dirty 基準=最後載入/儲存的 server 值
export const fromProfile = (p: ClubProfile): SettingsValues => ({
  advisorName: p.advisorName,
  advisorDept: p.advisorDept,
  advisorEmail: p.advisorEmail,
  advisorOutName: p.advisorOutName,
  advisorOutDept: p.advisorOutDept,
  advisorOutEmail: p.advisorOutEmail,
  url: p.url,
  intro: p.intro,
  email1: p.emails[0],
  email2: p.emails[1],
  email3: p.emails[2],
  discordWebhook: p.discordWebhook,
  tagline: p.public.tagline,
  tags: p.public.tags,
  recruitStatus: p.public.recruitStatus,
  publicEmail: p.public.publicEmail,
  instagram: p.public.instagram,
  officeLocation: p.public.officeLocation,
  regularSchedule: p.public.regularSchedule,
  joinInfo: p.public.joinInfo,
  signupUrl: p.public.signupUrl,
})

/** 表單值 → PATCH /club/profile 的輸入。 */
export const toProfileInput = (v: SettingsValues) => ({
  intro: v.intro ?? '',
  url: v.url ?? '',
  emails: [v.email1 ?? '', v.email2 ?? '', v.email3 ?? ''],
  discordWebhook: v.discordWebhook ?? '',
  advisorName: v.advisorName ?? '',
  advisorDept: v.advisorDept ?? '',
  advisorEmail: v.advisorEmail ?? '',
  advisorOutName: v.advisorOutName ?? '',
  advisorOutDept: v.advisorOutDept ?? '',
  advisorOutEmail: v.advisorOutEmail ?? '',
  tagline: v.tagline ?? '',
  tags: v.tags ?? [],
  recruitStatus: v.recruitStatus ?? '',
  publicEmail: v.publicEmail ?? '',
  instagram: v.instagram ?? '',
  officeLocation: v.officeLocation ?? '',
  regularSchedule: v.regularSchedule ?? '',
  joinInfo: v.joinInfo ?? '',
  signupUrl: v.signupUrl ?? '',
})

/** 這次有沒有動到 profile 的任何一欄。
 *
 *  必填(網頁連結、詳細介紹)只在這裡為 true 時才擋:遷入的社團有一批簡介是空字串、
 *  網頁連結是 NULL(`migration/cms_import.py`),開頁就擋等於那些社團什麼都動不了。 */
export const profileChanged = (cur: SettingsValues, saved: SettingsValues): boolean =>
  PROFILE_KEYS.some((k) => normalizeValue(cur[k]) !== normalizeValue(saved[k]))

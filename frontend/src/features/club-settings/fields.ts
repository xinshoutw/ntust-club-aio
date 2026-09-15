// 管理項目表單的欄位形狀:哪些欄位屬於 profile(另一支 API 是改密碼)、
// 以及「這次到底有沒有動到 profile」—— 送出與必填驗證都問同一個問題,只能有一份答案
import type { BannerTextMode, ClubProfile, SocialKind } from '../../api/clubProfile'

// 社群連結一平台一欄(固定六欄,不做動態列):表單值攤平才有逐欄的 dirty 外框,
// 收成巢狀物件的話改一個平台會讓六欄一起變橘
export const SOCIAL_FIELDS = {
  instagram: 'socialInstagram',
  facebook: 'socialFacebook',
  discord: 'socialDiscord',
  youtube: 'socialYoutube',
  line: 'socialLine',
  other: 'socialOther',
} as const satisfies Record<SocialKind, string>

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
  socialInstagram?: string
  socialFacebook?: string
  socialDiscord?: string
  socialYoutube?: string
  socialLine?: string
  socialOther?: string
  officeLocation?: string
  regularSchedule?: string
  joinInfo?: string
  signupUrl?: string
  foundedYear?: number | null
  bannerDim: number
  bannerBlur: number
  bannerTextMode: BannerTextMode
  pwCurrent?: string
  pwNew?: string
  pwConfirm?: string
}

// PATCH /club/profile 涵蓋的欄位(密碼另走 /auth/change-password;形象圖另走上傳端點)
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
  ...(Object.values(SOCIAL_FIELDS) as ['socialInstagram', 'socialFacebook', 'socialDiscord',
    'socialYoutube', 'socialLine', 'socialOther']),
  'officeLocation',
  'regularSchedule',
  'joinInfo',
  'signupUrl',
  'foundedYear',
  'bannerDim',
  'bannerBlur',
  'bannerTextMode',
] as const satisfies readonly (keyof SettingsValues)[]

/** dirty 比對用的正規化:字串照舊(未填=空字串),陣列與數字走 JSON。
 *
 *  不能只用 `?? ''` —— 標籤是陣列、黑化程度是數字,轉成字串後 `['a','b']` 與 `'a,b'`
 *  分不出來,而 `0` 會被 `??` 放行卻在比較時等於 `'0'`,看起來像沒改。 */
export const normalizeValue = (v: unknown): string =>
  v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)

// dirty 基準=最後載入/儲存的 server 值;密碼欄基準恆為空
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
  socialInstagram: p.public.socialLinks.instagram ?? '',
  socialFacebook: p.public.socialLinks.facebook ?? '',
  socialDiscord: p.public.socialLinks.discord ?? '',
  socialYoutube: p.public.socialLinks.youtube ?? '',
  socialLine: p.public.socialLinks.line ?? '',
  socialOther: p.public.socialLinks.other ?? '',
  officeLocation: p.public.officeLocation,
  regularSchedule: p.public.regularSchedule,
  joinInfo: p.public.joinInfo,
  signupUrl: p.public.signupUrl,
  foundedYear: p.public.foundedYear,
  bannerDim: p.public.bannerDim,
  bannerBlur: p.public.bannerBlur,
  bannerTextMode: p.public.bannerTextMode,
  pwCurrent: '',
  pwNew: '',
  pwConfirm: '',
})

/** 表單值 → PATCH /club/profile 的輸入(社群連結由攤平的六欄收回一平台一格)。 */
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
  socialLinks: {
    instagram: v.socialInstagram ?? '',
    facebook: v.socialFacebook ?? '',
    discord: v.socialDiscord ?? '',
    youtube: v.socialYoutube ?? '',
    line: v.socialLine ?? '',
    other: v.socialOther ?? '',
  },
  officeLocation: v.officeLocation ?? '',
  regularSchedule: v.regularSchedule ?? '',
  joinInfo: v.joinInfo ?? '',
  signupUrl: v.signupUrl ?? '',
  foundedYear: v.foundedYear ?? null,
  bannerDim: v.bannerDim,
  bannerBlur: v.bannerBlur,
  bannerTextMode: v.bannerTextMode,
})

/** 這次有沒有動到 profile 的任何一欄。
 *
 *  必填(網頁連結、簡介)只在這裡為 true 時才擋:密碼是同一張表單裡的另一支 API,
 *  而遷入的社團有一批簡介是空字串、網頁連結是 NULL(`migration/cms_import.py`),
 *  一律擋下去等於那些社團連改個密碼都送不出去。 */
export const profileChanged = (cur: SettingsValues, saved: SettingsValues): boolean =>
  PROFILE_KEYS.some((k) => normalizeValue(cur[k]) !== normalizeValue(saved[k]))

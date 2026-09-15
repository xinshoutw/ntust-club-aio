// 免登入的社團導覽 API 層(GET /public/clubs*)。
// snake_case ↔ camelCase 與圖片網址的組裝集中在此,頁面只碰 camelCase 型別。
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { API_BASE, api } from './client'

/** 公開圖片走自己的通道:長快取、不需要 session(`/files/{id}` 是 no-store 且要登入)。 */
export const publicFileUrl = (fileId: string | null): string | null =>
  fileId ? `${API_BASE}/public/files/${fileId}` : null

export interface ClubCard {
  id: number
  name: string
  enName: string
  /** 社團/學會 */
  kind: string
  /** 停社舊社團原性質不可考 → null */
  attribute: string | null
  tagline: string
  tags: string[]
  recruitStatus: string
  avatarUrl: string | null
  bannerUrl: string | null
}

export interface ClubDetail extends ClubCard {
  intro: string
  websiteUrl: string
  /** 帳號 ID,不含網址前綴 */
  instagram: string
  publicEmail: string
  officeLocation: string
  regularSchedule: string
  joinInfo: string
  signupUrl: string
}

export interface PublicActivity {
  id: number
  name: string
  /** YYYY/MM/DD;跨日時為起訖兩天 */
  dateSpan: string
  /** HH:mm – HH:mm;沒填時間為空字串(畫面顯示 —,不可用 00:00 頂替) */
  timeSpan: string
  location: string
}

interface CardOut {
  id: number
  name: string
  en_name: string | null
  kind: string
  attribute: string | null
  tagline: string | null
  tags: string[]
  recruit_status: string | null
  avatar_file_id: string | null
  banner_file_id: string | null
}

interface DetailOut extends CardOut {
  intro: string
  website_url: string | null
  instagram: string | null
  public_email: string | null
  office_location: string | null
  regular_schedule: string | null
  join_info: string | null
  signup_url: string | null
}

export interface ActivityOut {
  id: number
  name: string
  date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
  location: string
}

const toCard = (c: CardOut): ClubCard => ({
  id: c.id,
  name: c.name,
  enName: c.en_name ?? '',
  kind: c.kind,
  attribute: c.attribute,
  tagline: c.tagline ?? '',
  tags: c.tags ?? [],
  recruitStatus: c.recruit_status ?? '',
  avatarUrl: publicFileUrl(c.avatar_file_id),
  bannerUrl: publicFileUrl(c.banner_file_id),
})

const toDetail = (c: DetailOut): ClubDetail => ({
  ...toCard(c),
  intro: c.intro,
  websiteUrl: c.website_url ?? '',
  instagram: c.instagram ?? '',
  publicEmail: c.public_email ?? '',
  officeLocation: c.office_location ?? '',
  regularSchedule: c.regular_schedule ?? '',
  joinInfo: c.join_info ?? '',
  signupUrl: c.signup_url ?? '',
})

const slash = (iso: string): string => dayjs(iso).format('YYYY/MM/DD')
const hhmm = (t: string): string => t.slice(0, 5)

/** export 給 `publicClubs.test.ts`:日期與時間的組法是這一層唯一的規則,
 *  而它的三種情形(單日／跨日／沒有時間)在畫面上分不出對錯 */
export const toActivity = (a: ActivityOut): PublicActivity => ({
  id: a.id,
  name: a.name,
  dateSpan:
    a.date && a.end_date && a.end_date !== a.date
      ? `${slash(a.date)} – ${slash(a.end_date)}`
      : a.date
        ? slash(a.date)
        : '',
  // 起訖時間是選填:缺一個就當沒有,畫面顯示 —(拿不到值不用預設值頂替)
  timeSpan: a.start_time && a.end_time ? `${hhmm(a.start_time)} – ${hhmm(a.end_time)}` : '',
  location: a.location,
})

export const publicClubKeys = {
  list: ['publicClubs'] as const,
  detail: (id: number) => ['publicClubs', 'detail', id] as const,
  activities: (id: number) => ['publicClubs', 'activities', id] as const,
}

/** 全量回傳(全校約 60 個社團),搜尋與篩選都在前端做完,不再打伺服器。 */
export function usePublicClubs() {
  return useQuery({
    queryKey: publicClubKeys.list,
    queryFn: () => api<CardOut[]>('/public/clubs').then((rows) => rows.map(toCard)),
    staleTime: 5 * 60_000,
  })
}

export function usePublicClub(id: number | null) {
  return useQuery({
    queryKey: publicClubKeys.detail(id ?? 0),
    queryFn: () => api<DetailOut>(`/public/clubs/${id}`).then(toDetail),
    enabled: id != null,
  })
}

export function usePublicClubActivities(id: number | null) {
  return useQuery({
    queryKey: publicClubKeys.activities(id ?? 0),
    queryFn: () =>
      api<ActivityOut[]>(`/public/clubs/${id}/activities`).then((rows) => rows.map(toActivity)),
    enabled: id != null,
  })
}

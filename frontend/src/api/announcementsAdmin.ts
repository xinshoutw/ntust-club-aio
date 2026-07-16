// 行政端公告 API 層(權限鍵 aannounce):snake↔camel 與日期(ISO↔YYYY/MM/DD)轉換集中在此。
// ClubCascader 以「社團名稱字串」為 value,單一社團發布需要 club_id:
// 頁面沿用 api/adminClubs.useAdminClubs 的主檔(與 ClubCascader 同一快取),
// 以 resolveClubId 做名稱→id 對照(同時相容之後改傳 id 的情況)。
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'

const DATE_FMT = 'YYYY/MM/DD'
const toDisplayDate = (iso: string): string => dayjs(iso).format(DATE_FMT)
const toIsoDate = (display: string): string => dayjs(display, DATE_FMT).format('YYYY-MM-DD')

export type AnnouncementTarget = 'all' | 'attr' | 'club'

export interface AdminAnnouncement {
  id: number
  title: string
  content: string
  date: string // 發布日 YYYY/MM/DD
  scope: string // 全校 / 性質(頓號相連)/ 社團名稱
  takeoverUntil?: string // 蓋板截止 YYYY/MM/DD
  notify: boolean
}

interface AdminAnnouncementOut {
  id: number
  title: string
  content: string
  target_type: AnnouncementTarget
  attrs: string[] | null
  club_id: number | null
  club_name: string | null
  takeover_until: string | null
  notify: boolean
  is_auto: boolean
  created_at: string
}

const scopeOf = (a: AdminAnnouncementOut): string => {
  if (a.target_type === 'club') return a.club_name ?? '單一社團'
  if (a.target_type === 'attr') return (a.attrs ?? []).join('、')
  return '全校'
}

const toAnnouncement = (a: AdminAnnouncementOut): AdminAnnouncement => ({
  id: a.id,
  title: a.title,
  content: a.content,
  date: toDisplayDate(a.created_at),
  scope: scopeOf(a),
  takeoverUntil: a.takeover_until ? toDisplayDate(a.takeover_until) : undefined,
  notify: a.notify,
})

const keys = {
  all: ['adminAnnouncements'] as const,
  list: (p: { page: number; pageSize: number }) => ['adminAnnouncements', 'list', p] as const,
}

export function useAdminAnnouncements(p: { page: number; pageSize: number }) {
  return useQuery({
    queryKey: keys.list(p),
    queryFn: () =>
      apiPaged<AdminAnnouncementOut[]>(
        `/admin/announcements${qs({ page: p.page, page_size: p.pageSize })}`,
      ).then(({ data, total }) => ({ items: data.map(toAnnouncement), total })),
    placeholderData: keepPreviousData,
  })
}

// ---- 社團名稱 → id 對照(單一社團發布用) ----

export interface ClubRef {
  id: number
  name: string
}

/** ClubCascader 現況回傳社團名稱字串;若之後改為回傳 id(數字或數字字串)亦相容 */
export function resolveClubId(clubs: ClubRef[] | undefined, value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || !value) return undefined
  const byName = clubs?.find((c) => c.name === value)
  if (byName) return byName.id
  return /^\d+$/.test(value) ? Number(value) : undefined
}

// ---- 建立 / 蓋板 / 刪除 ----

export interface AnnouncementInput {
  title: string
  content: string
  target: AnnouncementTarget
  attrs?: string[]
  clubId?: number
  takeoverUntil?: string // YYYY/MM/DD;有值即開蓋板
  notify: boolean
}

export function useAnnouncementMutations() {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: keys.all })
  const create = useMutation({
    mutationFn: (b: AnnouncementInput) =>
      api<AdminAnnouncementOut>('/admin/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: b.title,
          content: b.content,
          target_type: b.target,
          attrs: b.target === 'attr' ? (b.attrs ?? []) : [],
          club_id: b.target === 'club' ? b.clubId : undefined,
          takeover: !!b.takeoverUntil,
          takeover_until: b.takeoverUntil ? toIsoDate(b.takeoverUntil) : undefined,
          notify: b.notify,
        }),
      }),
    onSuccess: invalidate,
  })
  // 蓋板切換:給日期=期限內社團每次登入全版顯示;null=關閉蓋板
  const setTakeover = useMutation({
    mutationFn: ({ id, until }: { id: number; until: string | null }) =>
      api<AdminAnnouncementOut>(`/admin/announcements/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ takeover_until: until ? toIsoDate(until) : null }),
      }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: number) => api<null>(`/admin/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  return { create, setTakeover, remove }
}

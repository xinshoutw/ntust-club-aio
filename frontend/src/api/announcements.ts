// 公告 API 層:總覽公告卡、蓋板公告(TakeoverOverlay)、通知鈴鐺共用同一查詢
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'

export interface Announcement {
  id: string
  title: string
  content: string // markdown 原文
  date: string
  scope: string
  takeoverUntil?: string
  dismissed?: boolean // 本社已勾「不再顯示」(蓋板不再出現)
  unread?: boolean // 晚於已讀水位線(鈴鐺紅點依據)
}

interface AnnouncementOut {
  id: number
  title: string
  content: string
  is_auto: boolean
  takeover_until: string | null
  created_at: string
  dismissed: boolean
  unread: boolean
}

const toAnnouncement = (a: AnnouncementOut): Announcement => ({
  id: String(a.id),
  title: a.title,
  content: a.content,
  date: dayjs(a.created_at).format('YYYY/MM/DD'),
  // 社團端 API 不回發布對象;is_auto=系統自動通知(如核准訊息),其餘為行政公告
  scope: a.is_auto ? '通知' : '公告',
  takeoverUntil: a.takeover_until ? dayjs(a.takeover_until).format('YYYY/MM/DD') : undefined,
  dismissed: a.dismissed,
  unread: a.unread,
})

// 總覽公告卡與鈴鐺共用近 20 筆
const PAGE_SIZE = 20

export const announcementKeys = {
  all: ['announcements'] as const,
  list: ['announcements', 'list'] as const,
  takeover: ['announcements', 'takeover'] as const,
}

export function useAnnouncements(enabled = true) {
  return useQuery({
    queryKey: announcementKeys.list,
    queryFn: () =>
      apiPaged<AnnouncementOut[]>(`/club/announcements${qs({ page: 1, page_size: PAGE_SIZE })}`).then(
        ({ data, total }) => ({ announcements: data.map(toAnnouncement), total }),
      ),
    enabled,
  })
}

/**
 * 蓋板公告:後端只回仍在期限內者。不能從「最新 20 筆」裡挑 —— 期限內但被後續
 * 公告擠出第一頁的蓋板會靜默失效(同時在線的蓋板不會多,一頁綽綽有餘)。
 */
export function useTakeoverAnnouncements(enabled = true) {
  return useQuery({
    queryKey: announcementKeys.takeover,
    queryFn: () =>
      apiPaged<AnnouncementOut[]>(
        `/club/announcements${qs({ page: 1, page_size: PAGE_SIZE, takeover: true })}`,
      ).then(({ data }) => data.map(toAnnouncement)),
    enabled,
  })
}

/** 蓋板「不再顯示」:跨裝置持久(DB);成功後刷新共用公告查詢 */
export function useDismissAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<null>(`/club/announcements/${id}/dismiss`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: announcementKeys.all }),
  })
}

/** 公告全部標為已讀(水位線前移):開啟鈴鐺或進入總覽時呼叫 */
export function useMarkAnnouncementsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<null>('/club/announcements/read', { method: 'POST' }),
    // 只動已讀水位線,蓋板的篩選結果不受影響 —— 每次進總覽都重抓一次蓋板是白打的
    onSuccess: () => qc.invalidateQueries({ queryKey: announcementKeys.list }),
  })
}

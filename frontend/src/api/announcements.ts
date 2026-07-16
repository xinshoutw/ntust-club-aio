// 公告 API 層:總覽公告卡、蓋板公告(TakeoverOverlay)、通知鈴鐺共用同一查詢
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiPaged, qs } from './client'

/** 與 features/activities/mock 的 Announcement 結構相容(AnnouncementModal 直接沿用) */
export interface Announcement {
  id: string
  title: string
  content: string // markdown 原文
  date: string
  scope: string
  takeoverUntil?: string
}

interface AnnouncementOut {
  id: number
  title: string
  content: string
  is_auto: boolean
  takeover_until: string | null
  created_at: string
}

const toAnnouncement = (a: AnnouncementOut): Announcement => ({
  id: String(a.id),
  title: a.title,
  content: a.content,
  date: dayjs(a.created_at).format('YYYY/MM/DD'),
  // 社團端 API 不回發布對象;is_auto=系統自動通知(如核准訊息),其餘為行政公告
  scope: a.is_auto ? '通知' : '公告',
  takeoverUntil: a.takeover_until ? dayjs(a.takeover_until).format('YYYY/MM/DD') : undefined,
})

// 三處共用近 20 筆:蓋板需涵蓋仍在期限內、但已非最新的公告
const PAGE_SIZE = 20

export const announcementKeys = { list: ['announcements', 'list'] as const }

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

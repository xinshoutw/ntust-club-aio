// 側欄徽章:一支查詢回該角色所有頁面的待辦數。
// 鍵即 nav item 的 key,前端不維護第二份對照表(後端 services/badges.py 是唯一真相)。
import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export type Badges = Record<string, number>

// 待辦數會被自己的操作改變(審完一件就少一件),但不需要即時:
// 停留在同一頁時每分鐘重抓一次,切回分頁時也重抓
const REFRESH_MS = 60_000

export function useBadges(enabled = true) {
  return useQuery({
    queryKey: ['badges'],
    queryFn: () => api<Badges>('/badges'),
    enabled,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    staleTime: REFRESH_MS,
  })
}

// 總覽頁 API 層:自 GET /club/activities 推導「待辦」與「進行中申請(活動)」
// (照原 mock 邏輯:結案期限=活動結束日 +1 個月,推導不儲存)
import { useQuery } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { fetchAllPages } from './fetchAll'
import type { StatusKey } from '../lib/status'

export interface OverviewTodo {
  id: number
  kind: 'locked' | 'closing_due'
  name: string
  deadline: string
  daysLeft: number
}

export interface TrackedItem {
  key: string
  name: string
  category: '活動' | '借用' | '線上申請'
  status: StatusKey
  path: string
}

interface ActivityOut {
  id: number
  name: string
  status: string
  end_date: string
  close_locked: boolean
  can_close: boolean
}

// 進行中=送審中/結案審核中/已核准(待辦理結案);草稿、退回、已結案不列入
const IN_PROGRESS = new Set([
  'pending_advisor',
  'pending_chief',
  'pending_dean',
  'closing_pending_advisor',
  'approved',
])

const closeDeadline = (a: ActivityOut): Dayjs => dayjs(a.end_date).add(1, 'month')

const trackedStatus = (a: ActivityOut): StatusKey => {
  if (a.close_locked) return 'locked'
  if (a.can_close) return 'closing_due'
  return a.status as StatusKey
}

// 掛 activities 前綴:送出/刪除活動時 useActivityMutations 的 invalidate 一併刷新總覽,
// 否則待辦與「進行中申請」會停在動作前的狀態
export const overviewKeys = { activities: ['activities', 'overview'] as const }

export function useOverviewActivities() {
  return useQuery({
    queryKey: overviewKeys.activities,
    queryFn: async () => {
      // 排除已結案:歷史大宗,總覽的待辦與進行中皆用不到
      const data = await fetchAllPages<ActivityOut>('/club/activities', {
        status: [
          'draft',
          'pending_advisor',
          'pending_chief',
          'pending_dean',
          'approved',
          'rejected',
          'closing_pending_advisor',
        ],
      })
      const today = dayjs().startOf('day')
      const todos: OverviewTodo[] = data
        .filter((a) => a.close_locked || a.can_close)
        .map((a) => ({
          id: a.id,
          kind: a.close_locked ? ('locked' as const) : ('closing_due' as const),
          name: a.name,
          deadline: closeDeadline(a).format('YYYY/MM/DD'),
          daysLeft: closeDeadline(a).startOf('day').diff(today, 'day'),
        }))
        // 已鎖定在前,其餘依期限近到遠
        .sort((x, y) => (x.kind === y.kind ? x.daysLeft - y.daysLeft : x.kind === 'locked' ? -1 : 1))
      const tracked: TrackedItem[] = data
        .filter((a) => IN_PROGRESS.has(a.status))
        .map((a) => ({
          key: `act-${a.id}`,
          name: a.name,
          category: '活動' as const,
          status: trackedStatus(a),
          path: '/activities',
        }))
      return { todos, tracked }
    },
  })
}

// 總覽頁 API 層:自 GET /club/activities 推導「待辦」與「進行中申請(活動)」
// (結案期限、鎖定與可結案一律讀後端推導的欄位,鎖定月數在系統設定可調)
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
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
  close_deadline: string | null
}

// 進行中=送審中/結案審核中/已核准(待辦理結案);草稿、退回、已結案不列入。
// 這份清單同時是向後端要的 status 篩選(待辦的鎖定/可結案都落在「已核准」裡)
const IN_PROGRESS = [
  'pending_advisor',
  'pending_chief',
  'pending_dean',
  'closing_pending_advisor',
  'approved',
] as const

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
      // 只要這頁真的會顯示的狀態:草稿、退回與已結案都不進待辦也不進「進行中」,
      // 抓回來只會是白工(已結案更是歷史大宗)
      const data = await fetchAllPages<ActivityOut>('/club/activities', {
        status: [...IN_PROGRESS],
      })
      const today = dayjs().startOf('day')
      const todos: OverviewTodo[] = data
        .filter((a) => a.close_locked || a.can_close)
        .map((a) => ({
          id: a.id,
          kind: a.close_locked ? ('locked' as const) : ('closing_due' as const),
          name: a.name,
          // 期限一律用後端算的(鎖定月數在系統設定可調,前端自己 +1 個月會整片錯)
          deadline: a.close_deadline ? dayjs(a.close_deadline).format('YYYY/MM/DD') : '—',
          daysLeft: a.close_deadline ? dayjs(a.close_deadline).startOf('day').diff(today, 'day') : 0,
        }))
        // 已鎖定在前,其餘依期限近到遠
        .sort((x, y) => (x.kind === y.kind ? x.daysLeft - y.daysLeft : x.kind === 'locked' ? -1 : 1))
      // 回來的每一列都是進行中(狀態已由後端篩),不再於此二度過濾
      const tracked: TrackedItem[] = data
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

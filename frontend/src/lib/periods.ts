import dayjs, { type Dayjs } from 'dayjs'
import { useAuth } from '../app/auth'
import type { Period } from '../api/auth'

// 節次(第 1–10 節、A–D 節)的單一真相在後端 services/booking_service.PERIOD_TIMES,
// 隨 /auth/me 下發。借用頁全在 RequireRole 之後,取用時 user 必定已就緒。

export function usePeriods(): Period[] {
  return useAuth().user?.periods ?? []
}

/** 節次排序權重:數字節在前、字母節在後。
 *  純轉換函式(`api/*.ts` 的 snake→camel)拿不到 hook,而它們只需要順序、不需要時刻。
 *  與後端 `booking_service.PERIODS` 的順序等價,由 periods.test.ts 對整份目錄釘住。 */
export const periodRank = (key: string): number =>
  /^\d+$/.test(key) ? Number(key) : 100 + key.charCodeAt(0)

/** 節次鍵,依上課順序 —— 畫面的節次軸 */
export const periodKeys = (periods: readonly Period[]): string[] => periods.map((p) => p.key)

/** 借用起始時刻=最早節次的起點(picked 不保證有序);date 為顯示格式 YYYY/MM/DD。
 *  目錄裡查不到那一節時回 invalid —— 拿不到時刻就是拿不到,不可以用 00:00 頂替
 *  (那會讓每一張單都算成「凌晨就開始了」,取消鈕全部消失)。 */
export const bookingStartAt = (periods: readonly Period[], date: string, picked: string[]): Dayjs => {
  const first = [...picked].sort((a, b) => periodRank(a) - periodRank(b))[0]
  const start = periods.find((p) => p.key === first)?.start
  return start ? dayjs(`${date} ${start}`, 'YYYY/MM/DD HH:mm') : dayjs(null)
}

/** 是否已過申請起始時刻(含相等=已開始;與後端 booking_started 同規則)。
 *  算不出起始時刻時一律回 false:「還沒開始」讓使用者按得到取消鈕,後端會再擋一次;
 *  反過來就是把還能取消的單變成不能取消,而且畫面上看不出原因。 */
export const bookingStarted = (periods: readonly Period[], date: string, picked: string[]): boolean => {
  const start = bookingStartAt(periods, date, picked)
  return picked.length > 0 && start.isValid() && !start.isAfter(dayjs())
}

/** 現在時刻已開始的節次(起點 ≤ now):選「今天」時禁選用 */
export const startedPeriods = (periods: readonly Period[]): string[] => {
  const now = dayjs().format('HH:mm')
  return periods.filter((p) => p.start <= now).map((p) => p.key)
}

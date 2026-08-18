import dayjs, { type Dayjs } from 'dayjs'
import { useAuth } from '../app/auth'
import type { Period } from '../api/auth'

// 節次(第 1–10 節、A–D 節)的單一真相在後端 services/booking_service.PERIOD_TIMES,
// 隨 /auth/me 下發。借用頁全在 RequireRole 之後,取用時 user 必定已就緒。

export function usePeriods(): Period[] {
  return useAuth().user?.periods ?? []
}

/** 節次鍵,依上課順序 —— 畫面的節次軸 */
export const periodKeys = (periods: readonly Period[]): string[] => periods.map((p) => p.key)

/** 借用起始時刻=最早節次的起點(picked 不保證有序);date 為顯示格式 YYYY/MM/DD */
export const bookingStartAt = (periods: readonly Period[], date: string, picked: string[]): Dayjs => {
  const keys = periodKeys(periods)
  const first = [...picked].sort((a, b) => keys.indexOf(a) - keys.indexOf(b))[0]
  return dayjs(`${date} ${periods.find((p) => p.key === first)?.start ?? '00:00'}`, 'YYYY/MM/DD HH:mm')
}

/** 是否已過申請起始時刻(含相等=已開始;與後端 booking_started 同規則) */
export const bookingStarted = (periods: readonly Period[], date: string, picked: string[]): boolean =>
  picked.length > 0 && !bookingStartAt(periods, date, picked).isAfter(dayjs())

/** 現在時刻已開始的節次(起點 ≤ now):選「今天」時禁選用 */
export const startedPeriods = (periods: readonly Period[]): string[] => {
  const now = dayjs().format('HH:mm')
  return periods.filter((p) => p.start <= now).map((p) => p.key)
}

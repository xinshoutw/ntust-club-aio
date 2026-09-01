import { useAuth } from '../app/auth'

/** 借用免綁活動的帳號:代碼與社團名稱兩者皆符(D-36)。
 *  後端同一份判定在 `api/v1/bookings._skips_activity`。
 *
 *  比的是活的 `Club.name`(`user.club`)而不是 `user.name` —— 後者是建帳當下的快照,
 *  社團改名只寫 `Club.name`,全系統沒有第二支 API 更新得了它,拿它比就變成「改完名還繼續免綁」。 */
export function useNoActivityAccount(): boolean {
  const { user } = useAuth()
  return user?.username === '802' && user.club === '國際事務處'
}

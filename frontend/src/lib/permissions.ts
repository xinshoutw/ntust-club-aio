import type { SessionUser } from '../api/auth'

// 行政端路由守衛。權限鍵、路徑與例外規則全部來自後端目錄表(core/permissions.ADMIN_PAGES,
// 隨 /auth/me 送達),前端不再自行維護一份對照 —— 舊版那份與後端對不上,
// 報名管理的鍵一度被標成「活動管理」。

/** 該管理員可否進入此 admin 路徑;/admin 總覽對所有管理員開放 */
export function canAccessAdminPath(user: SessionUser | null | undefined, path: string): boolean {
  if (!user || user.role !== 'admin') return false
  if (user.isSuper) return true
  const page = (user.adminPages ?? []).find((p) =>
    p.paths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)),
  )
  // 目錄表沒有的路徑只剩總覽;其餘一律當成未授權(fail-closed)
  if (!page) return path === '/admin' || path === '/admin/'
  return [page.key, ...page.also].some((k) => user.permissions.includes(k))
}

/**
 * 能不能對這個帳號動手(刪除 / 停用 / 重設密碼 / 調整權限)。
 *
 * 後端 `admin_accounts._guard_target` 是唯一權威,這裡只是不要畫出按了必定 409/403 的鈕。
 * 三條與後端逐條對應;第三條不是潔癖 —— 少了它,只持 `aaccount` 的人可以重設同儕或
 * superadmin 的密碼,拿一次性密碼登入就取得了自己授不出去的權限。
 *
 * @returns 不可操作時回原因(給 Tooltip),可操作時回 null
 */
export function accountGuardReason(
  me: SessionUser | null | undefined,
  target: { id: number; isSuper: boolean; permissions: string[] },
): string | null {
  if (!me) return '尚未載入登入資訊'
  if (target.id === me.id) return '不可調整自己的帳號'
  if (target.isSuper) return '不可調整最高權限帳號'
  if (me.isSuper) return null
  const beyond = target.permissions.filter((k) => !me.permissions.includes(k))
  return beyond.length ? '對方持有你沒有的權限,不可調整其帳號' : null
}

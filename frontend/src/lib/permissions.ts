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

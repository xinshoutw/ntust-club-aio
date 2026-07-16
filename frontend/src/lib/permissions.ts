import type { SessionUser } from '../api/auth'

// 各 admin 路由所需權限鍵(any-of;super 全通;空陣列=僅 super)。
// 對齊 backend 各 router 的 require_permission/require_super:
// 申請審核頁對簽核關卡鍵開放(學務長受限帳號僅持 approve_dean 也要能進待審頁);
// 結案審核=aclose 或結案單關的 approve_advisor
const ROUTE_KEYS: [string, string[]][] = [
  ['/admin/review', ['areview', 'aact', 'approve_advisor', 'approve_chief', 'approve_dean']],
  ['/admin/close-review', ['aclose', 'approve_advisor']],
  ['/admin/signup-items', ['areg', 'asignup']],
  ['/admin/signups', ['areg', 'asignup']],
  ['/admin/announcements', ['aannounce']],
  ['/admin/bookings', ['abooking']],
  ['/admin/rooms', ['aroom']],
  ['/admin/club-overview', ['amember']],
  ['/admin/members', ['amember']],
  ['/admin/club-settings', ['amember']],
  ['/admin/overdue', []],
  ['/admin/eval', ['aeval']],
  ['/admin/accounts', []],
  ['/admin/maintenance', ['amaint']],
  ['/admin/violations', ['aviol']],
  ['/admin/files', ['afiles']],
  ['/admin/settings', []],
  ['/admin/audit', []],
]

/** 該管理員可否進入此 admin 路徑;/admin 總覽對所有管理員開放 */
export function canAccessAdminPath(user: SessionUser | null | undefined, path: string): boolean {
  if (!user || user.role !== 'admin') return false
  if (user.isSuper) return true
  const entry = ROUTE_KEYS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))
  if (!entry) return path === '/admin' || path === '/admin/'
  return entry[1].some((k) => user.permissions.includes(k))
}

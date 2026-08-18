import { describe, expect, test } from 'vitest'
import { canAccessAdminPath } from './permissions'
import type { AdminPage, SessionUser } from '../api/auth'

// 後端 core/permissions.ADMIN_PAGES 的形狀,取其中幾筆
const PAGES: AdminPage[] = [
  { key: 'areview', label: '申請審核', paths: ['/admin/review'], also: ['approve_advisor', 'approve_chief', 'approve_dean'] },
  { key: 'asignup', label: '報名管理', paths: ['/admin/signups', '/admin/signup-items'], also: [] },
  { key: 'aaudit', label: '稽核軌跡', paths: ['/admin/audit'], also: [] },
]

const admin = (permissions: string[], extra: Partial<SessionUser> = {}): SessionUser => ({
  id: 1,
  role: 'admin',
  username: 'a',
  name: '承辦',
  isSuper: false,
  permissions,
  canViewEval: false,
  mustChangePassword: false,
  periods: [],
  adminPages: PAGES,
  ...extra,
})

describe('canAccessAdminPath', () => {
  test('持該頁的鍵才進得去', () => {
    expect(canAccessAdminPath(admin(['areview']), '/admin/review')).toBe(true)
    expect(canAccessAdminPath(admin(['asignup']), '/admin/review')).toBe(false)
  })

  test('子路徑跟著主路徑走', () => {
    expect(canAccessAdminPath(admin(['areview']), '/admin/review/12')).toBe(true)
  })

  test('一把鍵管兩個入口:報名清單與報名活動建立', () => {
    const u = admin(['asignup'])
    expect(canAccessAdminPath(u, '/admin/signups')).toBe(true)
    expect(canAccessAdminPath(u, '/admin/signup-items/new')).toBe(true)
  })

  test('簽核關卡帳號進得了審核頁 —— 學務長只持 approve_dean', () => {
    expect(canAccessAdminPath(admin(['approve_dean']), '/admin/review')).toBe(true)
    // 但那把鍵不該開別頁
    expect(canAccessAdminPath(admin(['approve_dean']), '/admin/audit')).toBe(false)
  })

  test('最高權限全通,連目錄表都不必有', () => {
    expect(canAccessAdminPath(admin([], { isSuper: true, adminPages: undefined }), '/admin/audit')).toBe(true)
  })

  test('總覽對所有管理員開放', () => {
    expect(canAccessAdminPath(admin([]), '/admin')).toBe(true)
  })

  test('目錄表沒送到就當作沒有權限,不可 fail-open', () => {
    const u = admin(['aaudit'], { adminPages: undefined })
    expect(canAccessAdminPath(u, '/admin/audit')).toBe(false)
  })

  test('非管理員一律不通', () => {
    expect(canAccessAdminPath(admin(['aaudit'], { role: 'club' }), '/admin/audit')).toBe(false)
    expect(canAccessAdminPath(null, '/admin')).toBe(false)
  })

  test('目錄表沒有的行政路徑不放行', () => {
    expect(canAccessAdminPath(admin(['aaudit']), '/admin/unknown-page')).toBe(false)
  })
})

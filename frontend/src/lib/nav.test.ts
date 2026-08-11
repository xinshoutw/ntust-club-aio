import { describe, expect, test } from 'vitest'
import { buildAdminNav, buildClubNav, type NavGroup } from './nav'
import type { SessionUser } from '../api/auth'

const findItem = (groups: NavGroup[], key: string) =>
  groups.flatMap((g) => g.items).find((i) => i.key === key)

const superUser: SessionUser = {
  id: 1,
  role: 'admin',
  username: 'super',
  name: '學務處',
  isSuper: true,
  permissions: [],
  canViewEval: true,
  mustChangePassword: false,
}

describe('固定場地借用的側欄項目', () => {
  test('開放窗關閉:反灰並附受理期間', () => {
    const item = findItem(buildClubNav({ open: false, openFrom: '2026/09/01', openUntil: '2026/09/14' }), 'booking-fixed')
    expect(item?.disabled).toBe(true)
    expect(item?.disabledHint).toContain('2026/09/01')
  })

  test('開放窗查詢失敗:項目仍可點,否則頁面裡的錯誤與重試永遠到不了', () => {
    const item = findItem(buildClubNav(undefined, true), 'booking-fixed')
    expect(item?.disabled).toBeFalsy()
  })

  test('行政端同一條規則', () => {
    expect(findItem(buildAdminNav(superUser, 0, 0, { open: false }), 'a-room')?.disabled).toBe(true)
    expect(findItem(buildAdminNav(superUser, 0, 0, undefined, true), 'a-room')?.disabled).toBeFalsy()
  })
})

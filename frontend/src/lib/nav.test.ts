import { describe, expect, test } from 'vitest'
import { buildAdminNav, buildClubNav, type NavGroup } from './nav'
import type { SessionUser } from '../api/auth'

const findItem = (groups: NavGroup[], key: string) =>
  groups.flatMap((g) => g.items).find((i) => i.key === key)

/** 項目所在分組的標題(未分組為 undefined):可點但被丟到「其他」也算沒修好 */
const groupOf = (groups: NavGroup[], key: string) =>
  groups.find((g) => g.items.some((i) => i.key === key))?.label

const superUser: SessionUser = {
  id: 1,
  role: 'admin',
  username: 'super',
  name: '學務處',
  isSuper: true,
  permissions: [],
  canViewEval: true,
  mustChangePassword: false,
  periods: [],
}

describe('固定場地借用的側欄項目', () => {
  test('開放窗關閉:反灰並附受理期間', () => {
    const item = findItem(buildClubNav({ open: false, openFrom: '2026/09/01', openUntil: '2026/09/14' }), 'booking-fixed')
    expect(item?.disabled).toBe(true)
    expect(item?.disabledHint).toContain('2026/09/01')
  })

  test('開放窗查詢失敗:項目仍可點,否則頁面裡的錯誤與重試永遠到不了', () => {
    const nav = buildClubNav(undefined, true)
    const item = findItem(nav, 'booking-fixed')
    // 明確斷言存在:`item?.disabled` 在「項目整個不見」時也是 undefined(恆真)
    expect(item).toBeDefined()
    expect(item?.disabled).toBeFalsy()
    // 也不能被丟到「其他」——那是開放窗外的位置
    expect(groupOf(nav, 'booking-fixed')).toBe('空間與器材借用')
  })

  test('行政端同一條規則', () => {
    expect(findItem(buildAdminNav(superUser, 0, 0, { open: false }), 'a-room')?.disabled).toBe(true)
    const nav = buildAdminNav(superUser, 0, 0, undefined, true)
    expect(findItem(nav, 'a-room')).toBeDefined()
    expect(findItem(nav, 'a-room')?.disabled).toBeFalsy()
  })
})

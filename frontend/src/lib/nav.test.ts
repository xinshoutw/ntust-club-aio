import { describe, expect, test } from 'vitest'
import { buildAdminNav, buildClubNav, buildPtNav, buildViewerNav, type NavGroup } from './nav'
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
    const item = findItem(buildClubNav({ open: false, state: 'closed', openFrom: '2026/09/01', openUntil: '2026/09/14' }), 'booking-fixed')
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

  test('行政端不吃開放窗:受理期間只擋社團送件,承辦全年都要審得到', () => {
    const nav = buildAdminNav(superUser)
    expect(findItem(nav, 'a-room')?.disabled).toBeFalsy()
    expect(groupOf(nav, 'a-room')).toBe('借用審核')
  })
})

describe('側欄徽章', () => {
  test('依 key 掛到對應項目;0 與未回傳都不顯示', () => {
    const nav = buildAdminNav(superUser, { 'a-review': 3, 'a-close': 0 })
    expect(findItem(nav, 'a-review')?.badge).toBe(3)
    expect(findItem(nav, 'a-close')?.badge).toBeUndefined()
    expect(findItem(nav, 'a-booking')?.badge).toBeUndefined()
  })

  test('四端都吃同一份徽章', () => {
    expect(findItem(buildClubNav(undefined, true, { 'act-close': 2 }), 'act-close')?.badge).toBe(2)
    expect(findItem(buildPtNav({ 'pt-overdue': 5 }), 'pt-overdue')?.badge).toBe(5)
    expect(findItem(buildViewerNav({ 'v-my': 1 }), 'v-my')?.badge).toBe(1)
  })
})

describe('行政端活動查閱的兩頁', () => {
  /** 分組內的位置:需求方指定了「插在哪兩項之間」,列表順序本身就是規格 */
  const keysOf = (groups: NavGroup[], label: string) =>
    groups.find((g) => g.label === label)?.items.map((i) => i.key)

  test('所有活動排在活動審核分組最後', () => {
    expect(keysOf(buildAdminNav(superUser), '活動審核')).toEqual(['a-review', 'a-close', 'a-activities'])
  })

  test('活動列表夾在成員列表與管理項目之間', () => {
    expect(keysOf(buildAdminNav(superUser), '社團管理')).toEqual([
      'a-club-overview',
      'a-members',
      'a-club-activities',
      'a-club-settings',
      'a-overdue',
    ])
  })

  test('受限管理員只看得到自己那把鍵的那一頁', () => {
    const holder: SessionUser = {
      ...superUser,
      isSuper: false,
      permissions: ['aclubact'],
      adminPages: [
        { key: 'aactivity', label: '所有活動', paths: ['/admin/activities'], also: [] },
        { key: 'aclubact', label: '社團活動列表', paths: ['/admin/club-activities'], also: [] },
      ],
    }
    const nav = buildAdminNav(holder)
    expect(findItem(nav, 'a-club-activities')).toBeDefined()
    expect(findItem(nav, 'a-activities')).toBeUndefined()
  })
})

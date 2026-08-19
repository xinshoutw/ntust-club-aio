import { describe, expect, it } from 'vitest'
import { resolveClubId } from './announcementsAdmin'

const CLUBS = [
  { id: 3, name: '資工系學會' },
  { id: 7, name: '登山社' },
]

describe('resolveClubId', () => {
  it('社團名稱字串 → id(ClubCascader 現行介面)', () => {
    expect(resolveClubId(CLUBS, '登山社')).toBe(7)
  })

  it('相容之後改傳 id 的情況:數字與數字字串皆可', () => {
    expect(resolveClubId(CLUBS, 3)).toBe(3)
    expect(resolveClubId(CLUBS, '42')).toBe(42)
  })

  it('無法識別時回 undefined', () => {
    expect(resolveClubId(CLUBS, '不存在的社')).toBeUndefined()
    expect(resolveClubId(CLUBS, '')).toBeUndefined()
    expect(resolveClubId(undefined, '登山社')).toBeUndefined()
    expect(resolveClubId(CLUBS, null)).toBeUndefined()
  })
})

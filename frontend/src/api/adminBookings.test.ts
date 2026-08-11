import { describe, expect, it } from 'vitest'
import { roomConflictSlots, slotsToEntries, type AdminRoomRequest } from './adminBookings'

describe('slotsToEntries', () => {
  it('依星期分組並照課表節次排序(數字節次在前、A–D 在後)', () => {
    const entries = slotsToEntries([
      { weekday: 3, period: 'A' },
      { weekday: 1, period: '4' },
      { weekday: 3, period: '10' },
      { weekday: 1, period: '3' },
      { weekday: 3, period: '9' },
    ])
    expect(entries).toEqual([
      { dow: 1, periods: ['3', '4'] },
      { dow: 3, periods: ['9', '10', 'A'] },
    ])
  })

  it('空 slots 回空陣列', () => {
    expect(slotsToEntries([])).toEqual([])
  })
})

const request = (
  apiId: number,
  venueId: number,
  entries: AdminRoomRequest['entries'],
  term: [string, string] = ['2026/08/01', '2027/01/31'],
  status: AdminRoomRequest['status'] = 'pending',
): AdminRoomRequest => ({
  id: String(apiId),
  apiId,
  venueId,
  club: `社團${apiId}`,
  room: `場地${venueId}`,
  entries,
  note: '',
  status,
  startDate: term[0],
  endDate: term[1],
})

const approved = (
  apiId: number,
  venueId: number,
  entries: AdminRoomRequest['entries'],
  term: [string, string] = ['2026/08/01', '2027/01/31'],
) => request(apiId, venueId, entries, term, 'approved')

describe('roomConflictSlots', () => {
  it('兩社搶同場地同星期同節次才算衝突', () => {
    const conflicts = roomConflictSlots([
      request(1, 7, [{ dow: 1, periods: ['3', '4'] }]),
      request(2, 7, [{ dow: 1, periods: ['4', '5'] }]), // 只有第 4 節重疊
      request(3, 9, [{ dow: 1, periods: ['4'] }]), // 別的場地不算
    ])
    expect([...(conflicts.get(1) ?? [])]).toEqual([['1|4', 'pending']])
    expect([...(conflicts.get(2) ?? [])]).toEqual([['1|4', 'pending']])
    expect(conflicts.get(3)).toBeUndefined()
  })

  it('目標學期不重疊就不是衝突(後端也只擋區間重疊的已核准單)', () => {
    const conflicts = roomConflictSlots([
      request(1, 7, [{ dow: 1, periods: ['3'] }], ['2026/08/01', '2027/01/31']),
      request(2, 7, [{ dow: 1, periods: ['3'] }], ['2027/02/01', '2027/07/31']),
    ])
    expect(conflicts.size).toBe(0)
  })

  it('同一張申請單自己不會跟自己衝突', () => {
    const conflicts = roomConflictSlots([
      request(1, 7, [{ dow: 1, periods: ['3'] }, { dow: 1, periods: ['3'] }]),
    ])
    expect(conflicts.size).toBe(0)
  })

  it('撞到已核准單標 taken(核准會吃 409,不是擇一核准)', () => {
    const conflicts = roomConflictSlots(
      [request(1, 7, [{ dow: 2, periods: ['5'] }])],
      [approved(9, 7, [{ dow: 2, periods: ['5'] }])],
    )
    expect(conflicts.get(1)?.get('2|5')).toBe('taken')
  })

  it('同時撞到待審與已核准時以 taken 為準(能做的只剩退回)', () => {
    const conflicts = roomConflictSlots(
      [request(1, 7, [{ dow: 2, periods: ['5'] }]), request(2, 7, [{ dow: 2, periods: ['5'] }])],
      [approved(9, 7, [{ dow: 2, periods: ['5'] }])],
    )
    expect(conflicts.get(1)?.get('2|5')).toBe('taken')
    expect(conflicts.get(2)?.get('2|5')).toBe('taken')
  })

  it('已核准單本身不列衝突(只標待審單,已核准的不必再擇一)', () => {
    const conflicts = roomConflictSlots(
      [request(1, 7, [{ dow: 2, periods: ['5'] }])],
      [approved(9, 7, [{ dow: 2, periods: ['5'] }])],
    )
    expect(conflicts.get(9)).toBeUndefined()
  })
})

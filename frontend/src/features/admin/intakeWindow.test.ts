import { describe, expect, test } from 'vitest'
import { intakeNote } from './intakeWindow'
import type { FixedWindow } from '../../api/bookings'

const w = (over: Partial<FixedWindow>): FixedWindow => ({
  open: false,
  state: 'closed',
  openFrom: '2026/09/01',
  openUntil: '2026/09/15',
  ...over,
})

// 「還沒開始」與「已經結束」對承辦是相反的兩句話:排好下一輪受理期間之後
// 看到「受理期間已結束」的話,他會以為自己設錯了
describe('intakeNote', () => {
  test('受理中不出橫幅', () => {
    expect(intakeNote(w({ state: 'open', open: true }))).toBeNull()
  })

  test('查不到受理期間也不出橫幅:清單與審核照常', () => {
    expect(intakeNote(undefined)).toBeNull()
  })

  test('尚未開始講「尚未開始」,不是「已結束」', () => {
    const note = intakeNote(w({ state: 'upcoming' }))
    expect(note).toContain('尚未開始')
    expect(note).not.toContain('已結束')
    expect(note).toContain('2026/09/01')
  })

  test('已結束講「已結束」', () => {
    expect(intakeNote(w({ state: 'closed' }))).toContain('已結束')
  })

  test('沒設定就說沒設定,不硬掰日期', () => {
    const note = intakeNote(w({ state: 'unset', openFrom: undefined, openUntil: undefined }))
    expect(note).toContain('尚未設定')
    expect(note).not.toContain('(')
  })

  test('三種都要說社團送不出申請 —— 橫幅的重點是「社團端停了」,不是「這頁停了」', () => {
    for (const state of ['unset', 'upcoming', 'closed'] as const) {
      expect(intakeNote(w({ state }))).toContain('社團無法送出申請')
    }
  })
})

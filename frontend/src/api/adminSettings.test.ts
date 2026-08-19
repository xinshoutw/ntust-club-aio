import { describe, expect, it } from 'vitest'
import { evalWindowOf, evalYearLabel } from './adminSettings'

describe('evalWindowOf', () => {
  it('民國 116 年 → 2026/02/01–2027/01/31(後端預設一致)', () => {
    expect(evalWindowOf(116)).toEqual({ start: '2026-02-01', end: '2027-01-31' })
  })

  it('民國 117 年 → 2027/02/01–2028/01/31', () => {
    expect(evalWindowOf(117)).toEqual({ start: '2027-02-01', end: '2028-01-31' })
  })
})

describe('evalYearLabel', () => {
  it('顯示年度與採計區間', () => {
    expect(evalYearLabel(116)).toBe('116 年(採計 2026/02/01 – 2027/01/31)')
  })
})

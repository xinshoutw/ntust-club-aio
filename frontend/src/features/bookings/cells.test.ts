import { describe, expect, it } from 'vitest'
import { CELL, USAGE_SCALE, usageStep } from './cells'

describe('usageStep', () => {
  it('比例落在哪一階以下界為準(邊界值取較高的那一階)', () => {
    expect(usageStep(0, 10).label).toBe('未滿 30%')
    expect(usageStep(2, 10).label).toBe('未滿 30%') // 20%
    expect(usageStep(3, 10).label).toBe('30% 以上')
    expect(usageStep(5, 10).label).toBe('50% 以上')
    expect(usageStep(7, 10).label).toBe('70% 以上')
    expect(usageStep(9, 10).label).toBe('70% 以上') // 90% 未達 99%
    expect(usageStep(199, 200).label).toBe('99% 以上')
    expect(usageStep(10, 10).label).toBe('已借滿')
  })

  it('借滿與固定借用同色;總數 0(借不到)也算借滿', () => {
    expect(usageStep(10, 10).bg).toBe(CELL.fixed.bg)
    expect(usageStep(0, 0).label).toBe('已借滿')
  })

  it('色階由低到高排列,圖例才照得出順序', () => {
    const mins = USAGE_SCALE.map((s) => s.min)
    expect(mins).toEqual([...mins].sort((a, b) => a - b))
  })
})

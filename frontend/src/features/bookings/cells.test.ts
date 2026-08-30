import { describe, expect, it } from 'vitest'
import { CELL, USAGE_SCALE, usageStep } from './cells'

// 比對階別本身而不是文案:圖例字句會調,落在哪一階才是這支要守的規則
const [NONE, YELLOW, ORANGE, RED, PURPLE, FULL] = USAGE_SCALE

describe('usageStep', () => {
  it('預設色只留給完全沒借用,借出一件就進下一階', () => {
    expect(usageStep(0, 10)).toBe(NONE)
    expect(usageStep(1, 100)).toBe(YELLOW) // 1%
  })

  it('比例落在哪一階以上界為準(邊界值取較低的那一階)', () => {
    expect(usageStep(3, 10)).toBe(YELLOW) // 30%
    expect(usageStep(4, 10)).toBe(ORANGE)
    expect(usageStep(5, 10)).toBe(ORANGE) // 50%
    expect(usageStep(6, 10)).toBe(RED)
    expect(usageStep(7, 10)).toBe(RED) // 70%
    expect(usageStep(8, 10)).toBe(PURPLE)
    expect(usageStep(199, 200)).toBe(PURPLE) // 99.5%:還沒借滿就不算額滿
    expect(usageStep(10, 10)).toBe(FULL)
  })

  it('額滿與固定借用同色;總數 0(借不到)也算額滿', () => {
    expect(FULL.bg).toBe(CELL.fixed.bg)
    expect(usageStep(0, 0)).toBe(FULL)
  })

  it('色階由低到高排列,圖例才照得出順序', () => {
    const maxes = USAGE_SCALE.map((s) => s.max)
    expect(maxes).toEqual([...maxes].sort((a, b) => a - b))
  })
})

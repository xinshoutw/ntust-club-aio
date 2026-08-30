import { describe, expect, it } from 'vitest'
import { taskAlignEm } from './types'

describe('taskAlignEm', () => {
  it('全部長度相近時取最長的', () => {
    expect(taskAlignEm(['器材組', '活動組', '召組'])).toBe(3)
  })

  it('與最短相差超過 3 字的項目不參與對齊', () => {
    // 「文化指揮」4 字,長句 12 字 → 差 8,長句不算;其餘最長 6 字
    expect(taskAlignEm(['文化指揮', '副召:解決突發狀況', '場器長:管理'])).toBe(6)
  })

  it('剛好差 3 字仍算進來(邊界)', () => {
    expect(taskAlignEm(['社長', '譜務長', '活動長組'])).toBe(4)
    expect(taskAlignEm(['社長', '五個字的項目'])).toBe(2)
  })

  it('空字串不影響(遷移資料可能只有負責人沒有項目)', () => {
    expect(taskAlignEm(['', '器材組', ''])).toBe(3)
    expect(taskAlignEm(['', ''])).toBe(0)
    expect(taskAlignEm([])).toBe(0)
  })
})

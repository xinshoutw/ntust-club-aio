import { describe, expect, it } from 'vitest'
import { numColWidth } from './types'

describe('numColWidth', () => {
  it('以最寬的數字為準(含千分位逗號)', () => {
    expect(numColWidth([0, 129100, 5600], 16)).toBe('calc(7ch + 16px)') // "129,100"
    expect(numColWidth([999999], 16)).toBe('calc(7ch + 16px)')
    expect(numColWidth([1000], 16)).toBe('calc(5ch + 16px)') // "1,000"
  })

  it('整欄都是小數字時仍留得下欄名', () => {
    expect(numColWidth([0, 0, 0], 16)).toBe('calc(4ch + 16px)')
    expect(numColWidth([], 16)).toBe('calc(4ch + 16px)')
  })

  it('內距分開給:輸入框要比純文字欄多留邊框與 padding', () => {
    expect(numColWidth([129100], 30)).toBe('calc(7ch + 30px)')
  })
})

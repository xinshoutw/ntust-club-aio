import { describe, expect, test } from 'vitest'
import { countText } from './counts'

const ok = { isPending: false, isError: false }

describe('countText', () => {
  test('查詢就緒才顯示數字', () => {
    expect(countText(0, ok)).toBe('0')
    expect(countText(1234, ok)).toBe('1,234')
  })

  test('載入中與失敗都顯示 —,不拿 0 當預設值', () => {
    expect(countText(0, { isPending: true, isError: false })).toBe('—')
    expect(countText(0, { isPending: false, isError: true })).toBe('—')
  })

  test('多支查詢的加總只要有一支沒就緒就是 —,不顯示殘缺數字', () => {
    expect(countText(3, ok, { isPending: true, isError: false })).toBe('—')
    expect(countText(3, ok, { isPending: false, isError: true })).toBe('—')
    expect(countText(3, ok, ok)).toBe('3')
  })
})

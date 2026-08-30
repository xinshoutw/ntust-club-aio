import { describe, expect, it } from 'vitest'
import { clampPage } from './paging'

// 停在第 3 頁時清單縮短,頁碼會指到不存在的那一頁:卡片只剩標題,而空狀態只在
// 「一筆都沒有」時出現 —— 使用者看到的是一張空卡,沒有任何線索也回不去。
describe('clampPage', () => {
  it('頁碼還在範圍內就原樣回傳(才不會來回觸發)', () => {
    expect(clampPage(3, 25, 10)).toBe(3)
    expect(clampPage(1, 5, 10)).toBe(1)
  })

  it('清單縮短後收到最後一頁', () => {
    expect(clampPage(3, 12, 10)).toBe(2)
    expect(clampPage(9, 1, 10)).toBe(1)
  })

  it('清單清空時回第 1 頁,不是第 0 頁', () => {
    expect(clampPage(4, 0, 10)).toBe(1)
  })
})

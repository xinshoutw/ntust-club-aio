import { describe, expect, test } from 'vitest'
import { rowsThatFit } from './fitRows'

describe('rowsThatFit', () => {
  test('放得下幾整列就是幾列,不四捨五入', () => {
    // 470 高、47 一列 = 剛好 10 列;再少一點也只能放 9 列(第 10 列會被切一半)
    expect(rowsThatFit(470, 47, 5)).toBe(10)
    expect(rowsThatFit(469, 47, 5)).toBe(9)
  })

  test('視窗再矮也給下限:0 列的表看不出是空的還是壞的', () => {
    expect(rowsThatFit(100, 47, 5)).toBe(5)
    expect(rowsThatFit(-300, 47, 5)).toBe(5)
  })
})

import { describe, expect, it } from 'vitest'
import { termOptions } from './applications'

describe('termOptions', () => {
  it('每個學年度先列整學年、再列該學年的學期,學年由新到舊', () => {
    expect(termOptions(['114-2', '115-1', '114-1']).map((o) => o.value)).toEqual([
      '115',
      '115-1',
      '114',
      '114-1',
      '114-2',
    ])
  })

  it('只有單一學期時仍列得出整學年', () => {
    expect(termOptions(['114-1']).map((o) => o.value)).toEqual(['114', '114-1'])
  })

  it('名單沒有資料就不給任何選項 —— 後端逐字比對,選了也只會被擋', () => {
    expect(termOptions([])).toEqual([])
  })
})

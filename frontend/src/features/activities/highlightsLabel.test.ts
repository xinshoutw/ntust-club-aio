import { describe, expect, it } from 'vitest'
import { highlightsLabel } from './types'

describe('highlightsLabel', () => {
  it('社課或會議寫的是課程,不是活動', () => {
    expect(highlightsLabel('社課或會議')).toBe('課程重點')
  })

  it('活動維持活動重點', () => {
    expect(highlightsLabel('活動')).toBe('活動重點')
  })

  // 行政端唯讀檢視可能拿不到類型(社團總覽以列表列組出),落回原本的字
  it('類型缺漏時落回活動重點', () => {
    expect(highlightsLabel(undefined)).toBe('活動重點')
  })
})

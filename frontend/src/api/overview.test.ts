import { describe, expect, it } from 'vitest'
import { activityPath } from './overview'

describe('activityPath', () => {
  // 總覽列的活動多半不在活動列表的預設學期(最新),不帶學期過去就是落地一片空白
  it('帶上活動所屬的學期,不是今天的學期', () => {
    expect(activityPath({ id: 12, date: '2025-08-01' })).toBe('/activities?open=12&semester=114-1')
    expect(activityPath({ id: 12, date: '2026-07-31' })).toBe('/activities?open=12&semester=114-2')
    expect(activityPath({ id: 12, date: '2026-08-01' })).toBe('/activities?open=12&semester=115-1')
  })

  it('跨年的上學期算前一學年度', () => {
    expect(activityPath({ id: 3, date: '2026-01-31' })).toBe('/activities?open=3&semester=114-1')
  })

  it('沒有日期的草稿不帶學期(列表用自己的預設)', () => {
    expect(activityPath({ id: 7, date: null })).toBe('/activities?open=7')
  })
})

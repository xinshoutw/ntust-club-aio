import { describe, expect, it } from 'vitest'
import { violationFilterParams } from './adminViolations'

const fillers = [
  { id: 3, name: '李工讀' },
  { id: 5, name: '陳工讀' },
]

const params = (sel: Partial<Parameters<typeof violationFilterParams>[0]>) =>
  violationFilterParams({
    statusLabels: [],
    deadlineLabels: [],
    fillerNames: [],
    fillers,
    ...sel,
  })

describe('violationFilterParams', () => {
  it('沒選任何條件時不限狀態、不帶期限與填寫人', () => {
    expect(params({})).toEqual({ statuses: ['open', 'resolved'], expired: undefined, fillerIds: undefined })
  })

  it('期限只選一邊 → expired 布林(後端一併限未銷案)', () => {
    expect(params({ deadlineLabels: ['已截止'] }).expired).toBe(true)
    expect(params({ deadlineLabels: ['未逾期'] }).expired).toBe(false)
  })

  it('期限兩邊都選 = 僅未銷案(已銷案該欄顯示「—」,兩個選項都不吻合)', () => {
    const p = params({ deadlineLabels: ['未逾期', '已截止'] })
    expect(p.statuses).toEqual(['open'])
    expect(p.expired).toBeUndefined()
  })

  it('狀態漏斗與期限漏斗取交集,不可能成立的組合回空集(不是退回全部)', () => {
    expect(params({ statusLabels: ['已銷案'], deadlineLabels: ['未逾期', '已截止'] }).statuses).toEqual([])
  })

  it('填寫人姓名轉 id;對不到任何人時強制空集', () => {
    expect(params({ fillerNames: ['陳工讀'] }).fillerIds).toEqual([5])
    // 選項尚未載入或姓名已失效:回全部等於把篩選條件靜默丟掉
    expect(params({ fillerNames: ['不存在'] }).fillerIds).toEqual([-1])
  })
})

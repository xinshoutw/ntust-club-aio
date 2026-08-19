import { describe, expect, test } from 'vitest'
import { timeColumnsFor } from './memberTable'

// AntD 量到寬度後六個斷點都會帶值(不是只帶成立的那幾個);未量到時是空物件
const screensAt = (width: number) =>
  Object.fromEntries(
    Object.entries({ xs: 480, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1600 }).map(([k, min]) => [
      k,
      width >= min,
    ]),
  )

// 斷點門檻量的是 viewport,表格實際拿到的是 viewport − 側欄 240 − shell padding 64
describe('timeColumnsFor', () => {
  test('斷點還沒量到(空物件)時兩欄都在:寧可先顯示,也不要一進頁就少東西', () => {
    expect(timeColumnsFor({}, [])).toEqual({ showJoined: true, showUpdated: true })
  })

  test('寬螢幕兩欄都在', () => {
    expect(timeColumnsFor(screensAt(1920), [])).toEqual({ showJoined: true, showUpdated: true })
  })

  test('依序隱藏:先收更新時間,再收入社時間', () => {
    // 1200–1599:表格剩 896–1295px,只放得下一個時間欄
    expect(timeColumnsFor(screensAt(1280), [])).toEqual({ showJoined: true, showUpdated: false })
    // 未達 1200:兩欄都收,姓名與職稱這兩個彈性欄才留得住可讀寬度
    expect(timeColumnsFor(screensAt(1024), [])).toEqual({ showJoined: false, showUpdated: false })
  })

  test('正在依那一欄排序時不收:否則使用者看不到也取消不了自己下的排序', () => {
    expect(timeColumnsFor(screensAt(1024), ['updated_at'])).toEqual({
      showJoined: false,
      showUpdated: true,
    })
  })
})

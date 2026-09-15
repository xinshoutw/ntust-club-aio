import { describe, expect, test } from 'vitest'
import { API_BASE } from './client'
import { publicFileUrl, toActivity, type ActivityOut } from './publicClubs'

const activity = (over: Partial<ActivityOut>): ActivityOut => ({
  id: 1,
  name: '社團成果發表會',
  date: '2026-09-15',
  end_date: null,
  start_time: null,
  end_time: null,
  location: 'TR-101',
  ...over,
})

describe('toActivity', () => {
  test('單日活動只顯示一個日期', () => {
    expect(toActivity(activity({})).dateSpan).toBe('2026/09/15')
  })

  test('跨日活動顯示起訖兩個日期', () => {
    expect(toActivity(activity({ end_date: '2026-09-16' })).dateSpan).toBe('2026/09/15 – 2026/09/16')
  })

  test('結束日與開始日相同時不重複顯示', () => {
    expect(toActivity(activity({ end_date: '2026-09-15' })).dateSpan).toBe('2026/09/15')
  })

  test('沒有日期時給空字串，不是 Invalid Date', () => {
    expect(toActivity(activity({ date: null })).dateSpan).toBe('')
  })

  test('起訖時間齊全時顯示區間，秒數不進畫面', () => {
    const a = toActivity(activity({ start_time: '19:00:00', end_time: '21:00:00' }))
    expect(a.timeSpan).toBe('19:00 – 21:00')
  })

  // 缺一個就當沒有 —— 用 00:00 頂替會讓畫面看起來像真的約好了那個時間
  test.each([
    ['只有開始時間', { start_time: '19:00:00', end_time: null }],
    ['只有結束時間', { start_time: null, end_time: '21:00:00' }],
    ['兩個都沒有', { start_time: null, end_time: null }],
  ])('%s 時給空字串', (_label, over) => {
    expect(toActivity(activity(over)).timeSpan).toBe('')
  })
})

describe('publicFileUrl', () => {
  test('沒有圖就沒有網址，不是一個會 404 的位址', () => {
    expect(publicFileUrl(null)).toBeNull()
  })

  test('有圖時指向公開通道', () => {
    expect(publicFileUrl('abc-123')).toBe(`${API_BASE}/public/files/abc-123`)
  })
})

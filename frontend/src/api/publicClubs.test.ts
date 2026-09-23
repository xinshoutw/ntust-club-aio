import { describe, expect, test } from 'vitest'
import { API_BASE } from './client'
import { publicFileUrl, publicPhotoUrl, toActivity, type ActivityOut } from './publicClubs'

const activity = (over: Partial<ActivityOut>): ActivityOut => ({
  id: 1,
  name: '社團成果發表會',
  date: '2026-09-15',
  end_date: null,
  start_time: null,
  end_time: null,
  location: 'TR-101',
  content: '',
  photo_file_ids: [],
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

describe('toActivity 的彈窗欄位', () => {
  test('活動內容原樣帶過去', () => {
    expect(toActivity(activity({ content: '期末成果發表' })).content).toBe('期末成果發表')
  })

  // 形象圖與結案照片是兩條通道:照片走 activity-photos,拿到的是轉過的 JPEG,不是原檔
  test('照片 id 依序換成結案照片通道的網址', () => {
    const a = toActivity(activity({ photo_file_ids: ['p1', 'p2'] }))
    expect(a.photoUrls).toEqual([
      `${API_BASE}/public/files/activity-photos/p1`,
      `${API_BASE}/public/files/activity-photos/p2`,
    ])
    expect(a.photoUrls[0]).toBe(publicPhotoUrl('p1'))
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

import { describe, expect, test } from 'vitest'
import { defaultConfirmations, type ConfirmableReport } from './closeChecks'

const report = (over: Partial<ConfirmableReport> = {}): ConfirmableReport => ({
  reflections: [{}, {}, {}],
  photosConfirmed: true,
  reportConfirmed: true,
  reflectionsConfirmed: true,
  ...over,
})

describe('繳交確認的預設勾選', () => {
  test('三項都達採計門檻就全部預設打勾', () => {
    expect(defaultConfirmations(report(), 5)).toEqual({
      photos: true,
      report: true,
      reflections: true,
    })
  })

  test('照片不足 5 張時,有影片連結才算數', () => {
    expect(defaultConfirmations(report(), 4).photos).toBe(false)
    expect(defaultConfirmations(report({ videoUrl: 'https://x.test/v' }), 0).photos).toBe(true)
  })

  // 未達送出下限 3 篇就不預設勾;後端的 ad4 只要求有上傳,這段區間由承辦自己判斷
  test('心得未達 3 篇不預設打勾,滿 3 篇才勾', () => {
    expect(defaultConfirmations(report({ reflections: [{}, {}] }), 5).reflections).toBe(false)
    expect(defaultConfirmations(report({ reflections: [{}, {}, {}] }), 5).reflections).toBe(true)
  })

  // 遷移件帶著舊系統的旗標:核准會整組覆寫,預設勾回去等於把「未繳」翻成「已繳」
  test('已落庫的確認是 false 時,內容再齊也不預設打勾', () => {
    const stored = report({
      photosConfirmed: false,
      reportConfirmed: false,
      reflectionsConfirmed: false,
      videoUrl: 'https://x.test/v',
    })
    expect(defaultConfirmations(stored, 9)).toEqual({
      photos: false,
      report: false,
      reflections: false,
    })
  })

  test('還沒讀到結案內容時一律不打勾', () => {
    expect(defaultConfirmations(undefined, 9)).toEqual({
      photos: false,
      report: false,
      reflections: false,
    })
  })
})

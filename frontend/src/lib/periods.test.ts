import { afterEach, describe, expect, test, vi } from 'vitest'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { bookingStartAt, bookingStarted, periodKeys, startedPeriods } from './periods'
import type { Period } from '../api/auth'

dayjs.extend(customParseFormat)

// 後端 /auth/me 下發的形狀,取節次軸的頭尾各兩節
const CATALOGUE: Period[] = [
  { key: '1', start: '08:10', end: '09:00' },
  { key: '9', start: '16:30', end: '17:20' },
  { key: '10', start: '17:30', end: '18:20' },
  { key: 'A', start: '18:25', end: '19:15' },
]

afterEach(() => vi.useRealTimers())

describe('periodKeys', () => {
  test('保留後端給的節次順序(不是字串排序)', () => {
    expect(periodKeys(CATALOGUE)).toEqual(['1', '9', '10', 'A'])
  })
})

describe('bookingStartAt', () => {
  test('取節次軸上最早的一節 —— 第 10 節排在第 9 節之後,字面排序會挑錯', () => {
    expect(bookingStartAt(CATALOGUE, '2026/08/20', ['10', '9']).format('HH:mm')).toBe('16:30')
  })
})

describe('bookingStarted', () => {
  test('已過起始時刻即為已開始(相等也算)', () => {
    // 以本地時間建構:節次時刻與 dayjs() 都是牆鐘時間,測試不依賴執行機器的時區
    vi.useFakeTimers().setSystemTime(new Date(2026, 7, 20, 16, 30))
    expect(bookingStarted(CATALOGUE, '2026/08/20', ['9'])).toBe(true)
    expect(bookingStarted(CATALOGUE, '2026/08/20', ['A'])).toBe(false)
  })

  test('沒有節次就不算開始', () => {
    expect(bookingStarted(CATALOGUE, '2020/01/01', [])).toBe(false)
  })
})

describe('startedPeriods', () => {
  test('只回起點已過的節次', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 7, 20, 17, 30))
    expect(startedPeriods(CATALOGUE)).toEqual(['1', '9', '10'])
  })
})

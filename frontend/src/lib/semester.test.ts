import { afterEach, describe, expect, it, vi } from 'vitest'
import { currentSemester, semesterOf } from './semester'

afterEach(() => {
  vi.useRealTimers()
})

describe('semesterOf', () => {
  it('8 月起算上學期、1 月仍屬上學期、2–7 月為下學期', () => {
    expect(semesterOf('2026/08/01')).toBe('115-1')
    expect(semesterOf('2027/01/31')).toBe('115-1')
    expect(semesterOf('2027/02/01')).toBe('115-2')
    expect(semesterOf('2026/07/31')).toBe('114-2')
  })
})

describe('currentSemester', () => {
  it('每次呼叫重讀時鐘,跨過學期邊界即改變', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 31)) // 7 月:下學期
    expect(currentSemester()).toBe('114-2')
    vi.setSystemTime(new Date(2026, 7, 1)) // 8 月:新學年上學期
    expect(currentSemester()).toBe('115-1')
  })
})

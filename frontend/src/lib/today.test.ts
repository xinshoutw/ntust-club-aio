import { afterEach, describe, expect, it, vi } from 'vitest'
import { taipeiToday } from './today'

afterEach(() => vi.useRealTimers())

describe('taipeiToday', () => {
  it('取的是台北的日期,不是裝置本地日', () => {
    // 台北 2026-09-01 07:00 = UTC 2026-08-31 23:00;人在歐洲時裝置仍是 8/31
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T23:00:00Z'))
    expect(taipeiToday().format('YYYY-MM-DD')).toBe('2026-09-01')
  })

  it('回傳當日 00:00,可直接拿來比日界', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T10:30:00Z'))
    expect(taipeiToday().format('YYYY-MM-DD HH:mm')).toBe('2026-08-31 00:00')
  })
})

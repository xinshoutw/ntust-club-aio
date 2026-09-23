import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { suspendedNow } from './status'
import { taipeiToday } from './today'

dayjs.extend(customParseFormat)

afterEach(() => vi.useRealTimers())

describe('suspendedNow(停權中判定)', () => {
  // 以台北日起算(判定本身就是跟台北日比):用裝置日的話,CI 在 UTC 的 16–24 點(台北凌晨)必紅
  const day = (offset: number) => taipeiToday().add(offset, 'day').format('YYYY/MM/DD')

  it('到期當日仍是停權中(後端 suspended_until >= today)', () => {
    expect(suspendedNow(day(0))).toBe(true)
    expect(suspendedNow(day(1))).toBe(true)
  })

  // 後端以台北日比:裝置在台北以西時,到期隔天的台北凌晨裝置上還是到期當日
  it('以台北日為準，不看裝置本地日', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T16:30:00Z')) // 台北 9/2 00:30
    const orig = process.env.TZ
    process.env.TZ = 'America/New_York' // 裝置上是 9/1 12:30
    try {
      expect(suspendedNow('2026/09/01')).toBe(false)
      expect(suspendedNow('2026/09/02')).toBe(true)
    } finally {
      if (orig === undefined) delete process.env.TZ
      else process.env.TZ = orig
    }
  })

  it('已過期或未停權都不算', () => {
    expect(suspendedNow(day(-1))).toBe(false)
    expect(suspendedNow('')).toBe(false)
  })
})

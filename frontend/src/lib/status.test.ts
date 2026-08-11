import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { describe, expect, it } from 'vitest'
import { suspendedNow } from './status'

dayjs.extend(customParseFormat)

describe('suspendedNow(停權中判定)', () => {
  const day = (offset: number) => dayjs().add(offset, 'day').format('YYYY/MM/DD')

  it('到期當日仍是停權中(後端 suspended_until >= today)', () => {
    expect(suspendedNow(day(0))).toBe(true)
    expect(suspendedNow(day(1))).toBe(true)
  })

  it('已過期或未停權都不算', () => {
    expect(suspendedNow(day(-1))).toBe(false)
    expect(suspendedNow('')).toBe(false)
  })
})

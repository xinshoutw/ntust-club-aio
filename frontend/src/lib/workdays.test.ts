import { expect, test } from 'vitest'
import dayjs from 'dayjs'
import { isWeekend } from './workdays'

test('週六日為真,平日為假(dayjs 的週日是 0,不是 7)', () => {
  expect(isWeekend(dayjs('2026-03-07'))).toBe(true) // 六
  expect(isWeekend(dayjs('2026-03-08'))).toBe(true) // 日
  expect(isWeekend(dayjs('2026-03-09'))).toBe(false) // 一
  expect(isWeekend(dayjs('2026-03-06'))).toBe(false) // 五
})

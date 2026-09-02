import type { Dayjs } from 'dayjs'

/**
 * 週六日。放假日登記(`/admin/holidays`)不收週末 —— 後端 `booking_service.add_workdays`
 * 推算上班日時本來就跳過週末,登記進來只是把表撐大。
 *
 * 後端 `HolidayIn._weekday_only` 是權威(422),這一份只是讓選擇器選不到。
 */
export const isWeekend = (d: Dayjs): boolean => d.day() === 0 || d.day() === 6

import { describe, expect, it } from 'vitest'
import { roomEntryText, toEquipmentLoan, toRoomBooking } from './bookings'

describe('toRoomBooking', () => {
  it('slots 依星期分組、節次照課表排序(數字在前、A–D 在後)', () => {
    const booking = toRoomBooking({
      id: 1,
      venue_id: 3,
      venue_name: 'S304 音樂教室',
      purpose: '社課',
      start_date: '2026-08-01',
      end_date: '2027-01-31',
      status: 'pending',
      created_at: '2026-07-01T12:00:00',
      slots: [
        { weekday: 4, period: 'A' },
        { weekday: 2, period: '4' },
        { weekday: 4, period: '10' },
        { weekday: 2, period: '3' },
        { weekday: 4, period: '9' },
      ],
    })
    expect(booking.entries).toEqual([
      { dow: 2, periods: ['3', '4'] },
      { dow: 4, periods: ['9', '10', 'A'] },
    ])
    expect(booking.venueName).toBe('S304 音樂教室')
    expect(booking.status).toBe('pending')
  })
})

describe('roomEntryText', () => {
  it('組出「週X 第n節」顯示字串', () => {
    expect(roomEntryText({ dow: 2, periods: ['3', '4'] })).toBe('週二 第3、4節')
  })
})

describe('toEquipmentLoan', () => {
  const base = {
    id: 9,
    equipment_id: 2,
    equipment_name: '摺疊桌',
    activity_id: 5,
    activity_name: '迎新宿營',
    qty: 10,
    start_date: '2026-06-12',
    end_date: '2026-06-15',
    purpose: '迎新擺攤',
    status: 'checked_out',
    serials: null,
    borrower_name: '陳予恩',
    returner_name: null,
    overdue: false,
  } as const

  it('日期轉顯示格式;借用人/歸還人為選填', () => {
    const loan = toEquipmentLoan({ ...base })
    expect(loan.startDate).toBe('2026/06/12')
    expect(loan.endDate).toBe('2026/06/15')
    expect(loan.borrower).toBe('陳予恩')
    expect(loan.returnedBy).toBeUndefined()
    expect(loan.status).toBe('checked_out')
  })

  it('逾期旗標優先於原始狀態', () => {
    expect(toEquipmentLoan({ ...base, overdue: true }).status).toBe('overdue')
  })
})

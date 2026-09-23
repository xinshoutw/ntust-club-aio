import { describe, expect, it, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import dayjs from 'dayjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'

vi.mock('./client', async (orig) => ({
  ...(await orig<typeof import('./client')>()),
  api: vi.fn(),
}))

import { api } from './client'
import { roomEntryText, toEquipmentLoan, toRoomBooking, useBookingMutations } from './bookings'

describe('createVenueBooking', () => {
  // 後端 `VenueBookingIn.slots`(D-43):一筆一張單,每一筆各帶自己的日期與節次
  it('一次送出的每一筆時段各帶自己的日期與節次', async () => {
    vi.mocked(api).mockResolvedValue([])
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: new QueryClient() }, children)
    const { result } = renderHook(() => useBookingMutations(), { wrapper })
    await act(() =>
      result.current.createVenueBooking.mutateAsync({
        venueId: 9,
        activityId: 1,
        slots: [
          { date: dayjs('2099-01-01'), periods: ['3', '4'] },
          { date: dayjs('2099-01-02'), periods: ['A'] },
        ],
        purpose: '成發彩排',
        phone: ' 0912345678 ',
      }),
    )
    const [path, init] = vi.mocked(api).mock.calls[0]
    expect(path).toBe('/club/venue-bookings')
    expect(JSON.parse(String(init?.body))).toEqual({
      venue_id: 9,
      activity_id: 1,
      slots: [
        { date: '2099-01-01', periods: ['3', '4'] },
        { date: '2099-01-02', periods: ['A'] },
      ],
      purpose: '成發彩排',
      phone: '0912345678',
    })
  })
})

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
      decision_reason: null,
      decided_at: null,
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
    borrower_name: '陳予恩',
    returner_name: null,
    overdue: false,
    decision_reason: null,
    decided_at: null,
  } as const

  it('日期轉顯示格式;收件人/歸還人為選填', () => {
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

import { describe, expect, it, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('./client', async (orig) => ({
  ...(await orig<typeof import('./client')>()),
  apiPaged: vi.fn(),
}))

import { apiPaged } from './client'
import { slotsToEntries, toAdminDecision, useBookingList } from './adminBookings'

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children)

describe('slotsToEntries', () => {
  it('依星期分組並照課表節次排序(數字節次在前、A–D 在後)', () => {
    const entries = slotsToEntries([
      { weekday: 3, period: 'A' },
      { weekday: 1, period: '4' },
      { weekday: 3, period: '10' },
      { weekday: 1, period: '3' },
      { weekday: 3, period: '9' },
    ])
    expect(entries).toEqual([
      { dow: 1, periods: ['3', '4'] },
      { dow: 3, periods: ['9', '10', 'A'] },
    ])
  })

  it('空 slots 回空陣列', () => {
    expect(slotsToEntries([])).toEqual([])
  })
})

// 頁面測試把整支 hook mock 掉,端點與參數組裝只有這裡守:
// 兩支端點對調、多社團退回單值、排序鍵、學期都會在這裡紅
describe('useBookingList 的查詢字串', () => {
  it('器材清單:學期、多狀態、多社團、排序與分頁全部進 query string', async () => {
    vi.mocked(apiPaged).mockResolvedValueOnce({ data: [], total: 0 })
    const { result } = renderHook(
      () =>
        useBookingList('loan', {
          semester: '115-1',
          statuses: ['checked_out', 'overdue'],
          clubIds: [7, 9],
          equipmentIds: [3, 5],
          sort: '-start_date',
          page: 2,
          pageSize: 20,
        }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPaged).toHaveBeenCalledWith(
      '/admin/equipment-loans?semester=115-1&status=checked_out&status=overdue&club_id=7&club_id=9&equipment_id=3&equipment_id=5&sort=-start_date&page=2&page_size=20',
    )
  })

  it('場地清單走另一支端點;全部學期、沒篩選時只剩分頁', async () => {
    vi.mocked(apiPaged).mockResolvedValueOnce({ data: [], total: 0 })
    const { result } = renderHook(
      // 場地清單不吃 equipmentIds:傳了也不進網址
      () => useBookingList('venue', { statuses: [], equipmentIds: [3], page: 1, pageSize: 30 }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPaged).toHaveBeenCalledWith('/admin/venue-bookings?page=1&page_size=30')
  })
})

describe('toAdminDecision', () => {
  it('有處置紀錄就回,理由空著也保留時間與經手人;沒紀錄才是 undefined', () => {
    // 不帶時區的 ISO 字串:dayjs 當本地時間解析,CI(UTC)與本機(台北)才會得到同一個字
    expect(toAdminDecision({ decision_reason: null, decided_at: '2026-09-02T09:30:00', decided_by: '王承辦' })).toEqual({
      reason: '',
      at: '2026/09/02 09:30',
      by: '王承辦',
    })
    expect(toAdminDecision({ decision_reason: null, decided_at: null, decided_by: null })).toBeUndefined()
  })
})

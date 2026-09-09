import { describe, expect, it, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('./client', async (orig) => ({
  ...(await orig<typeof import('./client')>()),
  api: vi.fn(),
}))

import { api } from './client'
import { useAdminEquipment } from './adminEquipment'

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children)

describe('useAdminEquipment', () => {
  it('enabled=false 不打器材主檔(所有場地借用那頁的鍵沒有讀取權)', async () => {
    vi.mocked(api).mockResolvedValue([])
    const { result } = renderHook(() => useAdminEquipment(false), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(api).not.toHaveBeenCalled()
    expect(result.current.isPending).toBe(true)

    const on = renderHook(() => useAdminEquipment(true), { wrapper })
    await waitFor(() => expect(on.result.current.isSuccess).toBe(true))
    expect(api).toHaveBeenCalledWith('/admin/equipment')
  })
})

import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import dayjs from 'dayjs'

vi.mock('./client', async (orig) => ({
  ...(await orig<typeof import('./client')>()),
  api: vi.fn(),
}))
vi.mock('./applications', async (orig) => ({
  ...(await orig<typeof import('./applications')>()),
  uploadFile: vi.fn(),
}))

import { api } from './client'
import { uploadFile } from './applications'
import { ViolationFiledError, useStaffMutations } from './staff'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)
const input = {
  clubId: 1,
  occurredOn: dayjs('2026-09-01'),
  location: '社辦',
  items: ['其他'],
  files: [new File([new Uint8Array(4).buffer as ArrayBuffer], 'a.png')],
}

describe('fileViolation 的兩段式送出', () => {
  beforeEach(() => vi.clearAllMocks())

  test('主體開立後附件失敗:錯誤帶回勸導單 id,呼叫端才知道不能重送', async () => {
    vi.mocked(api).mockResolvedValueOnce({ id: 42 } as never)
    vi.mocked(uploadFile).mockRejectedValueOnce(new Error('檔案超過 10MB 上限'))
    const { result } = renderHook(() => useStaffMutations(), { wrapper })
    await expect(result.current.fileViolation.mutateAsync(input)).rejects.toMatchObject({
      name: 'ViolationFiledError',
      violationId: 42,
      message: '檔案超過 10MB 上限',
    })
    expect(uploadFile).toHaveBeenCalledWith('/staff/violations/42/attachments', expect.any(File))
  })

  test('主體本身失敗:一般 Error,表單該留著讓人改了再送', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('發生日期不可晚於今天'))
    const { result } = renderHook(() => useStaffMutations(), { wrapper })
    const err = await result.current.fileViolation.mutateAsync(input).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(ViolationFiledError)
    expect(uploadFile).not.toHaveBeenCalled()
  })
})

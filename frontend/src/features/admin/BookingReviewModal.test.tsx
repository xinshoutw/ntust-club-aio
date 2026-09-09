import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import BookingReviewModal, { type BookingReviewItem } from './BookingReviewModal'

const loan: BookingReviewItem = {
  kind: 'loan',
  data: {
    id: '7',
    apiId: 7,
    club: '熱舞社',
    equipment: '帳篷',
    qty: 5,
    startDate: '2026/03/06',
    endDate: '2026/03/13',
    purpose: '營隊',
    phone: '0912345678',
    status: 'pending',
    createdAt: '2026/03/01 10:00',
    availableExcludingSelf: 3,
  },
}

const mount = (onApprove: (qty?: number) => Promise<unknown>) =>
  render(
    <App>
      <BookingReviewModal item={loan} open onClose={vi.fn()} afterClose={vi.fn()} onApprove={onApprove} onReject={vi.fn()} />
    </App>,
  )

describe('BookingReviewModal 的器材核准數量', () => {
  test('沒動數量就照申請數核准:onApprove 不帶 qty', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined)
    mount(onApprove)
    fireEvent.click(screen.getByRole('button', { name: '核 准' }))
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith(undefined))
  })

  test('改了數量就以該數核准,可借數警示也跟著改用新數', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined)
    mount(onApprove)
    // 申請 5 > 可借 3 → 一開始有紅字
    expect(screen.getByText(/可借數不足/)).not.toBeNull()
    const input = screen.getByRole('spinbutton', { name: '核准數量' })
    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.blur(input)
    await waitFor(() => expect(screen.queryByText(/可借數不足/)).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: '核 准' }))
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith(3))
  })
})

test('只接核准不接退回不算審核模式:不畫出按了只會假成功的退回鈕', () => {
  render(
    <App>
      <BookingReviewModal item={loan} open onClose={vi.fn()} afterClose={vi.fn()} onApprove={vi.fn()} />
    </App>,
  )
  expect(screen.queryByRole('button', { name: /退\s*回/ })).toBeNull()
  expect(screen.queryByRole('button', { name: '核 准' })).toBeNull()
})

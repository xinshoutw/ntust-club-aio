// 放假日只有一個用途:器材逾期的「隔天上班日」判定,所以送出的日期格式一錯就整條偏掉。
import { beforeEach, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { fireEvent, render, screen } from '@testing-library/react'
import AdminHolidayCard from './AdminHolidayCard'

const save = vi.fn()
const remove = vi.fn()
vi.mock('../../api/adminHolidays', () => ({
  useHolidays: () => ({
    data: [
      { date: '2026-02-27', name: '和平紀念日' },
      { date: '2027-01-01', name: '開國紀念日' },
    ],
    isPending: false,
    isLoadingError: false,
  }),
  useHolidayMutations: () => ({
    save: { mutate: save, isPending: false },
    remove: { mutate: remove, isPending: false },
  }),
}))

beforeEach(() => {
  save.mockClear()
  remove.mockClear()
})

const show = () =>
  render(
    <App>
      <AdminHolidayCard />
    </App>,
  )

test('依年份分組列出', () => {
  show()
  expect(screen.getByText('2026')).toBeTruthy()
  expect(screen.getByText('2027')).toBeTruthy()
  expect(screen.getByText(/2026\/02\/27 和平紀念日/)).toBeTruthy()
})

test('新增送出 ISO 日期與去空白的名稱(畫面顯示 YYYY/MM/DD,後端只收 YYYY-MM-DD)', () => {
  show()
  const day = screen.getByPlaceholderText('放假日期')
  fireEvent.change(day, { target: { value: '2026/03/09' } })
  fireEvent.keyDown(day, { key: 'Enter', code: 'Enter' })
  fireEvent.change(screen.getByPlaceholderText(/名稱/), { target: { value: '  颱風假 ' } })
  fireEvent.click(screen.getByRole('button', { name: /新增/ }))

  expect(save).toHaveBeenCalledWith(
    { date: '2026-03-09', name: '颱風假' },
    expect.anything(),
  )
})

test('日期沒選就擋下並說原因(不是靜靜地什麼都沒發生)', async () => {
  show()
  fireEvent.change(screen.getByPlaceholderText(/名稱/), { target: { value: '颱風假' } })
  fireEvent.click(screen.getByRole('button', { name: /新增/ }))
  expect(await screen.findByText('請選擇日期')).toBeTruthy()
  expect(save).not.toHaveBeenCalled()
})

test('移除要先確認過才送出,送的是那一天的日期', async () => {
  const { container } = show()
  fireEvent.click(container.querySelectorAll('.ant-tag-close-icon')[0])
  // 刪一天會把在借單的歸還期限往前挪一天,而逾期可觸發停權:誤點的損害不對稱
  expect(remove).not.toHaveBeenCalled()

  fireEvent.click(await screen.findByRole('button', { name: /刪\s*除/ }))
  expect(remove).toHaveBeenCalledWith('2026-02-27', expect.anything())
})

test('確認之前那一枚 Tag 不准先從畫面上消失', async () => {
  // Tag 的 onClose 少了 preventDefault 就會自己隱藏:DELETE 失敗時
  // 那天只是從畫面消失,DB 裡還在,而逾期判定照舊把它當假日
  const { container } = show()
  fireEvent.click(container.querySelectorAll('.ant-tag-close-icon')[0])
  await screen.findByRole('button', { name: /刪\s*除/ })
  expect(container.querySelectorAll('.ant-tag')[0].className).not.toContain('ant-tag-hidden')
})

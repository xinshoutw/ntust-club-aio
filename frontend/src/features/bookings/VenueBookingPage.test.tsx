import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import VenueBookingPage from './VenueBookingPage'
import type { VenueBookingInput } from '../../api/bookings'
import { taipeiToday } from '../../lib/today'

// 一次送多個時段(D-43):每一筆右側「+」「−」,送出時一筆一張單
const mutate = vi.fn()
// 未存檔守衛收到的「時段有沒有改過」;頁面其餘欄位走 AntD 的 onValuesChange,這裡不管
let slotsDirty: boolean | null = null
// 「今天」已開始的節次:startedPeriods 讀的是裝置時鐘,釘成常數才不隨跑測試的時刻與時區翻
let started: string[] = []

vi.mock('../../app/unsaved', () => ({
  useFormUnsavedGuard: (dirty: boolean) => {
    slotsDirty = dirty
    return { onValuesChange: () => {}, clear: () => {} }
  },
}))

vi.mock('../../lib/periods', async (orig) => ({
  ...(await orig<typeof import('../../lib/periods')>()),
  startedPeriods: () => started,
}))

vi.mock('../../app/auth', () => ({
  useAuth: () => ({
    user: {
      role: 'club',
      // 802 免綁活動(D-36):這裡測的是時段列,省掉活動下拉的操作
      username: '802',
      club: '國際事務處',
      name: '國際事務處',
      periods: [
        { key: '3', start: '10:20', end: '11:10' },
        { key: '4', start: '11:20', end: '12:10' },
      ],
    },
  }),
}))

vi.mock('../../api/clubProfile', () => ({
  useClubSuspension: () => ({ suspended: false, until: '', reason: '', failed: false }),
}))

vi.mock('../../api/activities', () => ({
  useApprovedActivities: () => ({ data: [], isPending: false }),
}))

const idle = { isPending: false, isError: false, isPlaceholderData: false }

vi.mock('../../api/bookings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/bookings')>()),
  useVenues: () => ({ data: [{ id: 9, name: '精誠廣場', allowTemp: true }], ...idle }),
  useActiveVenueBookings: () => ({ data: [], ...idle }),
  useRecentVenueBookings: () => ({ data: { rows: [], total: 0 }, ...idle }),
  useBookingMutations: () => ({
    createVenueBooking: { mutate, isPending: false },
    cancelVenueBooking: { mutate: vi.fn() },
  }),
}))

// 場地、第一筆的日期與節次走借用總覽的帶入路徑
const renderPage = (query = 'venue=9&date=2099/01/01&period=3') => {
  mutate.mockClear()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/bookings/venue?${query}`]}>
        <App>
          <VenueBookingPage />
        </App>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const rows = () => [...document.querySelectorAll<HTMLElement>('.slot-row')]
const addAfter = (n: number) =>
  fireEvent.click(screen.getByRole('button', { name: `在第 ${n} 筆下方新增時段` }))

/** AntD DatePicker:打字再按 Enter 才會提交 */
const pickDate = (row: HTMLElement, value: string) => {
  const input = within(row).getByPlaceholderText('日期')
  fireEvent.mouseDown(input)
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
}
const pickPeriod = (row: HTMLElement, p: string) =>
  fireEvent.click(within(row).getByRole('button', { name: p }))

const submit = () => {
  fireEvent.change(screen.getByLabelText('用途'), { target: { value: '國際生說明會' } })
  fireEvent.change(screen.getByLabelText('聯絡電話'), { target: { value: '0912345678' } })
  fireEvent.click(screen.getByRole('button', { name: '送出申請' }))
}

const slotsSent = () =>
  (mutate.mock.calls[0][0] as VenueBookingInput).slots.map((s) => [
    s.date.format('YYYY/MM/DD'),
    s.periods,
  ])

describe('臨時場地借用的時段列', () => {
  test('「+」在該筆正下方插一筆空白的，「−」移除該筆，只剩一筆時不能再移除', () => {
    renderPage()
    expect(rows()).toHaveLength(1)
    expect(screen.getByRole('button', { name: '移除第 1 筆時段' })).toHaveProperty('disabled', true)

    addAfter(1)
    pickDate(rows()[1], '2099/01/03')
    // 從第一筆按「+」:新的一筆插在第一筆與原本的第二筆之間,不是接在最後
    addAfter(1)
    const dates = () =>
      rows().map((r) => (within(r).getByPlaceholderText('日期') as HTMLInputElement).value)
    expect(dates()).toEqual(['2099/01/01', '', '2099/01/03'])

    fireEvent.click(screen.getByRole('button', { name: '移除第 2 筆時段' }))
    expect(dates()).toEqual(['2099/01/01', '2099/01/03'])
    expect(screen.getByRole('button', { name: '移除第 1 筆時段' })).toHaveProperty('disabled', false)
  })

  // 後端同一個上限(schemas/bookings.MAX_VENUE_SLOTS),超過整批 422
  test('至多 10 筆，滿了「+」全部停用', () => {
    renderPage()
    for (let n = 1; n < 10; n += 1) addAfter(n)
    expect(rows()).toHaveLength(10)
    for (const plus of screen.getAllByRole('button', { name: /下方新增時段$/ })) {
      expect(plus).toHaveProperty('disabled', true)
    }
  })

  test('送出時每一筆各帶自己的日期與節次', async () => {
    renderPage()
    addAfter(1)
    pickDate(rows()[1], '2099/01/02')
    pickPeriod(rows()[1], '4')
    submit()
    await waitFor(() => expect(mutate).toHaveBeenCalled())
    expect(slotsSent()).toEqual([
      ['2099/01/01', ['3']],
      ['2099/01/02', ['4']],
    ])
  })

  test('有一筆沒選日期或節次就不送，紅框標在那一筆上', async () => {
    renderPage()
    addAfter(1)
    submit()
    expect(await screen.findByText('請為每一筆選擇日期與時段')).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
    const [first, second] = rows()
    expect(first.classList.contains('area-error')).toBe(false)
    expect(second.classList.contains('area-error')).toBe(true)
    expect(second.querySelector('.ant-picker-status-error')).not.toBeNull()

    // 修改該欄即解除(design-guide §6)
    pickPeriod(second, '4')
    expect(second.classList.contains('area-error')).toBe(false)
    pickDate(second, '2099/01/03')
    expect(second.querySelector('.ant-picker-status-error')).toBeNull()
  })

  // 同一天節次重疊的兩筆送出去就是重複申請(後端 `_no_overlap` 同一條);
  // 同一天、節次不重疊的兩筆是兩張單,照送
  test('同一天節次重疊擋在前端，不重疊照送', async () => {
    renderPage()
    addAfter(1)
    pickDate(rows()[1], '2099/01/01')
    pickPeriod(rows()[1], '3')
    submit()
    expect(await screen.findByText('第 2 筆 2099/01/01 的時段重複')).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
    expect(rows()[1].classList.contains('area-error')).toBe(true)

    pickPeriod(rows()[1], '3') // 取消第 3 節
    pickPeriod(rows()[1], '4')
    fireEvent.click(screen.getByRole('button', { name: '送出申請' }))
    await waitFor(() => expect(mutate).toHaveBeenCalled())
    expect(slotsSent()).toEqual([
      ['2099/01/01', ['3']],
      ['2099/01/01', ['4']],
    ])
  })
})

// 日期欄打完字按 Enter 是在確認日期:瀏覽器的隱式送出會把還沒填完的整批先送出去。
// jsdom 不做隱式送出,驗的是 Enter 的預設動作被擋下、而日期照樣收進去
test('日期欄按 Enter 只確認日期，不送出表單', () => {
  renderPage()
  addAfter(1)
  const input = within(rows()[1]).getByPlaceholderText('日期')
  fireEvent.mouseDown(input)
  fireEvent.change(input, { target: { value: '2099/01/02' } })
  expect(fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })).toBe(false)
  expect((input as HTMLInputElement).value).toBe('2099/01/02')
  expect(mutate).not.toHaveBeenCalled()
})

// 焦點跟著被移除(或停用)的按鈕掉到 body 的話,鍵盤使用者得從頁首重新 Tab 過來(WCAG 2.4.3)
test('移除後焦點落在補位那一列的「+」，補滿上限時落在新那一列的「−」', () => {
  renderPage()
  addAfter(1)
  addAfter(2)
  const plus = (n: number) => screen.getByRole('button', { name: `在第 ${n} 筆下方新增時段` })
  fireEvent.click(screen.getByRole('button', { name: '移除第 2 筆時段' }))
  expect(document.activeElement).toBe(plus(2)) // 原本的第 3 筆補上來
  fireEvent.click(screen.getByRole('button', { name: '移除第 2 筆時段' }))
  expect(document.activeElement).toBe(plus(1)) // 刪的是最後一筆:落在前一筆

  for (let n = 1; n < 10; n += 1) addAfter(n)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '移除第 10 筆時段' }))
})

// 重疊的紅框跟著列的內容走:改掉日期或刪掉另一列,重疊不在了紅框就要消失,不必再送一次
test('重疊解除後紅框跟著消失', async () => {
  renderPage()
  addAfter(1)
  pickDate(rows()[1], '2099/01/01')
  pickPeriod(rows()[1], '3')
  submit()
  expect(await screen.findByText('第 2 筆 2099/01/01 的時段重複')).toBeTruthy()
  expect(rows()[1].classList.contains('area-error')).toBe(true)

  pickDate(rows()[1], '2099/01/05')
  expect(rows()[1].classList.contains('area-error')).toBe(false)

  pickDate(rows()[1], '2099/01/01') // 再撞回來:送出過之後照目前的列當場標
  expect(rows()[1].classList.contains('area-error')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '移除第 1 筆時段' }))
  expect(rows()[0].classList.contains('area-error')).toBe(false)
})

describe('未存檔守衛', () => {
  // 帶入的那一筆是初值,不算修改;多一列空白也不算 —— 否則按一下「+」就離不開這一頁
  test('多一列空白不算修改，填了東西才算', () => {
    renderPage()
    expect(slotsDirty).toBe(false)
    addAfter(1)
    expect(slotsDirty).toBe(false)
    pickPeriod(rows()[1], '4')
    expect(slotsDirty).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '移除第 2 筆時段' }))
    expect(slotsDirty).toBe(false)
  })

  // 從場況圖點「今天、已經開始」的那一格進來:那一節選不到,不帶入,也就不會一進頁就算已修改
  test('今天已開始的節次不帶入，一進頁不算修改', () => {
    started = ['3']
    try {
      renderPage(`venue=9&date=${taipeiToday().format('YYYY/MM/DD')}&period=3`)
      expect(slotsDirty).toBe(false)
      const three = within(rows()[0]).getByRole('button', { name: '3' })
      expect(three.getAttribute('aria-pressed')).toBe('false')
      expect(three).toHaveProperty('disabled', true)
    } finally {
      started = []
    }
  })
})

// 每一列的日期欄與節次群組名字都一樣:外層要有自己的名字,讀螢幕軟體才分得出是哪一筆
test('每一列是一個有名字的群組', () => {
  renderPage()
  addAfter(1)
  expect(screen.getByRole('group', { name: '第 1 筆時段' })).toBe(rows()[0])
  expect(screen.getByRole('group', { name: '第 2 筆時段' })).toBe(rows()[1])
})

// 最常見的用法:同樣的節次連借好幾天。重疊只看同一天,不同天的同一節不算
test('不同天選同樣的節次照送', async () => {
  renderPage()
  addAfter(1)
  pickDate(rows()[1], '2099/01/02')
  pickPeriod(rows()[1], '3')
  submit()
  await waitFor(() => expect(mutate).toHaveBeenCalled())
  expect(slotsSent()).toEqual([
    ['2099/01/01', ['3']],
    ['2099/01/02', ['3']],
  ])
})

// 已開始的節次只跟「今天」那一列有關:未來那幾列選好的節次不能被一起刪掉
test('只有日期是今天的那一列停用並剔除已開始的節次，其他列不動', () => {
  started = ['3']
  try {
    renderPage(`venue=9&date=${taipeiToday().format('YYYY/MM/DD')}&period=4`)
    const button = (row: number, p: string) => within(rows()[row]).getByRole('button', { name: p })
    expect(button(0, '3')).toHaveProperty('disabled', true)
    addAfter(1)
    pickDate(rows()[1], '2099/01/02')
    pickPeriod(rows()[1], '3')
    pickPeriod(rows()[1], '4')
    expect(button(1, '3')).toHaveProperty('disabled', false)

    // 過了第 4 節的起點:下一次重畫時,今天那一列的第 4 節被收走,未來那一列照舊
    started = ['3', '4']
    addAfter(2)
    expect(button(0, '4').getAttribute('aria-pressed')).toBe('false')
    expect(button(0, '4')).toHaveProperty('disabled', true)
    expect(button(1, '3').getAttribute('aria-pressed')).toBe('true')
    expect(button(1, '4').getAttribute('aria-pressed')).toBe('true')
  } finally {
    started = []
  }
})

test('送出成功後時段回到一列空白的，也不再算有未存檔的修改', async () => {
  mutate.mockImplementationOnce((_input: VenueBookingInput, opts: { onSuccess: (rows: unknown[]) => void }) =>
    opts.onSuccess([{ periods: ['3'] }, { periods: ['4'] }]),
  )
  renderPage()
  addAfter(1)
  pickDate(rows()[1], '2099/01/02')
  pickPeriod(rows()[1], '4')
  submit()
  expect(await screen.findByText('已送出「精誠廣場」2 筆借用申請')).toBeTruthy()
  expect(rows()).toHaveLength(1)
  expect((within(rows()[0]).getByPlaceholderText('日期') as HTMLInputElement).value).toBe('')
  expect(slotsDirty).toBe(false)
})

// 缺欄位與重疊可能同時存在:兩件都要說,而且說得出是哪一列(同一天可以有好幾列)
test('缺欄位與重疊一起說，重疊指得出是第幾筆', async () => {
  renderPage()
  addAfter(1)
  pickDate(rows()[1], '2099/01/01')
  pickPeriod(rows()[1], '3')
  addAfter(2) // 第三筆空著
  submit()
  expect(await screen.findByText('請為每一筆選擇日期與時段；第 2 筆 2099/01/01 的時段重複')).toBeTruthy()
  expect(mutate).not.toHaveBeenCalled()
})

// 其他欄位沒過時 onFinish 不會跑:時段的問題要跟著一起說,不能只剩一個沒有說明的紅框
test('用途沒填時，時段的問題照樣說出來', async () => {
  renderPage()
  addAfter(1)
  fireEvent.click(screen.getByRole('button', { name: '送出申請' }))
  expect(await screen.findByText('請為每一筆選擇日期與時段')).toBeTruthy()
  expect(rows()[1].classList.contains('area-error')).toBe(true)
})

// 列一多,紅框可能在畫面外,而提示幾秒就消失(design-guide §6:捲動到第一個錯誤)
test('送出被擋時捲到第一個出問題的列', async () => {
  const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
  try {
    renderPage()
    addAfter(1)
    addAfter(2)
    pickDate(rows()[2], '2099/01/03') // 第三筆有日期沒節次,第二筆全空
    submit()
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    expect(scroll.mock.contexts[0]).toBe(rows()[1])
  } finally {
    scroll.mockRestore()
  }
})

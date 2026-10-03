import { beforeEach, describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ActivityClosePage from './ActivityClosePage'
import type { ClubActivityDetail } from '../../api/activities'

// 結案草稿保存照片與附件(D-44):按下「儲存草稿」就把新選的檔案傳上去,下次開啟是已上傳的那一組。
// 改版前只存文字,選好的照片按下儲存就靜靜丟掉
const base = {
  id: 7,
  name: '迎新宿營',
  type: '活動',
  status: 'approved',
  date: '2026/01/01',
  endDate: '2026/01/01',
  timeRange: '09:00–17:00',
  location: '精誠廣場',
  participantsIn: 30,
  participantsOut: 0,
  selfFundTotal: 0,
  requestedTotal: 0,
  canClose: true,
  photos: [],
  closeDocs: [],
  attachments: [],
}
const blank = base as unknown as ClubActivityDetail

// 送出用:必填全由草稿與 5 張既有照片預填,測試才不必去戳 TimePicker
const complete = {
  ...base,
  photos: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `舊${i}.jpg`, type: 'image', size: 1, url: '', uploadedAt: '—' })),
  closeDraft: {
    memberCount: 30,
    nonMemberCount: 0,
    actualStart: '09:00',
    actualEnd: '17:00',
    actualLocation: '精誠廣場',
    highlights: '闖關',
    goals: '認識彼此',
    others: '無',
    reviewMeeting: false,
    expense: 0,
    reflections: Array.from({ length: 3 }, (_, i) => ({ name: `學生${i}`, dept: '資工三', text: '很有收穫' })),
  },
} as unknown as ClubActivityDetail

let detail = blank

const api = vi.hoisted(() => ({
  saveCloseDraft: vi.fn(async (_id: number, _data: unknown) => null),
  submitClose: vi.fn(),
  uploadActivityPhoto: vi.fn(),
  uploadActivityCloseDoc: vi.fn(),
  deleteActivityPhoto: vi.fn(async (_id: number, _fileId: string) => null),
  deleteActivityCloseDoc: vi.fn(async (_id: number, _fileId: string) => null),
}))

vi.mock('../../api/activities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/activities')>()),
  useActivityDetail: () => ({ data: detail, isPending: false, isError: false }),
  useClosableActivities: () => ({ data: [detail], isPending: false, isError: false }),
  useInvalidateActivities: () => () => {},
  ...api,
}))

vi.mock('../../api/clubConfig', () => ({
  useClubConfig: () => ({
    data: { uploadLimits: { closePhotoBytes: 50 * 1024 * 1024, imgBytes: 5 * 1024 * 1024 } },
    isPending: false,
    isError: false,
  }),
}))

// 魔術位元組要是真的 PNG(選檔時會驗),最後一個位元組讓每張的 SHA-256 不同
const png = (name: string, seed: number) =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, seed])], name)
const asUploaded = async (_id: number, f: File) => ({ id: `up-${f.name}`, name: f.name, type: 'image', size: f.size, url: '', uploadedAt: '—' })
// 卡住的上傳:測試自己決定什麼時候讓它成功或失敗
const hold = () => {
  let settle!: { resolve: (v: unknown) => void; reject: (e: Error) => void }
  const promise = new Promise((resolve, reject) => (settle = { resolve, reject }))
  return { promise, ...settle }
}
// jsdom 不跑 CSS 動畫:離場中的 loading 圖示留在按鈕裡,可及名稱變成「loading 儲存草稿」
const saveButton = () => screen.getByRole('button', { name: /儲存草稿/ })

beforeEach(() => {
  detail = blank
  Object.values(api).forEach((m) => m.mockClear())
  api.uploadActivityPhoto.mockReset().mockImplementation(asUploaded)
  api.uploadActivityCloseDoc.mockReset().mockImplementation(asUploaded)
  api.submitClose.mockReset().mockResolvedValue({})
  // jsdom 沒有 object URL
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
})

const renderClose = () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/activities/close?id=7']}>
      <App>
        <Link to="/elsewhere">去別頁</Link>
        <Routes>
          <Route path="/activities/close" element={<ActivityClosePage />} />
          <Route path="/elsewhere" element={<div>別頁</div>} />
          <Route path="*" element={<div>離開表單</div>} />
        </Routes>
      </App>
    </MemoryRouter>,
  )
  const [photoInput, docInput] = container.querySelectorAll<HTMLInputElement>('input[type="file"]')
  return { photoInput, docInput }
}

describe('結案草稿保存照片與附件', () => {
  test('儲存草稿:新選的照片與附件一起傳上去,文字草稿照存', async () => {
    const { photoInput, docInput } = renderClose()
    const [a, b] = [png('a.png', 1), png('b.png', 2)]
    const doc = new File(['%PDF-1.4'], '保單.pdf')
    fireEvent.change(photoInput, { target: { files: [a, b] } })
    fireEvent.change(docInput, { target: { files: [doc] } })
    await screen.findByText('2 張 · 1 件')

    fireEvent.click(saveButton())
    await screen.findByText('離開表單')
    expect(api.saveCloseDraft).toHaveBeenCalledTimes(1)
    expect(api.uploadActivityPhoto.mock.calls).toEqual([[7, a], [7, b]])
    expect(api.uploadActivityCloseDoc.mock.calls).toEqual([[7, doc]])
  })

  test('傳到一半失敗:文字已先存、停在那一檔、已上傳的不回滾,重按只傳剩下的', async () => {
    const { photoInput } = renderClose()
    const [a, b] = [png('a.png', 1), png('b.png', 2)]
    const second = hold()
    api.uploadActivityPhoto.mockImplementationOnce(asUploaded).mockImplementationOnce(() => second.promise)
    fireEvent.change(photoInput, { target: { files: [a, b] } })
    await screen.findByText('2 張')

    fireEvent.click(saveButton())
    await waitFor(() => expect(api.uploadActivityPhoto).toHaveBeenCalledTimes(2))
    // 上傳途中整張表單唯讀:途中改的字存不進去,正在傳的那張按 × 也攔不住它
    expect((screen.getByRole('spinbutton', { name: '實際社員人數' }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '移除 b.png' }) as HTMLButtonElement).disabled).toBe(true)

    second.reject(new Error('連線逾時'))
    await screen.findByText('照片「b.png」上傳失敗：連線逾時')
    expect(api.saveCloseDraft).toHaveBeenCalledTimes(1)
    expect(api.deleteActivityPhoto).not.toHaveBeenCalled()
    expect(screen.getByText('2 張')).toBeTruthy() // a 轉為已上傳、b 仍待傳
    expect(screen.queryByText('離開表單')).toBeNull()

    fireEvent.click(saveButton())
    await screen.findByText('離開表單')
    expect(api.uploadActivityPhoto.mock.calls).toEqual([[7, a], [7, b], [7, b]])
  })

  test('送出失敗:已上傳的不刪,重送不再傳一次', async () => {
    detail = complete
    const { photoInput } = renderClose()
    const c = png('c.png', 3)
    api.submitClose.mockRejectedValueOnce(new Error('已逾結案期限'))
    fireEvent.change(photoInput, { target: { files: [c] } })
    await screen.findByText('6 張')

    fireEvent.click(screen.getByRole('button', { name: '送出結案' }))
    fireEvent.click(await screen.findByRole('button', { name: '確認送出' }))
    await screen.findByText('已逾結案期限')
    expect(api.deleteActivityPhoto).not.toHaveBeenCalled()
    expect(screen.getByText('6 張')).toBeTruthy()

    // at(-1):jsdom 不跑離場動畫,上一個確認窗的節點還留在 DOM
    fireEvent.click(screen.getByRole('button', { name: /送出結案/ }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: '確認送出' }).length).toBeGreaterThan(1))
    fireEvent.click(screen.getAllByRole('button', { name: '確認送出' }).at(-1)!)
    await screen.findByText('離開表單')
    expect(api.uploadActivityPhoto.mock.calls).toEqual([[7, c]])
    expect(api.submitClose).toHaveBeenCalledTimes(2)
  })

  test('存檔途中離開這頁:檔案照樣傳完,但不會把人拉回列表', async () => {
    const { photoInput } = renderClose()
    const upload = hold()
    api.uploadActivityPhoto.mockImplementationOnce(() => upload.promise)
    fireEvent.change(photoInput, { target: { files: [png('a.png', 1)] } })
    await screen.findByText('1 張')

    fireEvent.click(saveButton())
    await waitFor(() => expect(api.uploadActivityPhoto).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('去別頁'))
    await screen.findByText('別頁')

    upload.resolve(await asUploaded(7, png('a.png', 1)))
    await screen.findByText('已暫存結案草稿')
    expect(screen.getByText('別頁')).toBeTruthy()
    expect(screen.queryByText('離開表單')).toBeNull()
  })
})

import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router'
import { fireEvent, render, screen, within } from '@testing-library/react'
import ClubDetailPage from './ClubDetailPage'
import type { ClubDetail, PublicActivity } from '../../api/publicClubs'

const club: ClubDetail = {
  id: 139,
  name: '開源技術開發研究社',
  enName: '',
  kind: '社團',
  attribute: '學藝性',
  tagline: '',
  tags: [],
  recruitStatus: '',
  avatarUrl: null,
  bannerUrl: null,
  intro: '想學程式卻不知從何入手？',
  websiteUrl: '',
  instagram: '',
  publicEmail: '',
  officeLocation: '',
  regularSchedule: '',
  joinInfo: '',
  signupUrl: '',
}

const photos = ['/api/v1/public/files/activity-photos/p1', '/api/v1/public/files/activity-photos/p2']
const activities: PublicActivity[] = [
  {
    id: 1,
    name: '社員大會',
    dateSpan: '2026/03/04',
    timeSpan: '19:00 – 21:00',
    location: 'TR-214',
    content: '期末社員大會，討論下學期社課',
    photoUrls: photos,
  },
  // 只填日期不填時間的活動:畫面上是 —,不可以用 00:00 頂替(全站慣例)。
  // 還沒結案,所以沒有照片;活動內容也沒填
  {
    id: 2,
    name: '企業參訪',
    dateSpan: '2025/12/11',
    timeSpan: '',
    location: '趨勢科技 Trend Micro 股份有限公司',
    content: '',
    photoUrls: [],
  },
]

const ok = { isPending: false, isLoadingError: false, isFetching: false, error: null, refetch: vi.fn() }

vi.mock('../../app/auth', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('../../api/publicClubs', async (orig) => ({
  ...(await orig<typeof import('../../api/publicClubs')>()),
  usePublicClub: () => ({ ...ok, data: club }),
  usePublicClubActivities: () => ({ ...ok, data: activities }),
}))

const renderPage = () =>
  render(
    <App>
      <MemoryRouter initialEntries={['/clubs/139']}>
        <Routes>
          <Route path="/clubs/:clubId" element={<ClubDetailPage />} />
        </Routes>
      </MemoryRouter>
    </App>,
  )

describe('社團詳細的活動紀錄', () => {
  // 一則紀錄一列(手機上同一份標記就是一張字卡);四個欄位都要出得去,而且每一格
  // 自己帶得出欄位名 —— 沒有表格語意可以關聯表頭,而手機的字卡連表頭都沒有。
  // 斷言的字串就是螢幕閱讀器唸出來的那一串:少了標籤會變成「2026/03/0419:00」
  test('每一則活動都畫出日期、時間、名稱與地點，而且每一格自己說得出欄位名', () => {
    renderPage()
    const rows = document.querySelectorAll('.act-row:not(.act-head)')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toBe('日期 2026/03/04時間 19:00 – 21:00活動名稱 社員大會地點 TR-214')
  })

  // 表頭是視覺鷹架:格子自己帶標籤之後再讓它進無障礙樹只是唸兩遍
  test('表頭不進無障礙樹', () => {
    renderPage()
    expect(document.querySelector('.act-head')?.getAttribute('aria-hidden')).toBe('true')
  })

  // 一則紀錄一個 listitem:欄位標籤只說得出「這格是什麼」,說不出「一筆到哪裡結束」——
  // 沒有清單語意的話輔助技術數不出有幾場活動,也跳不到下一場
  test('活動紀錄是一份清單，一則一個項目', () => {
    renderPage()
    expect(screen.getByRole('list')).toBe(document.querySelector('.act-list'))
    expect(screen.getAllByRole('listitem')).toHaveLength(activities.length)
  })

  test('沒填起訖時間時顯示 —，不用 00:00 頂替', () => {
    renderPage()
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.queryByText(/00:00/)).toBeNull()
  })
})

describe('活動彈窗', () => {
  test('點活動名稱開出彈窗：標題是活動名稱，列出日期、時間、地點與活動內容', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '社員大會' }))
    const dialog = await screen.findByRole('dialog', { name: '社員大會' })
    for (const text of ['2026/03/04', '19:00 – 21:00', 'TR-214', '期末社員大會，討論下學期社課']) {
      expect(within(dialog).getByText(text)).toBeTruthy()
    }
  })

  // 名稱那顆按鈕是鍵盤入口;整列的 click 是給滑鼠的,點在地點上一樣要開
  test('點在列上的其他地方也會開', async () => {
    renderPage()
    fireEvent.click(screen.getByText('TR-214'))
    expect(await screen.findByRole('dialog', { name: '社員大會' })).toBeTruthy()
  })

  test('結案照片依序畫出來，每一張都是預覽鈕', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '社員大會' }))
    const dialog = await screen.findByRole('dialog', { name: '社員大會' })
    const imgs = within(dialog).getAllByRole('img', { name: /^活動照片/ })
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(photos)
    // 縮圖本身要能用鍵盤開預覽:AntD Image 可預覽時外層是 role=button、tabIndex=0
    for (const img of imgs) {
      const trigger = img.closest('[role="button"]')
      expect(trigger?.getAttribute('tabindex')).toBe('0')
    }
  })

  // 通道轉不出來的照片回 404(壞檔、磁碟到告警水位):收掉那一張,全壞就整段不出現
  test('載不出來的照片收掉，全都載不出來就不出現照片區', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '社員大會' }))
    const dialog = await screen.findByRole('dialog', { name: '社員大會' })
    fireEvent.error(within(dialog).getAllByRole('img', { name: /^活動照片/ })[0])
    const left = within(dialog).getAllByRole('img', { name: /^活動照片/ })
    expect(left.map((i) => i.getAttribute('src'))).toEqual([photos[1]])

    fireEvent.error(left[0])
    expect(within(dialog).queryByText('活動照片')).toBeNull()
  })

  // 收掉一張會讓組內少一張:預覽開在第二張時就變成「2 / 1」的空白。開著時先留著,關掉才收
  test('預覽開著時載不出來的照片先留著，關掉預覽才收', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '社員大會' }))
    const dialog = await screen.findByRole('dialog', { name: '社員大會' })
    const [first, second] = within(dialog).getAllByRole('img', { name: /^活動照片/ })
    fireEvent.click(second)
    const preview = document.querySelector('.ant-image-preview') as HTMLElement

    fireEvent.error(first)
    expect(preview.querySelector('.ant-image-preview-img')?.getAttribute('src')).toBe(photos[1])
    expect(preview.textContent).toContain('2 / 2')

    fireEvent.click(preview.querySelector('.ant-image-preview-close')!)
    const left = within(dialog).getAllByRole('img', { name: /^活動照片/ })
    expect(left.map((i) => i.getAttribute('src'))).toEqual([photos[1]])
  })

  test('沒有照片就不出現照片區；沒填的時間與內容顯示 —', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '企業參訪' }))
    const dialog = await screen.findByRole('dialog', { name: '企業參訪' })
    expect(within(dialog).queryByText('活動照片')).toBeNull()
    expect(within(dialog).queryAllByRole('img', { name: /^活動照片/ })).toHaveLength(0)
    expect(within(dialog).getAllByText('—')).toHaveLength(2)
  })
})

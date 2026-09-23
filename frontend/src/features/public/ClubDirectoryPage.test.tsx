import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { MemoryRouter } from 'react-router'
import { fireEvent, render, screen } from '@testing-library/react'
import ClubDirectoryPage from './ClubDirectoryPage'
import type { ClubCard } from '../../api/publicClubs'

const card = (over: Partial<ClubCard> & Pick<ClubCard, 'id' | 'name'>): ClubCard => ({
  enName: '',
  kind: '社團',
  attribute: '體育性',
  tagline: '',
  tags: [],
  recruitStatus: '',
  avatarUrl: null,
  bannerUrl: null,
  ...over,
})

const clubs: ClubCard[] = [
  card({ id: 1, name: '熱門舞蹈研習社', attribute: '體育性', tags: ['運動'], recruitStatus: '歡迎加入' }),
  card({ id: 2, name: '書法社', attribute: '藝術性', tags: ['美術'], recruitStatus: '暫不開放' }),
  card({ id: 3, name: '開源技術開發研究社', attribute: '學藝性', tags: ['程式'], enName: 'Open Source Club' }),
  card({ id: 4, name: '合氣道社', attribute: '體育性', tags: ['武術'], recruitStatus: '額滿' }),
  // 遷入時認不得性質的社團(`cms_import` 寫 NULL);照樣公開,但不該佔住第一格
  card({ id: 5, name: '性質不可考社', attribute: null }),
  // 與開源社同為學藝性,且 zh-Hant 下「人工」排在「開源」前面 ——
  // 沒有特例規則的話這一社會跑到學藝性的第一個(英文開頭的名字反而排最後,別拿來當對照)
  card({ id: 6, name: '人工智慧社', attribute: '學藝性', tags: ['程式'] }),
]

const ok = { isPending: false, isLoadingError: false, error: null, refetch: vi.fn() }

// PublicShell 讀 useAuth 判斷右上角該給「登入」還是「回我的頁面」;
// 這一組測試只驗導覽頁的篩選與排序,不拉整個 AuthProvider 進來
vi.mock('../../app/auth', () => ({ useAuth: () => ({ user: null }) }))

vi.mock('../../api/publicClubs', async (orig) => ({
  ...(await orig<typeof import('../../api/publicClubs')>()),
  usePublicClubs: () => ({ ...ok, data: clubs }),
}))

// 字卡是連結而不是按鈕 —— 校外訪客要能複製網址、⌘-click 開新分頁
const cards = () => screen.queryAllByRole('link').filter((a) => a.querySelector('.zh'))
const shown = () =>
  cards()
    .map((a) => a.querySelector('.zh')?.textContent)
    .filter((v): v is string => !!v)

const renderPage = () =>
  render(
    <App>
      <MemoryRouter>
        <ClubDirectoryPage />
      </MemoryRouter>
    </App>,
  )

describe('社團導覽', () => {
  // 需求方指定的順序:學藝 → 藝術 → 體育 → 聯誼 → 服務 → 自治,同性質內依名稱
  test('預設依性質排序，同性質內依名稱', () => {
    renderPage()
    expect(shown()).toEqual([
      // 需求方指定:開源社固定排在學藝性的第一個(特例)
      '開源技術開發研究社',
      '人工智慧社',
      '書法社',
      '合氣道社',
      '熱門舞蹈研習社',
      // indexOf 回 -1 的話這一筆會被釘在最前面
      '性質不可考社',
    ])
  })

  test('搜尋比對名稱與英文名稱', () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('搜尋關鍵字'), { target: { value: 'Open Source' } })
    expect(shown()).toEqual(['開源技術開發研究社'])
  })

  // 標籤退出篩選器之後,搜尋是它唯一的入口
  test('搜尋比對標籤', () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('搜尋關鍵字'), { target: { value: '武術' } })
    expect(shown()).toEqual(['合氣道社'])
  })

  test('搜尋不到時給的是空狀態，不是一片空白', () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('搜尋關鍵字'), { target: { value: '不存在的社團' } })
    expect(shown()).toEqual([])
    expect(screen.getByText(/沒有符合條件的社團/)).toBeTruthy()
  })

  // 兩個下拉一個一個轉回「全部」很煩,空狀態要給得出路
  test('空狀態的「清除所有篩選」把社團找回來', () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('搜尋關鍵字'), { target: { value: '不存在的社團' } })
    fireEvent.click(screen.getByRole('button', { name: '清除所有篩選' }))
    expect(shown()).toHaveLength(clubs.length)
  })

  // 校外訪客要能把某個社團的網址複製給別人,搜尋引擎也要爬得到
  test('字卡是連結，網址指到該社團的頁面', () => {
    renderPage()
    expect(cards().map((a) => a.getAttribute('href'))).toContain('/clubs/3')
  })

  // 性質不上字卡(它在篩選器裡),招生狀態則貼在字卡右下角
  test('字卡不顯示性質，但顯示標籤與招生狀態', () => {
    renderPage()
    expect(screen.queryByText('體育性')).toBeNull()
    expect(screen.getByText('武術')).toBeTruthy()
    expect(screen.getByText('歡迎加入')).toBeTruthy()
    expect(screen.getByText('額滿')).toBeTruthy()
  })
})

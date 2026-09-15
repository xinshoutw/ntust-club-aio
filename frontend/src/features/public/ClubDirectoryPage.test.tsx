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
]

const ok = { isPending: false, isLoadingError: false, error: null, refetch: vi.fn() }

vi.mock('../../api/publicClubs', async (orig) => ({
  ...(await orig<typeof import('../../api/publicClubs')>()),
  usePublicClubs: () => ({ ...ok, data: clubs }),
}))

const shown = () =>
  screen
    .getAllByRole('button')
    .map((b) => b.querySelector('.zh')?.textContent)
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
    expect(shown()).toEqual(['開源技術開發研究社', '書法社', '合氣道社', '熱門舞蹈研習社'])
  })

  test('搜尋比對名稱與英文名稱', () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('搜尋關鍵字'), { target: { value: 'Open Source' } })
    expect(shown()).toEqual(['開源技術開發研究社'])
  })

  test('搜尋不到時給的是空狀態，不是一片空白', () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('搜尋關鍵字'), { target: { value: '不存在的社團' } })
    expect(shown()).toEqual([])
    expect(screen.getByText(/沒有符合條件的社團/)).toBeTruthy()
  })

  // 性質不上字卡(它在篩選器裡),招生狀態則貼在字卡右下角
  test('字卡不顯示性質，但顯示招生狀態', () => {
    renderPage()
    expect(screen.queryByText('體育性')).toBeNull()
    expect(screen.getByText('歡迎加入')).toBeTruthy()
    expect(screen.getByText('額滿')).toBeTruthy()
  })
})

import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router'
import { render, screen } from '@testing-library/react'
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

const activities: PublicActivity[] = [
  { id: 1, name: '社員大會', dateSpan: '2026/03/04', timeSpan: '19:00 – 21:00', location: 'TR-214' },
  // 只填日期不填時間的活動:畫面上是 —,不可以用 00:00 頂替(全站慣例)
  { id: 2, name: '企業參訪', dateSpan: '2025/12/11', timeSpan: '', location: '趨勢科技 Trend Micro 股份有限公司' },
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

// 形象圖走自己的上傳端點(選檔即上傳),不在 PATCH /club/profile 裡。只換了圖的人
// 還是會去按右下角的「儲存」—— 那一按不可以被沒碰過的必填欄位擋下來:遷入的社團
// 有一批指導老師姓名、聯絡信箱、簡介與網頁連結都是空的,擋下來就成了「圖換不了」
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ClubProfile } from '../../api/clubProfile'

// 遷入社團:四個必填欄位全空
const migrated: ClubProfile = {
  id: 139,
  publicVisible: true,
  name: '開源技術開發研究社',
  kind: '社團',
  enName: '',
  intro: '',
  url: '',
  emails: ['', '', ''],
  discordWebhook: '',
  advisorName: '',
  advisorDept: '',
  advisorEmail: '',
  advisorOutName: '',
  advisorOutDept: '',
  advisorOutEmail: '',
  suspendedUntil: null,
  suspendReason: '',
  public: {
    tagline: '',
    tags: [],
    recruitStatus: '',
    publicEmail: '',
    instagram: '',
    officeLocation: '',
    regularSchedule: '',
    joinInfo: '',
    signupUrl: '',
    avatarUrl: null,
    bannerUrl: null,
  },
}

const patch = vi.fn()

vi.mock('../../api/clubConfig', () => ({
  useClubConfig: () => ({ data: { uploadLimits: { imgBytes: 10 * 1024 * 1024 } } }),
}))
vi.mock('../../api/clubProfile', async (orig) => ({
  ...(await orig<typeof import('../../api/clubProfile')>()),
  useClubProfile: () => ({ data: migrated, isError: false, isLoadingError: false, error: null }),
  // 頁首的停權標示自己查一次 profile:原版會走到真的 useQuery(mock 換得掉 export,
  // 換不掉模組內部的呼叫),整頁就掛在「無法確認停權狀態」的錯誤態上被測
  useClubSuspension: () => ({ suspended: false, until: '', reason: '', failed: false }),
  useUpdateClubProfile: () => ({ mutateAsync: patch, isPending: false }),
  useUploadClubImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveClubImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('../../app/unsaved', () => ({ useUnsavedGuard: () => {} }))

const ClubSettingsPage = (await import('./ClubSettingsPage')).default

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App>
        <ClubSettingsPage />
      </App>
    </QueryClientProvider>,
  )

// AntD 會在兩個中文字之間塞一個空格,「儲存」在 DOM 裡是「儲 存」
const save = () =>
  fireEvent.click([...document.querySelectorAll('button')].find((b) => /儲\s*存/.test(b.textContent ?? ''))!)
const fieldErrors = () =>
  [...document.querySelectorAll('.ant-form-item-explain-error')].map((e) => e.textContent)

beforeEach(() => patch.mockClear())

describe('管理項目的儲存', () => {
  test('只換形象圖時按儲存不會被沒碰過的必填欄位擋住', async () => {
    renderPage()
    save()
    await waitFor(() => expect(document.querySelector('.ant-message')?.textContent).toBe('沒有變更'))
    expect(fieldErrors()).toEqual([])
    expect(patch).not.toHaveBeenCalled()
  })

  test('動到任一欄位就得把四個必填一起補齊', async () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('我們是一群喜愛科技的白帽駭客'), {
      target: { value: '白帽駭客社' },
    })
    save()
    // 斷言四句都出現在欄位上,不看 toast —— toast 只印 errorFields[0],
    // 那取決於 Form.Item 的掛載順序,兩張卡對調就會變成另一句
    await waitFor(() =>
      expect(fieldErrors().sort()).toEqual(
        ['請填寫社團網頁連結', '請填寫詳細介紹', '請輸入指導老師姓名', '請至少填寫一組聯絡信箱'].sort(),
      ),
    )
    expect(patch).not.toHaveBeenCalled()
  })

  test('形象圖那一段自己說得出「選擇後即儲存」', () => {
    renderPage()
    expect(screen.getByText('形象圖（選擇後即儲存）')).toBeTruthy()
  })
})

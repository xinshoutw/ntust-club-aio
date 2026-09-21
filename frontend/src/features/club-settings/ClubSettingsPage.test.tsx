// 形象圖走自己的上傳端點(選檔即上傳),不在 PATCH /club/profile 裡。只換了圖的人
// 還是會去按右下角的「儲存」—— 那一按不可以被沒碰過的必填欄位擋下來:遷入的社團
// 有一批指導老師姓名、聯絡信箱、簡介與網頁連結都是空的,擋下來就成了「圖換不了」
import { describe, expect, test, vi } from 'vitest'
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

let profile: ClubProfile = migrated
const patch = vi.fn()

vi.mock('../../api/clubConfig', () => ({
  useClubConfig: () => ({ data: { uploadLimits: { imgBytes: 10 * 1024 * 1024 } } }),
}))
vi.mock('../../api/clubProfile', async (orig) => ({
  ...(await orig<typeof import('../../api/clubProfile')>()),
  useClubProfile: () => ({ data: profile, isError: false, isLoadingError: false, error: null }),
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
const toast = async () => {
  await waitFor(() => expect(document.querySelector('.ant-message')?.textContent).toBeTruthy())
  return document.querySelector('.ant-message')?.textContent
}

describe('管理項目的儲存', () => {
  test('只換形象圖時按儲存不會被沒碰過的必填欄位擋住', async () => {
    profile = migrated
    renderPage()
    save()
    expect(await toast()).toBe('沒有變更')
    expect(patch).not.toHaveBeenCalled()
  })

  test('動到任一欄位就得把必填補齊', async () => {
    profile = migrated
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('我們是一群喜愛科技的白帽駭客'), {
      target: { value: '白帽駭客社' },
    })
    save()
    expect(await toast()).toBe('請輸入指導老師姓名')
    expect(patch).not.toHaveBeenCalled()
  })

  test('形象圖那一段自己說得出「選擇後即儲存」', () => {
    profile = migrated
    renderPage()
    expect(screen.getByText('形象圖（選擇後即儲存）')).toBeTruthy()
  })
})

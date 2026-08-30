import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { render, screen } from '@testing-library/react'
import AwardDetailPage from './AwardDetailPage'
import type { AwardDetail } from '../../api/eval'

let locked = false

const detail = (): AwardDetail => ({
  id: 'club',
  name: '最佳社團獎',
  year: 115,
  uploadLocked: locked,
  items: [
    {
      id: 1,
      itemKey: 'o1',
      name: '社團簡介',
      maxScore: 10,
      help: '',
      groupLabel: '',
      isAdminItem: false,
      uploads: [
        { uploadId: 9, id: 'f1', name: '簡介.pdf', type: 'pdf', size: 1024, url: '', uploadedAt: '2026/08/01' },
      ],
    },
  ],
})

vi.mock('react-router', () => ({ useParams: () => ({ award: 'club' }), Link: () => null }))
vi.mock('../../api/eval', async (orig) => ({
  ...(await orig<typeof import('../../api/eval')>()),
  useAwardDetail: () => ({ data: detail(), isError: false, error: null, refetch: vi.fn() }),
  useEvalUploadMutations: () => ({
    upload: { mutate: vi.fn(), isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
  }),
}))

// 圖示讓可及名稱變成「upload 上傳」
const uploadBtn = () => screen.getByRole('button', { name: /上傳$/ }) as HTMLButtonElement

const renderPage = () =>
  render(
    <App>
      <AwardDetailPage />
    </App>,
  )

describe('AwardDetailPage 的上傳鎖', () => {
  test('未鎖時上傳可按、移除鈕在', () => {
    locked = false
    renderPage()
    expect(uploadBtn().disabled).toBe(false)
    expect(screen.queryByLabelText('移除 簡介.pdf')).not.toBeNull()
  })

  test('鎖著時上傳反灰、移除鈕收掉 —— 後端兩支都回 409,不該讓人選完檔才知道', () => {
    locked = true
    renderPage()
    expect(uploadBtn().disabled).toBe(true)
    expect(screen.queryByLabelText('移除 簡介.pdf')).toBeNull()
  })
})

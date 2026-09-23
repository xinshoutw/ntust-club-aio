import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { fireEvent, render, screen } from '@testing-library/react'
import AwardDetailPage from './AwardDetailPage'
import type { AwardDetail } from '../../api/eval'

let locked = false
const PDF = { uploadId: 9, id: 'f1', name: '簡介.pdf', type: 'pdf' as const, size: 1024, url: '', uploadedAt: '2026/08/01' }
let uploads: AwardDetail['items'][number]['uploads'] = [PDF]

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
      uploads,
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

// 同一個細項的上傳檔:圖片開 AntD 的圖片預覽並可左右切換,PDF 不算在切換裡
test('細項裡的圖片開圖片預覽，同一項的圖片左右切換', () => {
  const img = (uploadId: number, id: string, name: string) => ({
    uploadId, id, name, type: 'image' as const, size: 2048, url: `/api/v1/files/${id}`, uploadedAt: '2026/08/02',
  })
  uploads = [img(10, 'i1', '社課.jpg'), PDF, img(11, 'i2', '成發.jpg')]
  try {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '成發.jpg' }))
    const preview = screen.getByRole('dialog', { name: '成發.jpg' })
    expect(preview.querySelector('.ant-image-preview-img')?.getAttribute('src')).toBe('/api/v1/files/i2')
    expect(preview.textContent).toContain('2 / 2')
  } finally {
    uploads = [PDF]
  }
})

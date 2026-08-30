import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { fireEvent, render, screen } from '@testing-library/react'
import PtViolationFormPage from './PtViolationFormPage'
import type { StaffClub } from '../../api/staff'

const clubs: StaffClub[] = [
  { id: 1, name: '熱舞社', attribute: '藝術性', isActive: true },
  { id: 2, name: '吉他社', attribute: '藝術性', isActive: true },
  { id: 3, name: '慈幼社', attribute: '服務性', isActive: true },
  { id: 4, name: '停社舊社', attribute: null, isActive: false },
]

const ok = { isPending: false, isError: false, error: null, refetch: vi.fn() }

vi.mock('../../api/staff', async (orig) => ({
  ...(await orig<typeof import('../../api/staff')>()),
  useStaffClubs: () => ({ ...ok, data: clubs }),
  useViolationItems: () => ({ ...ok, data: ['未經申請使用場地'] }),
  useStaffMutations: () => ({ fileViolation: { mutate: vi.fn(), isPending: false } }),
}))

describe('PtViolationFormPage 的社團選擇', () => {
  test('是二級選單:先看到性質資料夾,不是 60 社平鋪', () => {
    render(
      <App>
        <PtViolationFormPage />
      </App>,
    )
    fireEvent.mouseDown(screen.getByText('選擇社團'))
    // 第一層只有資料夾;停用社團連資料夾都不該帶出來
    expect(screen.queryByText('藝術性')).not.toBeNull()
    expect(screen.queryByText('服務性')).not.toBeNull()
    expect(screen.queryByText('未分類')).toBeNull()
    // 社團名在展開資料夾前不出現(平鋪下拉會一次全列)
    expect(screen.queryByText('熱舞社')).toBeNull()
  })
})

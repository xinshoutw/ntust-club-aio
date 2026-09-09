import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Providers } from '../../test/providers'
import AdminBookingListPage, { STATUSES } from './AdminBookingListPage'
import { STATUS } from '../../lib/status'
import type { ListedBooking } from '../../api/adminBookings'

// 持不持 abooking 由各測試切換:看得到(查閱鍵)與動得了(審核鍵)是兩個判定
const auth = { permissions: ['avenuelist', 'aloanlist'] as string[] }
vi.mock('../../app/auth', () => ({
  useAuth: () => ({
    user: {
      role: 'admin',
      isSuper: false,
      permissions: auth.permissions,
      adminPages: [{ key: 'abooking', label: '臨時場地器材借用審核', paths: ['/admin/bookings'], also: [] }],
    },
  }),
}))

vi.mock('../../api/adminEquipment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/adminEquipment')>()),
  useAdminEquipment: () => ({
    data: [{ id: 1, name: '帳篷', totalQty: 5, needsSerial: false, isActive: true }],
    isError: false,
  }),
}))

vi.mock('../../api/adminClubs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/adminClubs')>()),
  useClubOptions: () => ({
    data: [{ id: 7, name: '吉他社', kind: '社團', attribute: '藝術', isActive: true }],
    isError: false,
  }),
}))

const rejected: ListedBooking = {
  kind: 'venue',
  data: {
    id: '1', apiId: 1, club: '吉他社', venue: '精誠廣場', date: '2026/09/07', periods: ['3', '4'],
    purpose: '擺攤', phone: '', status: 'rejected', createdAt: '2026/09/01 10:00',
    decision: { reason: '該時段場地整修', at: '2026/09/02 09:30', by: '王承辦' },
  },
}
const pending: ListedBooking = {
  kind: 'loan',
  data: {
    id: '2', apiId: 2, club: '吉他社', equipment: '帳篷', qty: 2, startDate: '2026/09/07', endDate: '2026/09/08',
    purpose: '營隊', phone: '', status: 'pending', createdAt: '2026/09/01 10:00',
  },
}

const list = { rows: [] as ListedBooking[] }
vi.mock('../../api/adminBookings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/adminBookings')>()),
  useBookingSemesters: () => ({ data: ['115-1'], isPending: false, isError: false }),
  useBookingList: () => ({
    data: { rows: list.rows, total: list.rows.length },
    isPending: false, isError: false, isSuccess: true, isPlaceholderData: false, isFetching: false,
  }),
}))

const APPROVE = /核\s*准/

const open = (kind: 'venue' | 'loan', row: ListedBooking, name: string) => {
  list.rows = [row]
  render(
    <Providers>
      <AdminBookingListPage kind={kind} />
    </Providers>,
  )
  fireEvent.click(screen.getByRole('button', { name: `開啟 吉他社 借用「${name}」的詳細資訊` }))
}

describe('所有場地/器材借用的詳情彈窗', () => {
  beforeEach(() => {
    auth.permissions = ['avenuelist', 'aloanlist']
  })

  test('退回件看得到退回原因與經手人,沒有核准鈕', () => {
    open('venue', rejected, '精誠廣場')
    expect(screen.getByText('退回原因')).toBeTruthy()
    expect(screen.getByText('該時段場地整修')).toBeTruthy()
    expect(screen.getByText(/王承辦/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: APPROVE })).toBeNull()
  })

  test('只持查閱鍵:待審單也純看,不畫出沒人接的核准鈕', () => {
    open('loan', pending, '帳篷')
    expect(screen.getByText('僅供查看')).toBeTruthy()
    expect(screen.queryByRole('button', { name: APPROVE })).toBeNull()
  })

  test('另持 abooking:待審單在本頁就簽得動', () => {
    auth.permissions = ['aloanlist', 'abooking']
    open('loan', pending, '帳篷')
    expect(screen.getByRole('button', { name: APPROVE })).toBeTruthy()
  })
})

// 漏斗以顯示標籤反查鍵(lib/status 有多個鍵共用「待審核」「已逾期」):
// 往 STATUSES 加任何一個共名鍵都會靜默多撈或少撈,這裡先擋
test('狀態漏斗的標籤不重複,選了才對得回鍵', () => {
  for (const keys of Object.values(STATUSES)) {
    expect(new Set(keys.map((k) => STATUS[k].label)).size).toBe(keys.length)
  }
})

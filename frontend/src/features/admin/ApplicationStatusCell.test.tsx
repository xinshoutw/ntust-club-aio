// 「已駁回」是幹部證明專有的終態(D-37):郵局帳戶異動連選項都不該列出來。
import { beforeEach, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatusCell } from './ApplicationStatusCell'
import type { ApplicationKind, ApplicationStatus } from '../../api/adminApplications'

const mutate = vi.fn()
vi.mock('../../api/adminApplications', async (orig) => ({
  ...(await orig<typeof import('../../api/adminApplications')>()),
  useApplicationStatusMutation: () => ({ mutate, isPending: false }),
}))

beforeEach(() => mutate.mockClear())

const show = (kind: ApplicationKind, status: ApplicationStatus = 'pending') => {
  render(
    <App>
      <StatusCell kind={kind} id={1} status={status} name="熱舞社 王小明" />
    </App>,
  )
  fireEvent.mouseDown(screen.getByRole('combobox'))
}

test('幹部證明的狀態下拉開得出「已駁回」', () => {
  show('cert')
  expect(screen.getAllByTitle('已駁回').length).toBeGreaterThan(0)
})

test('郵局帳戶異動沒有駁回這條路,選項不列', () => {
  show('postal')
  expect(screen.queryByTitle('已駁回')).toBeNull()
  expect(screen.getAllByTitle('已完成').length).toBeGreaterThan(0)
})

test('確認之後才送出,且帶的是本頁的 kind', () => {
  show('cert')
  fireEvent.click(screen.getByTitle('已駁回'))
  expect(mutate).not.toHaveBeenCalled() // 先問一次:誤按的損害不對稱,回不去
  fireEvent.click(screen.getByRole('button', { name: '確認駁回' }))
  expect(mutate).toHaveBeenCalledWith(
    { kind: 'cert', id: 1, status: 'declined' },
    expect.anything(),
  )
})

test('已駁回是終態:不再是下拉,只剩一顆狀態 pill', () => {
  render(
    <App>
      <StatusCell kind="cert" id={1} status="declined" name="熱舞社 王小明" />
    </App>,
  )
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.getByText('已駁回')).toBeTruthy()
})

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ChangePasswordModal from './ChangePasswordModal'

const changePasswordApi = vi.fn()
vi.mock('../../api/auth', () => ({ changePasswordApi: (...a: unknown[]) => changePasswordApi(...a) }))
vi.mock('../../app/auth', () => ({ useAuth: () => ({ refresh: vi.fn() }) }))

const VALID = 'Abcdef1234!'

function open(onClose = vi.fn()) {
  render(
    <App>
      <ChangePasswordModal open onClose={onClose} />
    </App>,
  )
  return onClose
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

const submit = () => fireEvent.click(screen.getByRole('button', { name: '更新密碼' }))

beforeEach(() => {
  changePasswordApi.mockReset().mockResolvedValue(undefined)
})

describe('更換密碼', () => {
  test('填齊就送出,並帶上目前密碼與新密碼', async () => {
    const onClose = open()
    type('目前密碼', 'OldPass123!')
    type('新密碼', VALID)
    type('確認新密碼', VALID)
    submit()
    await waitFor(() => expect(changePasswordApi).toHaveBeenCalledWith('OldPass123!', VALID))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  test('兩次新密碼不一致就擋下,不打 API', async () => {
    open()
    type('目前密碼', 'OldPass123!')
    type('新密碼', VALID)
    type('確認新密碼', `${VALID}x`)
    submit()
    await screen.findByText('兩次輸入的新密碼不一致')
    expect(changePasswordApi).not.toHaveBeenCalled()
  })

  test('新密碼不符政策就擋下,不打 API', async () => {
    open()
    type('目前密碼', 'OldPass123!')
    type('新密碼', 'abcdefghij')
    type('確認新密碼', 'abcdefghij')
    submit()
    await screen.findByText(/含大小寫字母、數字與特殊符號/)
    expect(changePasswordApi).not.toHaveBeenCalled()
  })

  // 「目前密碼錯誤」「不得與最近 3 代相同」都是後端才知道的事,不能被吃成「更新失敗」
  test('後端的錯誤原文要看得到,而且欄位不清空', async () => {
    changePasswordApi.mockRejectedValue(new Error('目前密碼錯誤'))
    const onClose = open()
    type('目前密碼', 'WrongPass1!')
    type('新密碼', VALID)
    type('確認新密碼', VALID)
    submit()
    await screen.findByText('目前密碼錯誤')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('新密碼')).toHaveProperty('value', VALID)
  })
})

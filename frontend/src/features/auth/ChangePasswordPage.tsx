import { useState } from 'react'
import { useNavigate } from 'react-router'
import { App, Button, Input } from 'antd'
import { changePasswordApi } from '../../api/auth'
import { homeOf } from '../../lib/home'
import { useAuth } from '../../app/auth'

// 首登(或被重設密碼後)強制改密;也可自登入後直接訪問
export default function ChangePasswordPage() {
  const { user, refresh, logout } = useAuth()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!oldPassword || !newPassword || !confirm) {
      setError('請填寫全部欄位')
      return
    }
    if (newPassword !== confirm) {
      setError('兩次輸入的新密碼不一致')
      return
    }
    setSubmitting(true)
    try {
      await changePasswordApi(oldPassword, newPassword)
      message.success('密碼已更新')
      await refresh()
      navigate(homeOf(user?.role), { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--paper)',
        padding: '24px 24px 64px',
      }}
    >
      <div className="card" style={{ width: 420, maxWidth: '100%', padding: '40px 40px 32px' }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>設定新密碼</div>
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 22 }}>
          {user?.mustChangePassword ? '首次登入需變更密碼後才能繼續使用' : '變更登入密碼'}
        </div>
        <form
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>目前密碼</div>
            <Input.Password value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" autoFocus />
          </label>
          <label>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>新密碼</div>
            <Input.Password value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>
              至少 <span className="num">10</span> 碼,含大小寫字母、數字與特殊符號;不得與近三代相同
            </div>
          </label>
          <label>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>確認新密碼</div>
            <Input.Password value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </label>
          {error && <div style={{ fontSize: 13, color: '#C13B34' }}>{error}</div>}
          <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting} style={{ height: 42, marginTop: 4 }}>
            更新密碼
          </Button>
          <Button type="text" style={{ height: 36 }} onClick={() => void logout()}>
            改用其他帳號登入
          </Button>
        </form>
      </div>
    </div>
  )
}

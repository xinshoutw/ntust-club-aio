import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Input } from 'antd'
import { homeOf } from '../../lib/home'
import { useAuth } from '../../app/auth'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!username.trim() || !password.trim()) {
      setError('請輸入帳號與密碼')
      return
    }
    setSubmitting(true)
    try {
      const user = await login(username.trim(), password)
      // 首登(或被重設密碼)強制改密後才能進入面板
      navigate(user.mustChangePassword ? '/change-password' : homeOf(user.role), { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '登入失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        // 無 reset 預設 content-box,padding 會外加於 100vh 造成整頁垂直捲軸
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--paper)',
        padding: '24px 24px 64px',
      }}
    >
      <div className="card" style={{ width: 400, maxWidth: '100%', padding: '44px 40px 36px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 30, textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: 1 }}>臺科大社團管理系統</div>
          <div style={{ fontSize: 12, color: 'var(--steel)', letterSpacing: 3 }}>國立臺灣科技大學 學生事務處</div>
        </div>

        <form
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>帳號</div>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="學號或社團帳號"
              autoComplete="username"
            />
          </label>
          <label>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>密碼</div>
            <Input.Password
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="請輸入密碼"
              autoComplete="current-password"
            />
          </label>
          {error && <div style={{ fontSize: 13, color: '#C13B34' }}>{error}</div>}
          <Button type="primary" htmlType="submit" loading={submitting} style={{ height: 42, marginTop: 4, fontSize: 15 }}>
            登入
          </Button>
        </form>
      </div>
      <div style={{ marginTop: 28, fontSize: 12, color: 'var(--steel)' }}>
        © 國立臺灣科技大學 課外活動指導組 · <span className="num">clubs.ntust.edu.tw</span>
      </div>
    </div>
  )
}

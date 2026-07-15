import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Input } from 'antd'
import { useAuth } from '../../app/auth'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    if (!username.trim() || !password.trim()) {
      setError('請輸入帳號與密碼。')
      return
    }
    const user = login(username.trim())
    navigate(user.role === 'admin' ? '/admin' : '/', { replace: true })
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
      <div className="card" style={{ width: 400, maxWidth: '100%', padding: '44px 40px 36px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 30, textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: 1 }}>臺科大社團管理系統</div>
          <div style={{ fontSize: 12, color: 'var(--steel)', letterSpacing: 3 }}>國立臺灣科技大學 學生事務處</div>
        </div>

        <form
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          onSubmit={(e) => {
            e.preventDefault()
            submit()
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
          <Button type="primary" htmlType="submit" style={{ height: 42, marginTop: 4, fontSize: 15 }}>
            登入
          </Button>
        </form>
      </div>
      <div style={{ marginTop: 28, fontSize: 12, color: 'var(--steel)' }}>
        {/*TODO: 改成像之前一樣 clubs.ntust.edu.tw*/}
        © 國立臺灣科技大學 課外活動指導組 · 114 學年
      </div>
    </div>
  )
}

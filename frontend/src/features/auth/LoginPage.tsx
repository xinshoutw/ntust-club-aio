import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Input, Popover } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import { homeOf } from '../../lib/home'
import { useAuth } from '../../app/auth'

const COPYRIGHT_START_YEAR = 2026

/** © 2026;跨年後自動變 © 2026-{今年} */
function copyrightSpan(year: number): string {
  return year > COPYRIGHT_START_YEAR ? `${COPYRIGHT_START_YEAR}-${year}` : `${COPYRIGHT_START_YEAR}`
}

const maintainerInfo = (
  <div style={{ fontSize: 13, lineHeight: 2.2 }}>
    <div>網頁維護：資訊工程系 黃宥維</div>
    <div>
      聯絡信箱：
      <a className="num" href="mailto:B11315009@mail.ntust.edu.tw">
        B11315009@mail.ntust.edu.tw
      </a>
    </div>
    <div>
          訊息聯絡：Discord{' '}
          <a
              href="https://discord.com/users/810822763601461318"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                  background: 'var(--paper)',
                  border: '1px solid var(--line)',
                  borderRadius: 4,
                  padding: '1px 6px',
              }}
          >
              xinshoutw
          </a>
    </div>
  </div>
)

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
          <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: 1 }}>社團管理系統</div>
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
              placeholder="請輸入帳號"
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
          <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting} style={{ height: 42, marginTop: 4, fontSize: 15 }}>
            登入
          </Button>
        </form>
      </div>
      <div style={{ marginTop: 28, fontSize: 12, color: 'var(--steel)', display: 'flex', alignItems: 'center', gap: 2 }}>
        <span>
          Copyright © <span className="num">{copyrightSpan(new Date().getFullYear())}</span> 國立臺灣科技大學
        </span>
        <Popover content={maintainerInfo} trigger="click" placement="top">
          <Button
            type="text"
            size="small"
            shape="circle"
            icon={<InfoCircleOutlined />}
            aria-label="網頁維護資訊"
            style={{ color: 'var(--steel)' }}
          />
        </Popover>
      </div>
    </div>
  )
}

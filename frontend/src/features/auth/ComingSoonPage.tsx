import { useNavigate } from 'react-router'
import { Button } from 'antd'
import { useAuth } from '../../app/auth'

// 工讀生/評審面板尚未開放(Roadmap:後續實作)
export default function ComingSoonPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--paper)',
        padding: 24,
        gap: 16,
      }}
    >
      <div className="card" style={{ width: 420, maxWidth: '100%', padding: '40px 36px', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>面板尚未開放</div>
        <div style={{ fontSize: 13, color: 'var(--steel)', lineHeight: 1.8 }}>
          {user?.name} 您好，您的帳號所屬面板仍在建置中，更多疑問請洽學務處
        </div>
        <Button
          style={{ marginTop: 20 }}
          onClick={() => {
            void logout().then(() => navigate('/login', { replace: true }))
          }}
        >
          登出
        </Button>
      </div>
    </div>
  )
}

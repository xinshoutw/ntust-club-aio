import { useNavigate } from 'react-router'
import { Button } from 'antd'
import { CalendarOutlined, LoginOutlined } from '@ant-design/icons'
import '../../components/layout/shell.css'

/** 免登入頁面共用的外殼。
 *
 *  借用 shell 的 topbar 與內容寬(不另開一套 CSS),但**沒有側欄、鈴鐺與帳號選單** ——
 *  匿名訪客沒有那些東西可以按。右上角固定兩顆:借用狀態與登入。 */
export default function PublicShell({
  mobileTitle,
  children,
}: {
  mobileTitle: string
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" className="topbar-brand" onClick={() => navigate('/')}>
          <img src="/logo.svg" alt="" className="topbar-logo" />
          臺科大社團管理系統
        </button>
        <div className="topbar-mobile-title">{mobileTitle}</div>
        <div className="topbar-spacer" />
        <Button icon={<CalendarOutlined />} onClick={() => navigate('/availability')}>
          借用狀態
        </Button>
        <Button type="primary" icon={<LoginOutlined />} onClick={() => navigate('/login')}>
          登入
        </Button>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  )
}

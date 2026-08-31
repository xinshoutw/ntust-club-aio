import { useNavigate } from 'react-router'
import { Button } from 'antd'
import { LoginOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import BookingGrid from '../bookings/BookingGrid'
import '../../components/layout/shell.css'

/** 未登入的首頁:借用情形色格圖的公開預覽。
 *
 *  看得到、翻得動、點不了 —— `BookingGrid` 沒收到借用入口就不畫可點的格子。
 *  外殼借用 shell 的 topbar 與內容寬(不另開一套 CSS),但沒有側欄與帳號選單。 */
export default function PublicHomePage() {
  const navigate = useNavigate()
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-brand" style={{ cursor: 'default' }}>
          <img src="/logo.svg" alt="" className="topbar-logo" />
          臺科大社團管理系統
        </div>
        <div className="topbar-mobile-title">借用情形</div>
        <div className="topbar-spacer" />
        <Button type="primary" icon={<LoginOutlined />} onClick={() => navigate('/login')}>
          登入
        </Button>
      </header>

      <main className="shell-main">
        <PageHeader title="借用情形" sub="登入後才能提出借用申請" />
        <BookingGrid />
      </main>
    </div>
  )
}

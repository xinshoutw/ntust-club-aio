import { useNavigate } from 'react-router'
import { Button } from 'antd'
import { CalendarOutlined, HomeOutlined, LoginOutlined } from '@ant-design/icons'
import { useAuth } from '../../app/auth'
import { homeOf } from '../../lib/home'
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
  // 公開頁不在角色閘底下,登入中的人照樣進得來(社團按「預覽社團頁」就是)。
  // 對他們顯示「登入」會把人送去一張自己已經不需要的表單
  const { user } = useAuth()
  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" className="topbar-brand" onClick={() => navigate('/clubs')}>
          <img src="/logo.svg" alt="" className="topbar-logo" />
          臺科大社團管理系統
        </button>
        <div className="topbar-mobile-title">{mobileTitle}</div>
        <div className="topbar-spacer" />
        <Button icon={<CalendarOutlined />} onClick={() => navigate('/availability')}>
          借用狀態
        </Button>
        {user ? (
          <Button icon={<HomeOutlined />} onClick={() => navigate(homeOf(user.role))}>
            控制台
          </Button>
        ) : (
          <Button type="primary" icon={<LoginOutlined />} onClick={() => navigate('/login')}>
            登入
          </Button>
        )}
      </header>
      {/* 整頁包一層:`.shell-main > *` 會把**每個直接子元素**各自撐成 1200px 置中,
          頁面一多幾個區塊就會出現寬度對不齊的情形(尤其是 flex/grid 容器與被
          LoadingBlock 攤平出來的片段)。收成單一容器後,裡面的區塊一律等寬 */}
      <main className="shell-main">
        <div className="public-page">{children}</div>
      </main>
    </div>
  )
}

import { useLocation, useNavigate } from 'react-router'
import { Button } from 'antd'
import { AppstoreOutlined, ArrowLeftOutlined, CalendarOutlined, HomeOutlined, LoginOutlined } from '@ant-design/icons'
import { useAuth } from '../../app/auth'
import { homeOf } from '../../lib/home'
import TopbarButton from '../../components/layout/TopbarButton'
import '../../components/layout/shell.css'

/** 免登入頁面共用的外殼。
 *
 *  借用 shell 的 topbar 與內容寬(不另開一套 CSS),但**沒有側欄、鈴鐺與帳號選單** ——
 *  匿名訪客沒有那些東西可以按。右上角固定兩顆:另一邊的公開頁與登入。 */
export default function PublicShell({
  mobileTitle,
  back,
  children,
}: {
  mobileTitle: string
  /** 顯示「回社團導覽」。手機 ≤767px 的 `.topbar-brand` 是 `display: none`,
   *  沒有這顆鈕就只剩上一頁手勢回得去導覽頁 */
  back?: boolean
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // 公開頁不在角色閘底下,登入中的人照樣進得來(社團按「預覽社團頁」就是)。
  // 對他們顯示「登入」會把人送去一張自己已經不需要的表單
  const { user } = useAuth()
  // 這顆鈕永遠指向**另外那一邊**:兩個公開面互為對方的出口,不必再各自放返回鈕
  const onAvailability = pathname === '/availability'
  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" className="topbar-brand" onClick={() => navigate('/clubs')}>
          <img src="/logo.svg" alt="" className="topbar-logo" />
          臺科大社團管理系統
        </button>
        <div className="topbar-mobile-title">{mobileTitle}</div>
        <div className="topbar-spacer" />
        {onAvailability ? (
          <TopbarButton
            label="社團導覽"
            icon={<AppstoreOutlined />}
            onClick={() => navigate('/clubs')}
          />
        ) : (
          <TopbarButton
            label="借用情形"
            icon={<CalendarOutlined />}
            onClick={() => navigate('/availability')}
          />
        )}
        {user ? (
          <TopbarButton
            label="控制台"
            icon={<HomeOutlined />}
            onClick={() => navigate(homeOf(user.role))}
          />
        ) : (
          <TopbarButton
            label="登入"
            type="primary"
            icon={<LoginOutlined />}
            onClick={() => navigate('/login')}
          />
        )}
      </header>
      {/* 整頁包一層:`.shell-main > *` 會把**每個直接子元素**各自撐成 1200px 置中,
          頁面一多幾個區塊就會出現寬度對不齊的情形(尤其是 flex/grid 容器與被
          LoadingBlock 攤平出來的片段)。收成單一容器後,裡面的區塊一律等寬 */}
      <main className="shell-main">
        <div className="public-page">
          {back && (
            <div>
              {/* 導向 `/clubs` 而不是 `/`:`/` 只有未登入時才是導覽頁,
                  社團從「預覽社團頁」點進來會被丟回自己的總覽 */}
              <Button
                type="link"
                icon={<ArrowLeftOutlined />}
                style={{ paddingLeft: 0 }}
                href="/clubs"
                onClick={(e) => {
                  // 帶 href 才有 <a> 的那些好處(hover 看得到目標、⌘-click 開新分頁);
                  // 沒按修飾鍵時仍走 SPA 導航,不整頁重載
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                  e.preventDefault()
                  navigate('/clubs')
                }}
              >
                回社團導覽
              </Button>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  )
}

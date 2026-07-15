import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { App, Badge, Drawer, Dropdown, Popover } from 'antd'
import { BellOutlined, DownOutlined, HistoryOutlined, LogoutOutlined, MenuOutlined, SettingOutlined } from '@ant-design/icons'
import { useAuth } from '../../app/auth'
import { UnsavedProvider, useHasUnsaved } from '../../app/unsaved'
import type { NavGroup } from '../../lib/nav'
import Sidebar from './Sidebar'
import './shell.css'

const NOTIFICATIONS = [
  { title: '「迎新宿營」結案期限剩 15 天', time: '2026/07/13 09:00' },
  { title: '您申請的 S304 教室(節次 3、4)已核准', time: '2026/06/16 14:20' },
  { title: '114-2 社團評鑑報名開始', time: '2026/06/18 10:00' },
]

interface AppShellProps {
  nav: NavGroup[]
  badgeLabel?: string
}

// UnsavedProvider 需包住 shell 本體與頁面(側欄/頂欄導航前查詢 dirty)
export default function AppShell(props: AppShellProps) {
  return (
    <UnsavedProvider>
      <ShellInner {...props} />
    </UnsavedProvider>
  )
}

function ShellInner({ nav, badgeLabel }: AppShellProps) {
  const { user, logout } = useAuth()
  const { modal } = App.useApp()
  const hasUnsaved = useHasUnsaved()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [notifRead, setNotifRead] = useState(false)

  // 有未儲存變更時,任何 shell 導航先確認
  const guarded = (go: () => void) => {
    if (!hasUnsaved()) {
      go()
      return
    }
    modal.confirm({
      title: '尚有未儲存的變更',
      content: '離開此頁將遺失尚未儲存的修改。',
      okText: '放棄變更並離開',
      okButtonProps: { danger: true },
      cancelText: '留在此頁',
      onOk: go,
    })
  }

  // 手機 topbar 依設計顯示目前頁名(對應 nav 項目;無對應時顯示系統名)
  const currentItem = nav
    .flatMap((g) => g.items)
    .find((i) => i.path === location.pathname)
  const mobileTitle = currentItem?.label ?? '社團管理系統'
  const displayName = (user?.role === 'club' ? user.club : user?.name) ?? ''

  const userMenu = {
    items: [
      // 登出上方的角色捷徑:社團=設定(管理項目);管理員=系統設定、稽核軌跡
      ...(user?.role === 'club' ? [{ key: 'settings', icon: <SettingOutlined />, label: '設定' }] : []),
      ...(user?.role === 'admin'
        ? [
            { key: 'admin-settings', icon: <SettingOutlined />, label: '設定' },
            { key: 'admin-audit', icon: <HistoryOutlined />, label: '稽核軌跡' },
          ]
        : []),
      { key: 'logout', icon: <LogoutOutlined />, label: '登出' },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'settings') guarded(() => navigate('/club-settings'))
      if (key === 'admin-settings') guarded(() => navigate('/admin/settings'))
      if (key === 'admin-audit') guarded(() => navigate('/admin/audit'))
      if (key === 'logout') {
        guarded(() => {
          logout()
          navigate('/login', { replace: true })
        })
      }
    },
  }

  return (
    <div className="shell">
      <header className="topbar">
        <button
          type="button"
          className="topbar-menu-btn"
          aria-label="選單"
          onClick={() => setDrawerOpen(true)}
        >
          <MenuOutlined />
        </button>
        <button
          type="button"
          className="topbar-brand"
          onClick={() => guarded(() => navigate(user?.role === 'admin' ? '/admin' : '/'))}
        >
          臺科大社團管理系統
        </button>
        <div className="topbar-mobile-title">{mobileTitle}</div>
        {badgeLabel && <span className="topbar-scope">{badgeLabel}</span>}
        <div className="topbar-spacer" />
        <Popover
          trigger="click"
          placement="bottomRight"
          onOpenChange={(open) => open && setNotifRead(true)}
          content={
            <div style={{ width: 300 }}>
              {NOTIFICATIONS.map((n) => (
                <div key={n.title} style={{ padding: '10px 4px', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{n.title}</div>
                  <div className="num" style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>{n.time}</div>
                </div>
              ))}
              <div style={{ padding: '8px 4px 2px', fontSize: 12, color: 'var(--steel)', textAlign: 'center' }}>沒有更多通知</div>
            </div>
          }
        >
          <button type="button" className="topbar-icon-btn" aria-label="通知">
            <Badge dot={!notifRead} offset={[-2, 2]}>
              <BellOutlined style={{ fontSize: 18 }} />
            </Badge>
          </button>
        </Popover>
        <div className="topbar-divider" />
        <Dropdown menu={userMenu} trigger={['click']}>
          <button type="button" className="topbar-user" aria-label="帳號選單">
            <span className="topbar-username">{displayName}</span>
            <DownOutlined style={{ fontSize: 11, color: 'var(--steel)' }} />
          </button>
        </Dropdown>
      </header>

      <div className="shell-body">
        <aside className="shell-sidebar">
          <Sidebar groups={nav} />
        </aside>
        <main className="shell-main">
          <Outlet />
        </main>
      </div>

      <Drawer
        placement="left"
        size={264}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ body: { padding: 0 } }}
        title="臺科大社團管理系統"
      >
        <Sidebar groups={nav} onNavigate={() => setDrawerOpen(false)} />
        <div style={{ borderTop: '1px solid var(--line)', padding: '10px 10px 16px' }}>
          <button
            type="button"
            className="sidebar-item"
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
          >
            <span className="sidebar-item-icon"><LogoutOutlined /></span>
            <span className="sidebar-item-label">登出({user?.name})</span>
          </button>
        </div>
      </Drawer>
    </div>
  )
}

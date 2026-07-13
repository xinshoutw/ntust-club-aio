import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { Drawer, Dropdown } from 'antd'
import { BellOutlined, DownOutlined, LogoutOutlined, MenuOutlined } from '@ant-design/icons'
import { useAuth } from '../../app/auth'
import type { NavGroup } from '../../lib/nav'
import Sidebar from './Sidebar'
import './shell.css'

interface AppShellProps {
  nav: NavGroup[]
  badgeLabel?: string
}

export default function AppShell({ nav, badgeLabel }: AppShellProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // 手機 topbar 依設計顯示目前頁名(對應 nav 項目;無對應時顯示系統名)
  const currentItem = nav
    .flatMap((g) => g.items)
    .find((i) => i.path === location.pathname)
  const mobileTitle = currentItem?.label ?? '社團管理系統'

  const userMenu = {
    items: [
      { key: 'logout', icon: <LogoutOutlined />, label: '登出' },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') {
        logout()
        navigate('/login', { replace: true })
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
        <div className="topbar-brand">臺科大社團管理系統</div>
        <div className="topbar-mobile-title">{mobileTitle}</div>
        {badgeLabel && <span className="topbar-scope">{badgeLabel}</span>}
        <div className="topbar-spacer" />
        <button type="button" className="topbar-year num" aria-label="切換學年度">
          114 學年 <DownOutlined style={{ fontSize: 11, color: 'var(--steel)' }} />
        </button>
        <button type="button" className="topbar-icon-btn" aria-label="通知">
          <BellOutlined style={{ fontSize: 18 }} />
          <span className="topbar-dot" />
        </button>
        <div className="topbar-divider" />
        <Dropdown menu={userMenu} trigger={['click']}>
          <button type="button" className="topbar-user" aria-label="帳號選單">
            <span className="topbar-avatar">{user?.name.charAt(0)}</span>
            <span className="topbar-username">{user?.name}</span>
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

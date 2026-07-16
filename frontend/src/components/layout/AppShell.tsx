import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { App, Badge, Drawer, Dropdown, Popover } from 'antd'
import { confirmDialog } from '../../lib/confirm'
import { BellOutlined, DownOutlined, HistoryOutlined, LogoutOutlined, MenuOutlined, SettingOutlined } from '@ant-design/icons'
import { useAuth } from '../../app/auth'
import { useAnnouncements, useMarkAnnouncementsRead } from '../../api/announcements'
import { UnsavedProvider, useHasUnsaved } from '../../app/unsaved'
import type { NavGroup } from '../../lib/nav'
import Sidebar from './Sidebar'
import TakeoverOverlay from './TakeoverOverlay'
import './shell.css'

// 鈴鐺顯示最新公告/通知(社團端);工讀生/評審/行政端通知來源待各端 API
const BELL_COUNT = 5

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
  // 公告即通知來源:與總覽/蓋板共用同一查詢,非社團角色不打 /club/* API
  const announcementsQuery = useAnnouncements(user?.role === 'club')
  const notifications = (announcementsQuery.data?.announcements ?? []).slice(0, BELL_COUNT)
  // 未讀狀態由後端水位線提供(跨裝置);開啟面板即標記已讀
  const hasUnread = (announcementsQuery.data?.announcements ?? []).some((n) => n.unread)
  const markRead = useMarkAnnouncementsRead()

  // 有未儲存變更時,任何 shell 導航先確認
  const guarded = (go: () => void) => {
    if (!hasUnsaved()) {
      go()
      return
    }
    confirmDialog(modal, {
      title: '尚有未儲存的變更',
      content: '離開此頁將遺失尚未儲存的修改',
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
      // 登出上方的角色捷徑:社團=設定(管理項目);系統設定與稽核軌跡僅 super
      ...(user?.role === 'club' ? [{ key: 'settings', icon: <SettingOutlined />, label: '設定' }] : []),
      ...(user?.role === 'admin' && user.isSuper
        ? [
            { key: 'admin-audit', icon: <HistoryOutlined />, label: '稽核紀錄' },
            { key: 'admin-settings', icon: <SettingOutlined />, label: '設定' },
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
          void logout().then(() => navigate('/login', { replace: true }))
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
          <img src="/logo.svg" alt="" className="topbar-logo" />
          臺科大社團管理系統
        </button>
        <div className="topbar-mobile-title">{mobileTitle}</div>
        {badgeLabel && <span className="topbar-scope">{badgeLabel}</span>}
        <div className="topbar-spacer" />
        <Popover
          trigger="click"
          placement="bottomRight"
          onOpenChange={(open) => {
            if (open && hasUnread) markRead.mutate()
          }}
          content={
            <div style={{ width: 300 }}>
              {notifications.map((n) => (
                <div key={n.id} style={{ padding: '10px 4px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{n.title}</div>
                    <div className="num" style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>{n.date}</div>
                  </div>
                  {n.unread && (
                    <span
                      aria-label="未讀"
                      style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--seal)', marginTop: 6, flexShrink: 0 }}
                    />
                  )}
                </div>
              ))}
              <div style={{ padding: '8px 4px 2px', fontSize: 12, color: 'var(--steel)', textAlign: 'center' }}>沒有更多通知</div>
            </div>
          }
        >
          <button type="button" className="topbar-icon-btn" aria-label="通知">
            <Badge dot={hasUnread} offset={[-2, 2]}>
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

      {/* 蓋板公告:僅社團端,每次登入顯示 */}
      {user?.role === 'club' && <TakeoverOverlay />}

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
            onClick={() =>
              guarded(() => {
                logout()
                navigate('/login', { replace: true })
              })
            }
          >
            <span className="sidebar-item-icon"><LogoutOutlined /></span>
            <span className="sidebar-item-label">登出({user?.name})</span>
          </button>
        </div>
      </Drawer>
    </div>
  )
}

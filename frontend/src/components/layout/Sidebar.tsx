import { NavLink } from 'react-router'
import type { NavGroup } from '../../lib/nav'
import './sidebar.css'

interface SidebarProps {
  groups: NavGroup[]
  onNavigate?: () => void
}

/**
 * 重設計側欄(需求方回饋:原版生硬、群組標題與可點項目難以區分)
 * - 項目:icon + 文字、圓角塊、hover 浮起;選中 = 淡紅底 + 紅字 + 左側短紅條
 * - 群組標題:縮小、加字距、上方留白拉開,明顯「不可點」
 */
export default function Sidebar({ groups, onNavigate }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="主選單">
      {groups.map((group, gi) => (
        <div className="sidebar-group" key={group.label ?? gi}>
          {group.label && <div className="sidebar-group-label">{group.label}</div>}
          {group.items.map((item) => (
            <NavLink
              key={item.key}
              to={item.path}
              end
              className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
              onClick={onNavigate}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span className="sidebar-item-label">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className="sidebar-item-badge num">{item.badge}</span>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

import { NavLink, useNavigate } from 'react-router'
import { App, Tooltip } from 'antd'
import { confirmDialog } from '../../lib/confirm'
import { useHasUnsaved } from '../../app/unsaved'
import type { NavGroup } from '../../lib/nav'
import './sidebar.css'

interface SidebarProps {
  groups: NavGroup[]
  onNavigate?: () => void
}

/**
 * 側欄:群組標題與可點項目在視覺上必須明顯區分。
 * - 項目:icon + 文字、圓角塊、hover 變色;選中 = 淡紅底 + 紅字 + 左側短紅條
 * - 群組標題:縮小、加字距、上方留白拉開,明顯「不可點」
 */
export default function Sidebar({ groups, onNavigate }: SidebarProps) {
  const navigate = useNavigate()
  const { modal } = App.useApp()
  const hasUnsaved = useHasUnsaved()

  // 頁面有未儲存變更時攔下側欄導航,確認後才離開
  const onItemClick = (e: React.MouseEvent, path: string) => {
    if (!hasUnsaved()) {
      onNavigate?.()
      return
    }
    e.preventDefault()
    confirmDialog(modal, {
      title: '尚有未儲存的變更',
      content: '離開此頁將遺失尚未儲存的修改',
      okText: '放棄變更並離開',
      okButtonProps: { danger: true },
      cancelText: '留在此頁',
      onOk: () => {
        onNavigate?.()
        navigate(path)
      },
    })
  }

  return (
    <nav className="sidebar" aria-label="主選單">
      {groups.map((group, gi) => (
        <div className="sidebar-group" key={group.label ?? gi}>
          {group.label && <div className="sidebar-group-label">{group.label}</div>}
          {group.items.map((item) =>
            item.disabled ? (
              // 未開放的功能反灰、不可點(如固定場地借用於開放期外)
              <Tooltip key={item.key} title={item.disabledHint} placement="right">
                <span className="sidebar-item disabled" aria-disabled="true">
                  <span className="sidebar-item-icon" aria-hidden="true">
                  {item.icon}
                </span>
                  <span className="sidebar-item-label">{item.label}</span>
                </span>
              </Tooltip>
            ) : (
              <NavLink
                key={item.key}
                to={item.path}
                end
                className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
                onClick={(e) => onItemClick(e, item.path)}
              >
                <span className="sidebar-item-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="sidebar-item-label">{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  // role=generic 禁止 aria-label(規範上會被丟掉),給它 img 才命名得了;
                  // 少了這層,數字併進連結名稱會讀成「申請審核 3」
                  <span
                    className="sidebar-item-badge num"
                    role="img"
                    aria-label={`${item.badge} 件待辦`}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ),
          )}
        </div>
      ))}
    </nav>
  )
}

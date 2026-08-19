// 整塊可點的區域(卡片、非表格列)給鍵盤的入口:role=button + tabIndex + Enter/Space。
// 表格列不要用這個 —— tr 上掛 role 會蓋掉表格語意,那裡走欄位內的 .row-open-btn。
export function clickableProps(onClick: () => void): React.HTMLAttributes<HTMLElement> {
  return {
    role: 'button',
    tabIndex: 0,
    onClick,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    },
  }
}

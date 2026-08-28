import { Cascader } from 'antd'
import { clubFolder, groupActiveClubs, type ClubFolderInput } from '../../api/adminClubs'

interface CascaderOption {
  value: string
  label: string
  children?: CascaderOption[]
}

// 資料夾式二級社團選擇:第一層=性質資料夾,展開後於第二層選社團(社團數可破 60);可搜尋。
// value/onChange 走「社團名稱字串」介面,可直接放入 Form.Item。
//
// **選項由呼叫端給**:行政端走 `features/admin/ClubCascader`(GET /admin/clubs/options),
// 工讀生端走 GET /staff/clubs —— 工讀生打不進 /admin/*,元件自己抓就綁死在管理員身上了。
export default function ClubCascader({
  clubs: all,
  value,
  onChange,
  width = 220,
  placeholder,
  size,
  allowClear = false,
  omit,
}: {
  clubs: readonly ClubFolderInput[]
  value?: string
  /** allowClear 時清除會給 undefined */
  onChange?: (club: string | undefined) => void
  width?: number | string
  placeholder?: string
  size?: 'small' | 'middle' | 'large'
  allowClear?: boolean
  /** 不列入選單的社團名稱(如已報名者不必再補登) */
  omit?: readonly string[]
}) {
  const clubs = omit?.length ? all.filter((c) => !omit.includes(c.name)) : all
  const attr = (() => {
    const found = clubs.find((c) => c.name === value)
    return found ? clubFolder(found) : undefined
  })()
  // 停用社團一律不列(groupActiveClubs;已選中的仍照常顯示)
  const folders = groupActiveClubs(clubs)
  return (
    <Cascader<CascaderOption>
      allowClear={allowClear}
      size={size}
      value={value && attr ? [attr, value] : undefined}
      onChange={(v) => {
        // 清除時 v 為 undefined:選了社團與沒選是兩種狀態,不能一律當成沒事發生
        if (v == null) {
          if (allowClear) onChange?.(undefined)
          return
        }
        const name = v[1]
        if (typeof name === 'string') onChange?.(name)
      }}
      style={{ width }}
      placeholder={placeholder}
      popupMatchSelectWidth={false}
      displayRender={(labels) => labels[labels.length - 1]}
      showSearch={{
        filter: (input, path) => path.some((o) => String(o.label).includes(input)),
      }}
      options={folders.map((f) => ({
        value: f.label,
        label: f.label,
        children: f.options.map((name) => ({ value: name, label: name })),
      }))}
      // 社團數可破 60:預設彈窗一次只看得到 5 個社團,拉高與縮列距在 index.css 的 .club-cascader-popup
      classNames={{ popup: { root: 'club-cascader-popup' } }}
    />
  )
}

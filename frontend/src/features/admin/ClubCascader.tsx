import { Cascader } from 'antd'
import OptionsError from '../../components/ui/OptionsError'
import { clubFolder, groupClubsByFolder, groupClubsForFilter, useClubOptions } from '../../api/adminClubs'

interface CascaderOption {
  value: string
  label: string
  children?: CascaderOption[]
}

// 資料夾式二級社團選擇:第一層=性質資料夾,展開後於第二層選社團(社團數可破 60);可搜尋
// value/onChange 走「社團名稱字串」介面,可直接放入 Form.Item;
// 選項來自 GET /admin/clubs/options(任何管理員可讀,不含敏感欄位)
export default function ClubCascader({
  value,
  onChange,
  width = 220,
  placeholder,
  size,
  allowClear = false,
  omit,
  hideUnclassified = false,
}: {
  value?: string
  /** allowClear 時清除會給 undefined */
  onChange?: (club: string | undefined) => void
  width?: number | string
  placeholder?: string
  size?: 'small' | 'middle' | 'large'
  allowClear?: boolean
  /** 不列入選單的社團名稱(如已報名者不必再補登) */
  omit?: readonly string[]
  /** 隱藏「未分類」資料夾(全是停社零活動的遷入舊社;行政分審核的清單本來就不含它們)。
   *  只收掉選項 —— 已經選中的社團仍照常顯示,否則跨頁帶著舊選擇過來會看到一個空的選擇器 */
  hideUnclassified?: boolean
}) {
  const { data: all = [], isError, error, refetch } = useClubOptions()
  const clubs = omit?.length ? all.filter((c) => !omit.includes(c.name)) : all
  const attr = (() => {
    const found = clubs.find((c) => c.name === value)
    return found ? clubFolder(found) : undefined
  })()
  const folders = hideUnclassified ? groupClubsForFilter(clubs) : groupClubsByFolder(clubs)
  // 選項載不到就整個換成失敗說明:空的 cascader 只會顯示「暫無資料」,而選不到社團的頁面
  // (社團總覽/成員列表/管理項目/行政分審核)`clubId` 一律 null,整頁是空的、一句錯誤都沒有
  if (isError) return <OptionsError what="社團清單" error={error} onRetry={() => void refetch()} />
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

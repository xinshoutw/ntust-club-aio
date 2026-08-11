import { Cascader } from 'antd'
import OptionsError from '../../components/ui/OptionsError'
import { useClubOptions } from '../../api/adminClubs'

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
}: {
  value?: string
  onChange?: (club: string) => void
  width?: number | string
  placeholder?: string
}) {
  const { data: clubs = [], isError, error, refetch } = useClubOptions()
  // 停社舊社團 attribute 為 null → 歸「未分類」資料夾
  const attrOf = (c: { attribute: string | null }) => c.attribute ?? '未分類'
  const attr = (() => {
    const found = clubs.find((c) => c.name === value)
    return found ? attrOf(found) : undefined
  })()
  // 依主檔出現順序分組(後端已按 性質 → 名稱 排序;null 排最前 → 未分類在頂)
  const attrs = [...new Set(clubs.map(attrOf))]
  // 選項載不到就整個換成失敗說明:空的 cascader 只會顯示「暫無資料」,而選不到社團的頁面
  // (社團總覽/成員列表/管理項目/行政分審核)`clubId` 一律 null,整頁是空的、一句錯誤都沒有
  if (isError) return <OptionsError what="社團清單" error={error} onRetry={() => void refetch()} />
  return (
    <Cascader<CascaderOption>
      allowClear={false}
      value={value && attr ? [attr, value] : undefined}
      onChange={(v) => {
        const name = v?.[1]
        if (typeof name === 'string') onChange?.(name)
      }}
      style={{ width }}
      placeholder={placeholder}
      popupMatchSelectWidth={false}
      displayRender={(labels) => labels[labels.length - 1]}
      showSearch={{
        filter: (input, path) => path.some((o) => String(o.label).includes(input)),
      }}
      options={attrs.map((a) => ({
        value: a,
        label: a,
        children: clubs.filter((c) => attrOf(c) === a).map((c) => ({ value: c.name, label: c.name })),
      }))}
    />
  )
}

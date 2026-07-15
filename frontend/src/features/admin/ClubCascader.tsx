import { Cascader } from 'antd'
import { CLUB_ATTRIBUTES, CLUBS_MASTER } from './clubsMock'

interface ClubOption {
  value: string
  label: string
  children?: ClubOption[]
}

// 資料夾式二級社團選擇:第一層=性質資料夾,展開後於第二層選社團(社團數可破 60);可搜尋
// value/onChange 走「社團名稱字串」介面,可直接放入 Form.Item
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
  const attr = CLUBS_MASTER.find((c) => c.name === value)?.attribute
  return (
    <Cascader<ClubOption>
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
      options={CLUB_ATTRIBUTES.map((a) => ({
        value: a,
        label: a,
        children: CLUBS_MASTER.filter((c) => c.attribute === a).map((c) => ({ value: c.name, label: c.name })),
      })).filter((g) => g.children.length > 0)}
    />
  )
}

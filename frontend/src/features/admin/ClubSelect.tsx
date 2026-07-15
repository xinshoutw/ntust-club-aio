import { Cascader } from 'antd'
import { CLUB_ATTRIBUTES, CLUBS_MASTER } from './clubsMock'
import { useAdminClub } from './clubContext'

interface ClubOption {
  value: string
  label: string
  children?: ClubOption[]
}

// 行政端共用社團選擇器:第一層=性質資料夾,展開後於第二層選社團(社團數可破 60);
// 可輸入關鍵字搜尋;選取跨頁同步
export default function ClubSelect({ width = 220 }: { width?: number }) {
  const { club, setClub } = useAdminClub()
  const attr = CLUBS_MASTER.find((c) => c.name === club)?.attribute
  return (
    <Cascader<ClubOption>
      allowClear={false}
      value={attr ? [attr, club] : undefined}
      onChange={(v) => {
        const name = v?.[1]
        if (typeof name === 'string') setClub(name)
      }}
      style={{ width }}
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

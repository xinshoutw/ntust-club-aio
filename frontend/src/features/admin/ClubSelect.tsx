import { Select } from 'antd'
import { CLUB_ATTRIBUTES, CLUBS_MASTER } from './clubsMock'
import { useAdminClub } from './clubContext'

// 行政端共用社團選擇器:單一下拉、兩層(性質 → 社團)、可輸入關鍵字;選取跨頁同步
export default function ClubSelect({ width = 220 }: { width?: number }) {
  const { club, setClub } = useAdminClub()
  return (
    <Select
      showSearch
      value={club}
      onChange={setClub}
      style={{ width }}
      popupMatchSelectWidth={false}
      optionFilterProp="label"
      options={CLUB_ATTRIBUTES.map((attr) => ({
        label: attr,
        title: attr,
        options: CLUBS_MASTER.filter((c) => c.attribute === attr).map((c) => ({ value: c.name, label: c.name })),
      })).filter((g) => g.options.length > 0)}
    />
  )
}

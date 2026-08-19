import ClubCascader from './ClubCascader'
import { useAdminClub } from './clubContext'

// 行政端共用社團選擇器:資料夾式二級選單,選取跨頁同步
export default function ClubSelect({ width = 220 }: { width?: number }) {
  const { club, setClub } = useAdminClub()
  // 這支不給清除(allowClear 預設 false),onChange 拿到 undefined 只可能是型別上的可能性
  return <ClubCascader value={club} onChange={(c) => c && setClub(c)} width={width} />
}

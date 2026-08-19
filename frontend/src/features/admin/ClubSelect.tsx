import ClubCascader from './ClubCascader'
import { useAdminClub } from './clubContext'

// 行政端共用社團選擇器:資料夾式二級選單,選取跨頁同步
export default function ClubSelect({ width = 220 }: { width?: number }) {
  const { club, setClub } = useAdminClub()
  return <ClubCascader value={club} onChange={setClub} width={width} />
}

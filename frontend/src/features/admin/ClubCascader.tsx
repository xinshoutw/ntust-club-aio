import ClubCascaderBase from '../../components/ui/ClubCascader'
import OptionsError from '../../components/ui/OptionsError'
import { useClubOptions } from '../../api/adminClubs'

type Props = Omit<React.ComponentProps<typeof ClubCascaderBase>, 'clubs'>

/** 行政端的社團二級選單:選項取自 GET /admin/clubs/options(任何管理員可讀,不含敏感欄位)。 */
export default function ClubCascader(props: Props) {
  const { data = [], isError, error, refetch } = useClubOptions()
  // 選項載不到就整個換成失敗說明:空的 cascader 只會顯示「暫無資料」,而選不到社團的頁面
  // (社團總覽/成員列表/管理項目/行政分審核)`clubId` 一律 null,整頁是空的、一句錯誤都沒有
  if (isError) return <OptionsError what="社團清單" error={error} onRetry={() => void refetch()} />
  return <ClubCascaderBase clubs={data} {...props} />
}

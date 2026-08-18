import { Grid } from 'antd'

// 成員列表的兩個時間欄(入社時間 / 更新時間)。
// 需求方定案:所有欄位不換行,寬度不足時依序隱藏 —— 先收更新時間,再收入社時間。
export function useMemberTimeColumns(sortKeys: readonly string[]): {
  showJoined: boolean
  showUpdated: boolean
} {
  const screens = Grid.useBreakpoint()
  // 首次 render 時 screens 是空物件:預設全開,量到寬度後才收
  return {
    // 正在依這一欄排序就一律留著:欄位收掉的話使用者看不到也取消不了自己下的排序
    showJoined: (screens.lg ?? true) || sortKeys.includes('created_at'),
    showUpdated: (screens.xl ?? true) || sortKeys.includes('updated_at'),
  }
}

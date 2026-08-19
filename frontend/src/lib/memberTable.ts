import { Grid } from 'antd'

export interface TimeColumns {
  showJoined: boolean
  showUpdated: boolean
}

// 成員列表的兩個時間欄(入社時間 / 更新時間)。
// 需求方定案:所有欄位不換行,寬度不足時依序隱藏 —— 先收更新時間,再收入社時間。
//
// 門檻比「看起來該有的」高一級:斷點量的是 viewport,而表格拿到的是
// viewport 減掉側欄 240px 與 shell 左右 padding 64px。1200px 的筆電上表格只有 896px,
// 兩個時間欄各 134px 一放進去,姓名與職稱這兩個彈性欄就被壓到剩不到 60px。
// 所以更新時間要 xxl(≥1600 → 表格 1296)、入社時間要 xl(≥1200 → 表格 896)。
export function timeColumnsFor(
  screens: ReturnType<typeof Grid.useBreakpoint>,
  sortKeys: readonly string[],
): TimeColumns {
  // 首次 render 時 screens 是空物件:預設全開,量到寬度後才收
  return {
    // 正在依這一欄排序就一律留著:欄位收掉的話使用者看不到也取消不了自己下的排序
    showJoined: (screens.xl ?? true) || sortKeys.includes('created_at'),
    showUpdated: (screens.xxl ?? true) || sortKeys.includes('updated_at'),
  }
}

export function useMemberTimeColumns(sortKeys: readonly string[]): TimeColumns {
  return timeColumnsFor(Grid.useBreakpoint(), sortKeys)
}

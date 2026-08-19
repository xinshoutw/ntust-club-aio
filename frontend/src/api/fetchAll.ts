// 小量清單抓全量:100/頁迴圈補滿 total(呼叫端保證資料量級小,如草稿活動、單社的進行中申請)
import { apiPaged, qs } from './client'

const PAGE_SIZE = 100

export async function fetchAllPages<T>(
  path: string,
  params: Record<string, string | number | boolean | string[] | undefined | null> = {},
): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; ; page++) {
    const { data, total } = await apiPaged<T[]>(`${path}${qs({ ...params, page, page_size: PAGE_SIZE })}`)
    out.push(...data)
    // 不足一頁即為最後一頁;抓取期間有新資料插隊時 out 會含重複列,
    // 只看 out.length >= total 會提早收工而漏掉尾端(total 僅作防無限迴圈的上限)
    if (data.length < PAGE_SIZE || out.length >= total + PAGE_SIZE) break
  }
  return out
}

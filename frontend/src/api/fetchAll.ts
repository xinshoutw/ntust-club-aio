// 小量清單抓全量:100/頁迴圈補滿 total(呼叫端保證資料量級小,如違規/維修/帳號)
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
    if (data.length === 0 || out.length >= total) break
  }
  return out
}

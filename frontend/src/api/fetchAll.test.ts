import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAllPages } from './fetchAll'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 逐頁回傳的假後端;total 可與實際筆數不符(模擬抓取期間有人寫入) */
const stub = (pages: number[][], total: number, seen: string[]) => {
  let call = 0
  vi.stubGlobal('fetch', (url: string) => {
    seen.push(url)
    const data = (pages[call++] ?? []).map((id) => ({ id }))
    return Promise.resolve(
      new Response(JSON.stringify({ success: true, data, error: null, meta: { total } }), {
        headers: { 'content-type': 'application/json' },
      }),
    )
  })
}

const fullPage = (from: number) => Array.from({ length: 100 }, (_, i) => from + i)

describe('fetchAllPages', () => {
  it('滿頁就續抓,遇到不足一頁才停', async () => {
    const seen: string[] = []
    stub([fullPage(1), [101, 102]], 102, seen)

    const rows = await fetchAllPages<{ id: number }>('/x')

    expect(seen).toHaveLength(2)
    expect(rows).toHaveLength(102)
  })

  it('抓取期間有新資料插隊,不會因為湊滿 total 就提早收工', async () => {
    const seen: string[] = []
    // total 說只有 100 筆,但實際回了滿滿一頁 + 一筆(期間有人新增)
    stub([fullPage(1), [101]], 100, seen)

    const rows = await fetchAllPages<{ id: number }>('/x')

    expect(rows).toHaveLength(101)
  })

  it('第一頁就不足一頁時只打一次', async () => {
    const seen: string[] = []
    stub([[1, 2, 3]], 3, seen)

    expect(await fetchAllPages<{ id: number }>('/x')).toHaveLength(3)
    expect(seen).toHaveLength(1)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { actionKeyOf, actionLabelOf, fetchAllAuditLogs } from './adminAudit'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 逐頁回傳的假後端;記下每次請求的 URL */
const stubPages = (pages: unknown[][], seen: string[]) => {
  let call = 0
  vi.stubGlobal('fetch', (url: string) => {
    seen.push(url)
    const data = pages[call++] ?? []
    const total = pages.reduce((n, p) => n + p.length, 0)
    return Promise.resolve(
      new Response(JSON.stringify({ success: true, data, error: null, meta: { total } }), {
        headers: { 'content-type': 'application/json' },
      }),
    )
  })
}

const row = (id: number) => ({
  id,
  user_id: 1,
  user_name: '王管理',
  role: 'admin',
  action: 'settings_updated',
  detail: '',
  ip: null,
  created_at: '2026-08-11T02:00:00Z',
})

describe('fetchAllAuditLogs', () => {
  it('用後端允許的 page_size 逐頁抓,篩選條件照參數名帶上', async () => {
    const seen: string[] = []
    stubPages([[row(1)]], seen)

    await fetchAllAuditLogs({ userId: 7, action: 'settings_updated', dateFrom: '2026-08-01' })

    expect(seen[0]).toContain('page_size=100') // 後端上限 100,超過會 422
    expect(seen[0]).toContain('user_id=7')
    expect(seen[0]).toContain('action=settings_updated')
    expect(seen[0]).toContain('date_from=2026-08-01')
  })

  it('抓取期間被推擠而重覆回傳的列只留一份', async () => {
    const seen: string[] = []
    // 滿頁才會續抓;第二頁的頭一筆是第一頁的尾巴(匯出期間有人寫入就會這樣)
    const first = Array.from({ length: 100 }, (_, i) => row(200 - i))
    stubPages([first, [row(101), row(100)]], seen)

    const rows = await fetchAllAuditLogs({})

    expect(seen).toHaveLength(2)
    expect(rows).toHaveLength(101)
    expect(new Set(rows.map((l) => l.id)).size).toBe(101)
  })
})

describe('actionKeyOf', () => {
  it('顯示詞與原始鍵可以來回轉換', () => {
    expect(actionKeyOf(actionLabelOf('settings_updated'))).toBe('settings_updated')
  })

  it('沒有對照的動作原樣來回,篩選仍送得出真正的鍵', () => {
    expect(actionLabelOf('brand_new_action')).toBe('brand_new_action')
    expect(actionKeyOf('brand_new_action')).toBe('brand_new_action')
  })
})

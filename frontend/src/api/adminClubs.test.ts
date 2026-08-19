import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAllAdminMembers } from './adminClubs'

afterEach(() => {
  vi.unstubAllGlobals()
})

const member = (id: number) => ({
  id,
  name: `社員${id}`,
  student_id: `B1${String(id).padStart(6, '0')}`,
  kind: 'member',
  title: null,
  phone: null,
  semester: '114-1',
  updated_at: '2026-08-01T00:00:00+08:00',
})

/** 匯出 CSV 走全量抓取:抓取期間有人新增名單也不能少抓尾端 */
describe('fetchAllAdminMembers', () => {
  it('滿頁就續抓,total 已被湊滿也不提早收工', async () => {
    const pages = [
      Array.from({ length: 100 }, (_, i) => member(i + 1)),
      [member(101)],
    ]
    let call = 0
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ success: true, data: pages[call++] ?? [], error: null, meta: { total: 100 } }),
          { headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    expect(await fetchAllAdminMembers(1, '114-1')).toHaveLength(101)
  })
})

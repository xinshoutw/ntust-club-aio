import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAllAdminMembers, groupActiveClubs, hasPublicData, type ClubOption } from './adminClubs'
import type { ClubPublicProfile } from './clubProfile'

afterEach(() => {
  vi.unstubAllGlobals()
})

const member = (id: number) => ({
  id,
  name: `社員${id}`,
  student_id: `B1${String(id).padStart(6, '0')}`,
  kind: 'member',
  title: null,
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

/** 全站選擇器共用這一支:判的是啟停用,不是「有沒有性質」—— 兩者不是同一條界線 */
describe('groupActiveClubs', () => {
  const club = (name: string, attribute: string | null, isActive: boolean): ClubOption => ({
    id: name.length,
    name,
    kind: '社團',
    attribute,
    isActive,
  })

  it('停用社團不列,啟用中的沒有性質也要列在「未分類」', () => {
    const folders = groupActiveClubs([
      club('熱舞社', '藝術性', true),
      club('停社', '藝術性', false), // 有性質但停用 → 不列
      club('待補性質社', null, true), // 遷移認不得性質,社團還在跑 → 留著
      club('舊社', null, false),
    ])

    expect(folders).toEqual([
      { label: '藝術性', options: ['熱舞社'] },
      { label: '未分類', options: ['待補性質社'] },
    ])
  })
})

describe('hasPublicData', () => {
  const empty: ClubPublicProfile = {
    tagline: '',
    tags: [],
    recruitStatus: '',
    publicEmail: '',
    socialLinks: {},
    officeLocation: '',
    regularSchedule: '',
    joinInfo: '',
    signupUrl: '',
    foundedYear: null,
    avatarUrl: null,
    bannerUrl: null,
    bannerDim: 0,
    bannerBlur: 0,
    bannerTextMode: 'auto',
    bannerLuma: null,
  }

  // 全空時行政端只顯示一句「尚未填寫」,不鋪一排 —— 整排 `—` 看起來像載入壞了
  it('一欄都沒填就是沒有公開資料', () => {
    expect(hasPublicData(empty)).toBe(false)
  })

  it('任何一欄有值就算有', () => {
    expect(hasPublicData({ ...empty, tagline: '每週三一起跳舞' })).toBe(true)
    expect(hasPublicData({ ...empty, tags: ['街舞'] })).toBe(true)
    expect(hasPublicData({ ...empty, socialLinks: { instagram: 'https://x.tw' } })).toBe(true)
    expect(hasPublicData({ ...empty, bannerUrl: '/api/v1/files/x' })).toBe(true)
  })

  // 黑化/模糊是顯示參數,沒有圖的時候它們的值不代表「填了東西」
  it('只有顯示參數不算有公開資料', () => {
    expect(hasPublicData({ ...empty, bannerDim: 40, bannerBlur: 20 })).toBe(false)
  })
})

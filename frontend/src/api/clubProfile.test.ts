import { describe, expect, it } from 'vitest'
import { LUMA_MIDPOINT, resolveTextMode, toPublicProfile } from './clubProfile'

describe('resolveTextMode', () => {
  it('手動指定時不看亮度', () => {
    expect(resolveTextMode('light', 250)).toBe('light')
    expect(resolveTextMode('dark', 0)).toBe('dark')
  })

  it('自動:橫幅底部亮就用深色字', () => {
    expect(resolveTextMode('auto', LUMA_MIDPOINT + 1)).toBe('dark')
    expect(resolveTextMode('auto', LUMA_MIDPOINT)).toBe('light')
  })

  // 沒有橫幅(或舊資料沒有亮度)時預設底色是深的 —— 拿不到值不代表「亮」
  it('自動:沒有亮度就用淺色字', () => {
    expect(resolveTextMode('auto', null)).toBe('light')
  })
})

describe('toPublicProfile', () => {
  const raw = {
    tagline: null,
    tags: [],
    recruit_status: null,
    public_email: null,
    social_links: [{ kind: 'instagram' as const, url: 'https://instagram.com/x' }],
    office_location: null,
    regular_schedule: null,
    join_info: null,
    signup_url: null,
    founded_year: null,
    avatar_file_id: null,
    banner_file_id: 'b7f3d0f4-0000-4000-8000-000000000000',
    banner_dim: 40,
    banner_blur: 0,
    banner_text_mode: 'auto' as const,
    banner_luma: 20,
  }

  it('社群連結收成一平台一格', () => {
    expect(toPublicProfile(raw as never).socialLinks).toEqual({
      instagram: 'https://instagram.com/x',
    })
  })

  it('沒有圖就沒有網址(不是指到一個會 404 的位址)', () => {
    const out = toPublicProfile(raw as never)
    expect(out.avatarUrl).toBeNull()
    expect(out.bannerUrl).toBe(`/api/v1/files/${raw.banner_file_id}`)
  })
})

import { describe, expect, it } from 'vitest'
import { fromProfile, profileChanged, toProfileInput } from './fields'
import type { ClubProfile, ClubPublicProfile } from '../../api/clubProfile'

// 對外公開資料一欄都沒填(遷入的社團與新社團都是這樣起步的)
const emptyPublic: ClubPublicProfile = {
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

// 遷入的社團有一批是這樣的:簡介空字串、網頁連結 NULL(migration/cms_import.py)
const migrated: ClubProfile = {
  name: '熱舞社',
  kind: '社團',
  enName: '',
  intro: '',
  url: '',
  emails: ['club@ntust.edu.tw', '', ''],
  discordWebhook: '',
  advisorName: '王老師',
  advisorDept: '',
  advisorEmail: '',
  advisorOutName: '',
  advisorOutDept: '',
  advisorOutEmail: '',
  suspendedUntil: null,
  suspendReason: '',
  public: emptyPublic,
}

describe('profileChanged', () => {
  const saved = fromProfile(migrated)

  // 網頁連結與簡介的必填掛在這個判定上:一律擋的話,這些社團連改密碼都送不出去
  it('只填了密碼欄不算動到 profile', () => {
    expect(profileChanged({ ...saved, pwCurrent: 'a', pwNew: 'b', pwConfirm: 'b' }, saved)).toBe(false)
  })

  it('動到 profile 的任何一欄都算', () => {
    expect(profileChanged({ ...saved, advisorEmail: 'teacher@ntust.edu.tw' }, saved)).toBe(true)
    expect(profileChanged({ ...saved, intro: '我們是熱舞社' }, saved)).toBe(true)
  })

  it('undefined 與空字串是同一件事(表單清空後是 undefined)', () => {
    expect(profileChanged({ ...saved, advisorDept: undefined }, saved)).toBe(false)
  })

  it('英文名稱不在 profile 欄位裡(改由行政端維護)', () => {
    expect(Object.keys(saved)).not.toContain('enName')
  })

  // 標籤是陣列、黑化程度是數字:拿 `?? ''` 比會把改動吞掉(儲存鈕永遠是乾淨的)
  it('陣列欄位的內容變了算動過', () => {
    expect(profileChanged({ ...saved, tags: ['街舞'] }, saved)).toBe(true)
    expect(profileChanged({ ...saved, tags: [] }, saved)).toBe(false)
  })

  it('數值欄位從 0 改成別的值算動過', () => {
    expect(profileChanged({ ...saved, bannerDim: 40 }, saved)).toBe(true)
    expect(profileChanged({ ...saved, bannerDim: 0 }, saved)).toBe(false)
  })

  it('形象圖不是表單欄位,換圖不會讓表單變 dirty', () => {
    expect(Object.keys(saved)).not.toContain('avatarUrl')
    expect(Object.keys(saved)).not.toContain('bannerLuma')
  })
})

describe('toProfileInput', () => {
  const saved = fromProfile(migrated)

  it('社群連結由攤平的六欄收回一平台一格', () => {
    const input = toProfileInput({ ...saved, socialInstagram: 'https://instagram.com/x' })
    expect(input.socialLinks.instagram).toBe('https://instagram.com/x')
    expect(input.socialLinks.facebook).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { fromProfile, profileChanged, toProfileInput } from './fields'
import type { ClubProfile, ClubPublicProfile } from '../../api/clubProfile'

// 對外公開資料一欄都沒填(遷入的社團與新社團都是這樣起步的)
const emptyPublic: ClubPublicProfile = {
  tagline: '',
  tags: [],
  recruitStatus: '',
  publicEmail: '',
  instagram: '',
  officeLocation: '',
  regularSchedule: '',
  joinInfo: '',
  signupUrl: '',
  avatarUrl: null,
  bannerUrl: null,
}

// 遷入的社團有一批是這樣的:簡介空字串、網頁連結 NULL(migration/cms_import.py)
const migrated: ClubProfile = {
  id: 1,
  publicVisible: true,
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

  // 驗送出去的內容,不驗 saved 的形狀:欄位改名或留一個 undefined 佔位,
  // `Object.keys` 那種寫法照樣綠,卻什麼都沒保護到
  it('英文名稱不會被這張表單送出(改由行政端維護)', () => {
    expect(Object.keys(toProfileInput(saved))).not.toContain('enName')
  })

  // 標籤是陣列:拿 `?? ''` 比會把改動吞掉(儲存鈕永遠是乾淨的)
  it('陣列欄位的內容變了算動過', () => {
    expect(profileChanged({ ...saved, tags: ['運動'] }, saved)).toBe(true)
    expect(profileChanged({ ...saved, tags: [] }, saved)).toBe(false)
  })

  it('形象圖不是表單欄位,換圖不會讓表單變 dirty', () => {
    const sent = Object.keys(toProfileInput(saved))
    expect(sent).not.toContain('avatarUrl')
    expect(sent).not.toContain('bannerUrl')
  })
})

describe('toProfileInput', () => {
  const saved = fromProfile(migrated)

  it('未填的欄位一律送空字串,由後端收成 null', () => {
    const input = toProfileInput({ ...saved, instagram: 'ntust_dance' })
    expect(input.instagram).toBe('ntust_dance')
    expect(input.tagline).toBe('')
  })
})

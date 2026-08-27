import { describe, expect, it } from 'vitest'
import { fromProfile, profileChanged } from './fields'
import type { ClubProfile } from '../../api/clubProfile'

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
  advisorPhone: '',
  advisorOutName: '',
  advisorOutDept: '',
  advisorOutEmail: '',
  advisorOutPhone: '',
  suspendedUntil: null,
  suspendReason: '',
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
})

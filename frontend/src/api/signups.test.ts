import { describe, expect, it } from 'vitest'
import { toDetail, toSignupItem } from './signups'

const base = {
  id: 1,
  name: '社團幹訓',
  description: '',
  kind: 'cadre_training' as const,
  event_at: '2026-09-20T09:00:00',
  place: '國際大樓 IB-101',
  signup_end: '2026-09-15T23:59:00',
  max_participants: 5,
  requires_confirmation: false,
  is_eval: false,
  accepting: true,
  my_status: 'none' as const,
  fields: [
    { key: 'phone', label: '聯絡電話', type: 'text', required: true },
    { key: 'meal', label: '膳食需求', type: 'select', options: ['葷', '素'] },
  ],
}

describe('toSignupItem', () => {
  it('datetime 轉 YYYY/MM/DD HH:mm 顯示格式', () => {
    const item = toSignupItem(base)
    expect(item.eventAt).toBe('2026/09/20 09:00')
    expect(item.deadline).toBe('2026/09/15 23:59')
  })

  it('截止/活動時間未設定時為 undefined', () => {
    const item = toSignupItem({ ...base, event_at: null, signup_end: null })
    expect(item.eventAt).toBeUndefined()
    expect(item.deadline).toBeUndefined()
  })

  it('欄位定義:未知型別退回 text、required 預設 false', () => {
    const item = toSignupItem({
      ...base,
      fields: [{ key: 'x', label: '未知', type: 'magic' }],
    })
    expect(item.fields[0]).toEqual({ key: 'x', label: '未知', type: 'text', required: false, options: undefined })
  })
})

describe('toDetail', () => {
  const detail = { ...base, is_eval: true, my_signup: null, my_draft: null, award_options: [] }

  it('帶出可選獎項', () => {
    const out = toDetail({ ...detail, award_options: [{ id: 'club', name: '最佳社團獎' }] })
    expect(out.awardOptions).toEqual([{ id: 'club', name: '最佳社團獎' }])
  })

  it('報名紀錄的獎項自帶名稱,不靠可選清單反查 —— 獎項事後停用仍顯示得出來', () => {
    const out = toDetail({
      ...detail,
      award_options: [],
      my_signup: {
        confirmed: true,
        created_at: '2026-09-01T10:00:00',
        entries: [{ id: 1, answers: { name: '甲' } }],
        awards: [{ id: 'finance', name: '最佳財務獎' }],
      },
    })
    expect(out.mySignup?.awards).toEqual([{ id: 'finance', name: '最佳財務獎' }])
  })

  it('後端未帶欄位時退回空陣列', () => {
    const out = toDetail({ ...detail, award_options: undefined as never })
    expect(out.awardOptions).toEqual([])
  })
})

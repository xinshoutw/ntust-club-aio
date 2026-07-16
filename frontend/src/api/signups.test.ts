import { describe, expect, it } from 'vitest'
import { toSignupItem } from './signups'

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

import { describe, expect, it } from 'vitest'
import { canActOn, canActOnClose, stageOfStatus } from './adminActivities'
import type { SessionUser } from './auth'

const admin = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 1,
  role: 'admin',
  username: 'a',
  name: 'A',
  isSuper: false,
  permissions: [],
  canViewEval: false,
  mustChangePassword: false,
  periods: [],
  ...over,
})

describe('canActOn(申請審核「本關」推導)', () => {
  it('依簽核鍵對應關卡', () => {
    expect(canActOn(admin({ permissions: ['approve_advisor'] }), 'pending_advisor')).toBe(true)
    expect(canActOn(admin({ permissions: ['approve_advisor'] }), 'pending_chief')).toBe(false)
    expect(canActOn(admin({ permissions: ['approve_chief'] }), 'pending_chief')).toBe(true)
  })

  it('super 可簽承辦人/組長關;學務長關須本人持 approve_dean(不得代簽)', () => {
    const root = admin({ isSuper: true })
    expect(canActOn(root, 'pending_advisor')).toBe(true)
    expect(canActOn(root, 'pending_chief')).toBe(true)
    expect(canActOn(root, 'pending_dean')).toBe(false)
    expect(canActOn(admin({ permissions: ['approve_dean'] }), 'pending_dean')).toBe(true)
  })

  it('非待審狀態/非管理員/未登入一律不可簽', () => {
    expect(canActOn(admin({ permissions: ['approve_advisor'] }), 'approved')).toBe(false)
    expect(canActOn(admin({ permissions: ['approve_advisor'] }), 'closing_pending_advisor')).toBe(false)
    expect(canActOn(admin({ role: 'club', permissions: ['approve_advisor'] }), 'pending_advisor')).toBe(false)
    expect(canActOn(null, 'pending_advisor')).toBe(false)
  })
})

describe('canActOnClose(結案承辦人單關)', () => {
  it('approve_advisor 或 super 可簽;僅持 aclose(頁面權限)不可', () => {
    expect(canActOnClose(admin({ permissions: ['approve_advisor'] }))).toBe(true)
    expect(canActOnClose(admin({ isSuper: true }))).toBe(true)
    expect(canActOnClose(admin({ permissions: ['aclose'] }))).toBe(false)
    expect(canActOnClose(null)).toBe(false)
  })
})

describe('stageOfStatus', () => {
  it('僅三個待審狀態有關卡', () => {
    expect(stageOfStatus('pending_advisor')).toBe('advisor')
    expect(stageOfStatus('pending_chief')).toBe('chief')
    expect(stageOfStatus('pending_dean')).toBe('dean')
    expect(stageOfStatus('approved')).toBeUndefined()
    expect(stageOfStatus('locked')).toBeUndefined()
  })
})

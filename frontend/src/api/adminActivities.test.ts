import { describe, expect, it } from 'vitest'
import { canActOn, canActOnClose, dropAutoUnlock, stageOfStatus, type ApprovalOut } from './adminActivities'
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

  it('持 approve_dean 者只剩第三關(D-38):前兩關不進他的待審佇列,super 亦同', () => {
    const dean = admin({ permissions: ['approve_advisor', 'approve_chief', 'approve_dean'] })
    expect(canActOn(dean, 'pending_dean')).toBe(true)
    expect(canActOn(dean, 'pending_advisor')).toBe(false)
    expect(canActOn(dean, 'pending_chief')).toBe(false)
    const rootDean = admin({ isSuper: true, permissions: ['approve_dean'] })
    expect(canActOn(rootDean, 'pending_advisor')).toBe(false)
    expect(canActOn(rootDean, 'pending_chief')).toBe(false)
  })

  it('非待審狀態/非管理員/未登入一律不可簽', () => {
    expect(canActOn(admin({ permissions: ['approve_advisor'] }), 'approved')).toBe(false)
    expect(canActOn(admin({ permissions: ['approve_advisor'] }), 'closing_pending_advisor')).toBe(false)
    expect(canActOn(admin({ role: 'club', permissions: ['approve_advisor'] }), 'pending_advisor')).toBe(false)
    expect(canActOn(null, 'pending_advisor')).toBe(false)
  })
})

describe('canActOnClose(結案承辦人單關)', () => {
  it('aclose 或 approve_advisor 或 super 可簽(decisions.md D-08:看得到就簽得下去)', () => {
    expect(canActOnClose(admin({ permissions: ['approve_advisor'] }))).toBe(true)
    expect(canActOnClose(admin({ isSuper: true }))).toBe(true)
    // 後端 _require_close_key 認這把鍵,前端關掉按鈕等於頁面進得去卻永遠簽不了
    expect(canActOnClose(admin({ permissions: ['aclose'] }))).toBe(true)
    expect(canActOnClose(admin({ permissions: ['areview'] }))).toBe(false)
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

const rec = (decision: string, over: Partial<ApprovalOut> = {}): ApprovalOut => ({
  stage: 'advisor',
  decision,
  reason: null,
  created_at: '2026-08-19T09:02:00+08:00',
  subject_type: 'activity_close',
  actor_name: '侍筱鳳',
  ...over,
})

// 後端 close_reject 為了 D-05 連寫兩筆(先 UNLOCK 再 REJECT,同一個承辦人、同一次操作)。
// 承辦人按的是「退回」—— 把那筆自動解鎖單獨列一行,讀起來像另外有人解鎖過這張單,
// 而簽核紀錄那個區塊的用途正是查「這張單被卡在哪」
describe('dropAutoUnlock', () => {
  it('退回前面那筆自動解鎖不留下', () => {
    expect(dropAutoUnlock([rec('unlock'), rec('reject')]).map((r) => r.decision)).toEqual(['reject'])
  })

  it('後面沒接退回的解鎖是承辦人真的按過的,留著', () => {
    expect(dropAutoUnlock([rec('unlock'), rec('approve')]).map((r) => r.decision)).toEqual([
      'unlock',
      'approve',
    ])
  })

  it('別人做的退回不會吃掉我的解鎖', () => {
    const rows = [rec('unlock'), rec('reject', { actor_name: '陳彥仁' })]
    expect(dropAutoUnlock(rows).map((r) => r.decision)).toEqual(['unlock', 'reject'])
  })

  it('申請退回不會吃掉結案解鎖', () => {
    const rows = [rec('unlock'), rec('reject', { subject_type: 'activity' })]
    expect(dropAutoUnlock(rows).map((r) => r.decision)).toEqual(['unlock', 'reject'])
  })
})

import { describe, expect, test } from 'vitest'
import { signupCsvRows } from './signupCsv'
import type { AdminSignupItem, Registration } from '../../api/adminSignups'

const item = (over: Partial<AdminSignupItem> = {}): AdminSignupItem => ({
  id: 1,
  name: '社團幹訓',
  kind: 'cadre_training',
  status: 'ended',
  deadline: '2026/08/01',
  maxParticipants: 5,
  clubsCount: 2,
  peopleCount: 1,
  pendingCount: 0,
  sessionBased: false,
  isEval: false,
  eventEnded: true,
  fields: [{ key: 'f1', label: '膳食需求', type: 'text', required: false }],
  description: '',
  signupStart: '2026/07/01 00:00',
  requiresConfirmation: false,
  isOpen: true,
  ...over,
})

const reg = (over: Partial<Registration> = {}): Registration => ({
  clubId: 1,
  club: '熱舞社',
  count: 1,
  confirmed: true,
  attendedSessions: 0,
  participants: [{ name: '陳予恩', studentId: 'B11109001', dept: '資工三', f1: '素' }],
  awards: [],
  ...over,
})

describe('signupCsvRows', () => {
  test('逐人一列,自訂欄位照順序接在系級之後', () => {
    const rows = signupCsvRows(item(), [reg()])
    expect(rows[0]).toEqual(['社團', '姓名', '學號', '系級', '膳食需求', '報名狀態'])
    expect(rows[1]).toEqual(['熱舞社', '陳予恩', 'B11109001', '資工三', '素', '已確認'])
  })

  test('補登的社團沒有名單也要出現一列 —— 少掉的正好是要核對的那幾個', () => {
    const rows = signupCsvRows(item(), [reg({ club: '吉他社', count: 0, participants: [] })])
    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual(['吉他社', '', '', '', '', '行政補登'])
    expect(rows[1]).toHaveLength(rows[0].length)
  })

  test('競賽報名多一欄參賽獎項,補登列同樣對得齊', () => {
    const rows = signupCsvRows(item({ isEval: true }), [
      reg({ awards: ['最佳活動獎'] }),
      reg({ club: '吉他社', count: 0, participants: [], awards: [] }),
    ])
    expect(rows[0][1]).toBe('參賽獎項')
    expect(rows[1][1]).toBe('最佳活動獎')
    expect(rows.every((r) => r.length === rows[0].length)).toBe(true)
  })
})

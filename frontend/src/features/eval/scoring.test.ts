import { describe, expect, test } from 'vitest'
import { applyOverrides, computeAdScores, totalOf, type ScoringInput } from './scoring'

const base: ScoringInput = {
  closed: [],
  results: [],
  rosterBySemester: {},
  hasWebsite: false,
  leaderMeetingsAttended: 0,
  cadreTrainingAttended: false,
  violationCount: 0,
  merit: 0,
}

const act = (id: string, date: string, large = false) => ({ id, name: id, date, large })
const result = (activityId: string, patch: Partial<ScoringInput['results'][number]> = {}) => ({
  activityId,
  hasPhotos: false,
  hasReport: false,
  hasFeedback: false,
  ...patch,
})

const score = (input: Partial<ScoringInput>, key: string) =>
  computeAdScores({ ...base, ...input }).find((s) => s.key === key)!.auto

describe('ad1 活動及社課申請', () => {
  test('一般 1 分、認可的大型 3 分', () => {
    expect(score({ closed: [act('a', '2026/03/01'), act('b', '2026/04/01', true)] }, 'ad1')).toBe(4)
  })
  test('一天最多計一次,取當日最高', () => {
    expect(
      score({ closed: [act('a', '2026/03/01'), act('b', '2026/03/01', true), act('c', '2026/03/01')] }, 'ad1'),
    ).toBe(3)
  })
  test('上限 15', () => {
    const closed = Array.from({ length: 9 }, (_, i) => act(`a${i}`, `2026/03/${String(i + 1).padStart(2, '0')}`, true))
    expect(score({ closed }, 'ad1')).toBe(15)
  })
})

describe('ad2 照片/影片', () => {
  // 系統不自己數張數:社團可能是交紙本,由承辦在結案審核時確認(D-14)
  test('承辦沒確認照片就不計分,確認了就計', () => {
    const closed = [act('a', '2026/03/01')]
    expect(score({ closed, results: [result('a', { hasPhotos: false })] }, 'ad2')).toBe(0)
    expect(score({ closed, results: [result('a', { hasPhotos: true })] }, 'ad2')).toBe(1)
  })
  test('大型 ×3;未結案活動的上傳不採計', () => {
    const closed = [act('a', '2026/03/01', true)]
    const results = [result('a', { hasPhotos: true }), result('ghost', { hasPhotos: true })]
    expect(score({ closed, results }, 'ad2')).toBe(3)
  })
})

describe('ad3/ad4 成果單與心得', () => {
  test('有給就有分;心得每件 2 分、大型 6 分、上限 30', () => {
    const closed = [act('a', '2026/03/01'), act('b', '2026/03/02', true)]
    const results = [result('a', { hasReport: true, hasFeedback: true }), result('b', { hasFeedback: true })]
    expect(score({ closed, results }, 'ad3')).toBe(1)
    expect(score({ closed, results }, 'ad4')).toBe(8)
    const many = Array.from({ length: 6 }, (_, i) => act(`x${i}`, `2026/04/0${i + 1}`, true))
    expect(score({ closed: many, results: many.map((a) => result(a.id, { hasFeedback: true })) }, 'ad4')).toBe(30)
  })

  // 兩項各自獨立:承辦只確認了報告表,心得那一項就是 0
  test('沒確認心得就不計 ad4', () => {
    const closed = [act('a', '2026/03/01'), act('b', '2026/03/02', true)]
    const results = [result('a', { hasReport: true }), result('b', { hasReport: true })]
    expect(score({ closed, results }, 'ad3')).toBe(4)
    expect(score({ closed, results }, 'ad4')).toBe(0)
  })
})

describe('ad5 名單更新', () => {
  test('0 人 0 分、1–9 人 2.5 分、10 人以上 5 分', () => {
    expect(score({ rosterBySemester: { '114-2': 0, '115-1': 0 } }, 'ad5')).toBe(0)
    expect(score({ rosterBySemester: { '114-2': 4, '115-1': 0 } }, 'ad5')).toBe(2.5)
    expect(score({ rosterBySemester: { '114-2': 10, '115-1': 9 } }, 'ad5')).toBe(7.5)
    expect(score({ rosterBySemester: { '114-2': 10, '115-1': 30 } }, 'ad5')).toBe(10)
  })
})

describe('ad6–ad8 與加減分', () => {
  test('網頁有連結即滿分;幹訓依簽到', () => {
    expect(score({ hasWebsite: true }, 'ad6')).toBe(5)
    expect(score({ cadreTrainingAttended: true }, 'ad8')).toBe(5)
  })
  test('負責人會議每場簽到 1.25 分,全學年 4 場滿分 5 分', () => {
    expect(score({ leaderMeetingsAttended: 0 }, 'ad7')).toBe(0)
    expect(score({ leaderMeetingsAttended: 2 }, 'ad7')).toBe(2.5)
    expect(score({ leaderMeetingsAttended: 4 }, 'ad7')).toBe(5)
    expect(score({ leaderMeetingsAttended: 6 }, 'ad7')).toBe(5)
  })
  test('違規每筆 −1 上限 −10;表現優良上限 +5', () => {
    expect(score({ violationCount: 3 }, 'adj')).toBe(-3)
    expect(score({ violationCount: 14 }, 'adj')).toBe(-10)
    expect(score({ merit: 9, violationCount: 0 }, 'adj')).toBe(5)
    expect(score({ merit: 2, violationCount: 4 }, 'adj')).toBe(-2)
  })
})

describe('管理員調整', () => {
  test('override 蓋過自動分,null 表示回到自動', () => {
    const scores = computeAdScores({ ...base, hasWebsite: true })
    const withOverride = applyOverrides(scores, { ad6: 2 })
    const ad6 = withOverride.find((s) => s.key === 'ad6')!
    expect(ad6.final).toBe(2)
    expect(ad6.overridden).toBe(true)
    const reverted = applyOverrides(scores, { ad6: null })
    expect(reverted.find((s) => s.key === 'ad6')!.final).toBe(5)
    expect(reverted.find((s) => s.key === 'ad6')!.overridden).toBe(false)
  })
  test('總分為各項採用分數加總', () => {
    const scores = applyOverrides(computeAdScores({ ...base, hasWebsite: true, merit: 3 }), {})
    expect(totalOf(scores)).toBe(8)
  })
  test('行政資料總分上限 100(滿分加計表現優良仍以 100 計)', () => {
    const closed = Array.from({ length: 20 }, (_, i) =>
      act(`x${i}`, `2026/03/${String(i + 1).padStart(2, '0')}`, true),
    )
    const full: ScoringInput = {
      closed,
      results: closed.map((a) => result(a.id, { hasPhotos: true, hasReport: true, hasFeedback: true })),
      rosterBySemester: { '114-2': 30, '115-1': 30 },
      hasWebsite: true,
      leaderMeetingsAttended: 4,
      cadreTrainingAttended: true,
      violationCount: 0,
      merit: 5,
    }
    expect(totalOf(applyOverrides(computeAdScores(full), {}))).toBe(100)
  })
  test('行政資料總分下限 0(勸導扣分不讓總分變成負數)', () => {
    const scores = applyOverrides(computeAdScores({ ...base, violationCount: 10 }), {})
    expect(scores.find((s) => s.key === 'adj')!.final).toBe(-10)
    expect(totalOf(scores)).toBe(0)
  })
})

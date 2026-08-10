import { describe, expect, it } from 'vitest'
import { validationDetail } from './client'

describe('validationDetail', () => {
  it('自訂驗證器的中文訊息連欄位一起帶出', () => {
    expect(validationDetail([{ loc: ['body', 'periods'], msg: 'Value error, 至少選擇一個時段' }])).toBe(
      'periods:至少選擇一個時段',
    )
  })

  it('pydantic 內建的英文訊息只留欄位', () => {
    expect(
      validationDetail([{ loc: ['body', 'student_id'], msg: 'String should have at most 20 characters' }]),
    ).toBe('student_id')
  })

  it('巢狀欄位保留索引,分得出是哪一列', () => {
    expect(
      validationDetail([
        { loc: ['body', 'reflections', 0, 'body'], msg: 'Field required' },
        { loc: ['body', 'reflections', 1, 'body'], msg: 'Field required' },
      ]),
    ).toBe('reflections.0.body、reflections.1.body')
  })

  it('超過三項只列前三項並附總數', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((f) => ({ loc: ['body', f], msg: 'Field required' }))
    expect(validationDetail(many)).toBe('a、b、c 等 5 項')
  })

  it('loc 只剩請求段落標記時,中文訊息仍留下、英文訊息整條略過', () => {
    expect(validationDetail([{ loc: ['body'], msg: 'Value error, 起訖日期不合法' }])).toBe('起訖日期不合法')
    expect(validationDetail([{ loc: ['body'], msg: 'Input should be a valid dictionary' }])).toBeNull()
  })

  it('非驗證錯誤(無 detail 或空陣列)回 null', () => {
    expect(validationDetail(undefined)).toBeNull()
    expect(validationDetail([])).toBeNull()
    expect(validationDetail([{ loc: ['body', 'x'] }])).toBeNull()
  })
})

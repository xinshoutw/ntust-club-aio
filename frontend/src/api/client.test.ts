import { describe, expect, it } from 'vitest'
import { validationDetail } from './client'

describe('validationDetail', () => {
  it('取 loc 尾端的欄位名,略過 body/query 這類前綴', () => {
    expect(
      validationDetail([{ loc: ['body', 'student_id'], msg: 'String should have at most 20 characters' }]),
    ).toBe('student_id:String should have at most 20 characters')
  })

  it('剝掉自訂驗證器的 Value error 前綴', () => {
    expect(validationDetail([{ loc: ['body', 'periods'], msg: 'Value error, 至少選擇一個時段' }])).toBe(
      'periods:至少選擇一個時段',
    )
  })

  it('多筆以分號相連', () => {
    expect(
      validationDetail([
        { loc: ['body', 'name'], msg: 'Field required' },
        { loc: ['body', 'date'], msg: 'Field required' },
      ]),
    ).toBe('name:Field required;date:Field required')
  })

  it('loc 只剩前綴時只給訊息', () => {
    expect(validationDetail([{ loc: ['body'], msg: 'Input should be a valid dictionary' }])).toBe(
      'Input should be a valid dictionary',
    )
  })

  it('非驗證錯誤(無 detail 或空陣列)回 null', () => {
    expect(validationDetail(undefined)).toBeNull()
    expect(validationDetail([])).toBeNull()
    expect(validationDetail([{ loc: ['body', 'x'] }])).toBeNull()
  })
})

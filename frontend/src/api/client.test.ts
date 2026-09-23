import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, isUnauthorized, validationDetail } from './client'

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

describe('isUnauthorized', () => {
  it('只有帶 401 的 ApiError 算「確定已登出」', () => {
    expect(isUnauthorized(new ApiError('請先登入', 401))).toBe(true)
  })

  it('伺服器錯誤與斷線都不算 —— 那是「無法確認」,不是「已登出」', () => {
    expect(isUnauthorized(new ApiError('伺服器內部錯誤', 500))).toBe(false)
    expect(isUnauthorized(new TypeError('Failed to fetch'))).toBe(false)
  })

  it('訊息像也不算(沒有狀態碼就不能下結論)', () => {
    expect(isUnauthorized(new Error('請先登入'))).toBe(false)
  })
})

describe('api 的錯誤', () => {
  afterEach(() => vi.unstubAllGlobals())

  // 臨時場地借用一次送多筆:後端在 meta.slot 說是第幾筆,頁面靠它標出那一列
  it('信封的 meta 整個掛在 ApiError 上，code 也在', async () => {
    const body = { success: false, data: null, error: '第 2 筆 2099/01/03 已有申請', meta: { code: 'CONFLICT', slot: 2 } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 409 })))
    const err = await api('/club/venue-bookings', { method: 'POST', body: '{}' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('CONFLICT')
    expect((err as ApiError).meta.slot).toBe(2)
  })
})

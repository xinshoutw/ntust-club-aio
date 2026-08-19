import { describe, expect, test } from 'vitest'
import { notFoundText } from './selectOptions'

const ok = { isPending: false, isError: false }

describe('notFoundText', () => {
  test('查詢就緒才說「真的沒有」', () => {
    expect(notFoundText(ok, '目前沒有場地', '場地清單')).toBe('目前沒有場地')
  })

  test('失敗不說成沒有資料,並給下一步', () => {
    expect(notFoundText({ isPending: false, isError: true }, '目前沒有場地', '場地清單')).toBe(
      '場地清單載入失敗,請重新整理頁面',
    )
  })

  test('載入中也不說成沒有資料(給了 notFoundContent 就沒有 spinner 了)', () => {
    expect(notFoundText({ isPending: true, isError: false }, '目前沒有場地', '場地清單')).toBe(
      '場地清單載入中…',
    )
  })
})

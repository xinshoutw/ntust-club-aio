import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadCsv, toCsv } from './csv'

describe('toCsv', () => {
  it('含逗號/引號/換行的欄位加引號並跳脫', () => {
    expect(toCsv([['a,b', 'say "hi"', 'l1\nl2']])).toBe('"a,b","say ""hi""","l1\nl2"')
  })

  it('單獨的 CR 也要引號', () => {
    // 不引號化的話,解析器會在 CR 斷列,把 =cmd 當成新一列的第一格,繞過公式中和
    expect(toCsv([['x\r=cmd']])).toBe('"x\r=cmd"')
  })

  it('= + - @ 開頭的欄位前置單引號', () => {
    expect(toCsv([['=SUM(A1)', '+1', '-1', '@x', 'ok']])).toBe("'=SUM(A1),'+1,'-1,'@x,ok")
  })
})

describe('downloadCsv', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('不在 click 的同一輪就 revoke blob(Safari 會在下載真正開始前失去來源)', () => {
    vi.useFakeTimers()
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadCsv('a.csv', [['x']])
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x')
  })
})

import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

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

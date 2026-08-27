import { describe, expect, it } from 'vitest'
import { PHONE_RULE, normalizePhone } from './form'

describe('normalizePhone', () => {
  it('滿 10 碼才補 -,手機切在第 4 碼後', () => {
    expect(normalizePhone('091234567')).toBe('091234567')
    expect(normalizePhone('0912345678')).toBe('0912-345678')
  })

  // 市話也是 10 碼:切在第 4 碼後會變成 0227-333141,那不是任何人寫電話的方式
  it('非 09 開頭的 10 碼切在區碼後', () => {
    expect(normalizePhone('0227333141')).toBe('02-27333141')
  })

  it('4 碼分機不補 -', () => {
    expect(normalizePhone('7604')).toBe('7604')
  })

  it('只留數字:貼進來的 (02)2733-3141 也收得下', () => {
    expect(normalizePhone('(02)2733-3141')).toBe('02-27333141')
  })

  it('超過 10 碼的部分丟掉,不讓輸入框無限長', () => {
    expect(normalizePhone('09123456789999')).toBe('0912-345678')
  })
})

describe('PHONE_RULE', () => {
  it('接受 normalizePhone 的三種輸出', () => {
    for (const ok of ['7604', '0912-345678', '02-27333141']) {
      expect(PHONE_RULE.pattern.test(ok)).toBe(true)
    }
  })

  it('打到一半的號碼擋下來', () => {
    for (const bad of ['091', '09123', '0912345678', '']) {
      expect(PHONE_RULE.pattern.test(bad)).toBe(false)
    }
  })
})

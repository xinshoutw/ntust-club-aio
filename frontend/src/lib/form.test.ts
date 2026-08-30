import { describe, expect, it } from 'vitest'
import { PHONE_RULE, normalizePhone } from './form'

describe('normalizePhone', () => {
  // 邊打邊補,不是打完才補:第 5 碼與第 8 碼各補一個
  it('第 5 碼與第 8 碼各補一個 -', () => {
    expect(normalizePhone('0912')).toBe('0912')
    expect(normalizePhone('09123')).toBe('0912-3')
    expect(normalizePhone('0912345')).toBe('0912-345')
    expect(normalizePhone('09123456')).toBe('0912-345-6')
    expect(normalizePhone('0912345678')).toBe('0912-345-678')
  })

  it('4 碼分機停在第一段,沒有 -', () => {
    expect(normalizePhone('7604')).toBe('7604')
  })

  it('只留數字:貼進來的 0912 345 678 也收得下', () => {
    expect(normalizePhone('0912 345 678')).toBe('0912-345-678')
  })

  // 截斷會把這支校內電話(spec 裡真實出現過的寫法)悄悄換成另一支合法號碼
  it('超過 10 碼不截斷,整串留著讓規則擋下來', () => {
    expect(normalizePhone('2733-3141#7604')).toBe('2733-314-17604')
    expect(PHONE_RULE.pattern.test(normalizePhone('2733-3141#7604'))).toBe(false)
  })
})

describe('PHONE_RULE', () => {
  it('接受 4 碼分機與 09 開頭的 10 碼手機', () => {
    expect(PHONE_RULE.pattern.test('7604')).toBe(true)
    expect(PHONE_RULE.pattern.test('0912-345-678')).toBe(true)
  })

  // 10 碼一律是手機:市話(含 02 這種 10 碼的)不收
  it('10 碼但不是 09 開頭的擋下來', () => {
    expect(PHONE_RULE.pattern.test(normalizePhone('0227333141'))).toBe(false)
  })

  it('打到一半的號碼擋下來', () => {
    for (const bad of ['091', '0912-3', '0912-345', '0912-345-67', '']) {
      expect(PHONE_RULE.pattern.test(bad)).toBe(false)
    }
  })
})

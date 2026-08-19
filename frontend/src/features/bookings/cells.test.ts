import { describe, expect, it } from 'vitest'
import { emptyCellState } from './cells'

describe('emptyCellState', () => {
  it('可臨時借用的場地,空格就是可借', () => {
    expect(emptyCellState({ allowFixed: true, allowTemp: true })).toBe('free')
    expect(emptyCellState({ allowFixed: false, allowTemp: true })).toBe('free')
  })

  it('只開放固定借用的場地借不到,但那不是「不開放」', () => {
    expect(emptyCellState({ allowFixed: true, allowTemp: false })).toBe('fixedOnly')
  })

  it('兩種都不開放才是不開放', () => {
    expect(emptyCellState({ allowFixed: false, allowTemp: false })).toBe('closed')
  })
})

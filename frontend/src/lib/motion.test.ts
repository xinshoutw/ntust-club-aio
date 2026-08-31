import { afterEach, expect, test } from 'vitest'
import { scrollBehavior } from './motion'

const real = window.matchMedia
afterEach(() => {
  window.matchMedia = real
})

const reduceMotion = (matches: boolean) => {
  window.matchMedia = ((query: string) => ({ ...real(query), matches })) as typeof window.matchMedia
}

test('OS 關閉動畫時改成瞬間捲動', () => {
  reduceMotion(true)
  expect(scrollBehavior()).toBe('auto')
})

test('平常維持平滑捲動', () => {
  reduceMotion(false)
  expect(scrollBehavior()).toBe('smooth')
})

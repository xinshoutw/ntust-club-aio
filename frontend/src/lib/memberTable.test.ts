import { afterEach, describe, expect, test } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMemberTimeColumns } from './memberTable'

const original = window.matchMedia

/** 只讓不超過 width 的斷點成立(AntD 的斷點查詢長成 `(min-width: 1200px)`) */
const setWidth = (width: number) => {
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0)
    return {
      matches: width >= min,
      media: query,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    } as unknown as MediaQueryList
  }) as typeof window.matchMedia
}

afterEach(() => {
  window.matchMedia = original
})

describe('useMemberTimeColumns', () => {
  test('寬螢幕兩欄都在', () => {
    setWidth(1600)
    expect(renderHook(() => useMemberTimeColumns([])).result.current).toEqual({
      showJoined: true,
      showUpdated: true,
    })
  })

  test('依序隱藏:先收更新時間,再收入社時間', () => {
    setWidth(1100)
    expect(renderHook(() => useMemberTimeColumns([])).result.current).toEqual({
      showJoined: true,
      showUpdated: false,
    })

    setWidth(800)
    expect(renderHook(() => useMemberTimeColumns([])).result.current).toEqual({
      showJoined: false,
      showUpdated: false,
    })
  })

  test('正在依那一欄排序時不收:否則使用者看不到也取消不了自己下的排序', () => {
    setWidth(800)
    expect(renderHook(() => useMemberTimeColumns(['updated_at'])).result.current).toEqual({
      showJoined: false,
      showUpdated: true,
    })
  })
})

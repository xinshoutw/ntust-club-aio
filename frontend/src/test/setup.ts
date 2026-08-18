// jsdom 缺的兩支瀏覽器 API:AntD 的 responsive observer 與 Skeleton/Dropdown 一啟動就要,
// 沒有的話任何一個 render() 都是 ReferenceError,與被測行為無關。
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// RTL 的自動 cleanup 只在 globals: true 時掛得上;這裡沿用「測試檔自己 import」的慣例,所以手動掛。
afterEach(cleanup)

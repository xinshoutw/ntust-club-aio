// jsdom 缺的兩支瀏覽器 API:AntD 的 responsive observer 與 Skeleton/Dropdown 一啟動就要,
// 沒有的話任何一個 render() 都是 ReferenceError,與被測行為無關。
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// 預設「沒有任何斷點成立」:元件測試裡 AntD 的 Grid.useBreakpoint 會量到最窄的一種。
// 要測特定寬度就在該測試自己覆寫 window.matchMedia(見 lib/memberTable.test.ts 的 screensAt)。
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

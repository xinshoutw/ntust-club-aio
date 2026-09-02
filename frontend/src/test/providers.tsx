import { useState, type ReactNode } from 'react'
import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// 元件測試的最小外殼:AntD 的 message/modal context + 一份**每次 render 新建**的
// QueryClient(模組層單例會把 cache 與 mutation 狀態帶到下一個測試)。
// 元件自己拿 mutation hook(如活動彈窗的刪除)時,沒有 QueryClient 整棵樹會掛掉
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={client}>
      <App>{children}</App>
    </QueryClientProvider>
  )
}

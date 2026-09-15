/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // 全域 jsdom:純函式測試在 jsdom 下照跑,不值得為它們維護第二種 environment
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // 預設的 5s 對「渲染一整頁 AntD 表單」這種測試在併發下不夠:單獨跑
    // `submitConfirm.test.tsx` 最慢的一則是 1.4s,64 個測試檔一起跑時同一則
    // 變成 3.3s、另一則 4.2s —— 離 5s 只剩一成餘裕,機器稍忙就隨機紅一條,
    // 而紅的內容與被測行為無關。CI 的機器比本機慢,餘裕要留夠
    testTimeout: 15_000,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // 開發時後端在本機 8000(uvicorn --reload);明確走 IPv4,
      // 避免 localhost 解析到 ::1 被其他佔用 8000 的程式(如 OrbStack)接走
      '/api': 'http://127.0.0.1:8000',
    },
  },
})

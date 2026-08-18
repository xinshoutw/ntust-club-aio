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

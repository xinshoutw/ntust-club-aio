import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp, ConfigProvider } from 'antd'
import zhTW from 'antd/locale/zh_TW'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-tw'
import '@fontsource/noto-sans-tc/400.css'
import '@fontsource/noto-sans-tc/500.css'
import '@fontsource/noto-sans-tc/600.css'
import '@fontsource/noto-sans-tc/700.css'
import { AuthProvider } from './app/auth'
import App from './App'
import './index.css'

dayjs.locale('zh-tw')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

const FONT_FAMILY = "'Noto Sans TC', 'PingFang TC', system-ui, sans-serif"

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhTW}
      theme={{
        token: {
          colorPrimary: '#9E1B32',
          colorSuccess: '#2E7D57',
          colorWarning: '#9A6100',
          colorError: '#C13B34',
          colorInfo: '#2F6FBF',
          colorTextBase: '#1F2430',
          colorBgLayout: '#F5F6F8',
          colorBorder: '#E4E7EC',
          colorBorderSecondary: '#E4E7EC',
          borderRadius: 6,
          fontSize: 14,
          fontFamily: FONT_FAMILY,
          controlHeight: 40,
        },
        components: {
          Button: { controlHeight: 40, fontWeight: 500 },
        },
      }}
    >
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
)

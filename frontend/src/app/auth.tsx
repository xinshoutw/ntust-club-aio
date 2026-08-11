import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TAKEOVER_DISMISSED_KEY } from '../components/layout/TakeoverOverlay'
import { UNAUTHORIZED_EVENT } from '../api/client'
import { loginApi, logoutApi, meApi, type Role, type SessionUser } from '../api/auth'

export type { Role, SessionUser }

interface AuthContextValue {
  user: SessionUser | null
  /** 開機恢復 session 中(避免閃現登入頁) */
  booting: boolean
  /** 開機時 /auth/me 非 401 失敗:「無法確認登入狀態」,不是「已登出」 */
  bootError: Error | null
  /** 重試開機的 session 恢復 */
  retryBoot: () => void
  login: (username: string, password: string) => Promise<SessionUser>
  logout: () => Promise<void>
  /** 改密完成等使用者資料變動後,原地更新 context */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState<Error | null>(null)
  // 401 走 UNAUTHORIZED_EVENT(client.ts 在 throw 之前同步廣播),所以 catch 執行時這面旗
  // 已經是最新的:未過期而失敗 = 伺服器或網路問題,不能靜靜把人導去登入頁當成「已登出」
  const expired = useRef(false)

  // session 為 httpOnly cookie:重新整理後以 /auth/me 恢復登入狀態
  const verify = useCallback(() => {
    setBooting(true)
    setBootError(null)
    expired.current = false
    meApi()
      .then((u) => setUser(u))
      .catch((e: unknown) => {
        setUser(null)
        if (!expired.current) setBootError(e instanceof Error ? e : new Error('無法確認登入狀態'))
      })
      .finally(() => setBooting(false))
  }, [])
  useEffect(() => {
    verify()
  }, [verify])

  // 任一請求收到 401 即視為 session 過期:清掉登入狀態,RequireRole 會導回登入頁
  useEffect(() => {
    const expire = () => {
      expired.current = true
      setUser(null)
      setBootError(null)
    }
    window.addEventListener(UNAUTHORIZED_EVENT, expire)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, expire)
  }, [])

  const login = useCallback(
    async (username: string, password: string): Promise<SessionUser> => {
      const next = await loginApi(username, password)
      // 蓋板公告「每次登入」都要重新顯示:清掉上次登入的關閉紀錄
      sessionStorage.removeItem(TAKEOVER_DISMISSED_KEY)
      // 同一台電腦換人登入時,前一位使用者的快取不得外流到新 session
      qc.clear()
      setUser(next)
      return next
    },
    [qc],
  )

  const logout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      // session 已失效也視為登出成功
    }
    qc.clear()
    setUser(null)
  }, [qc])

  const refresh = useCallback(async () => {
    try {
      setUser(await meApi())
    } catch {
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, booting, bootError, retryBoot: verify, login, logout, refresh }),
    [user, booting, bootError, verify, login, logout, refresh],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必須在 AuthProvider 內使用')
  return ctx
}

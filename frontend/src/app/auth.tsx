import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { TAKEOVER_DISMISSED_KEY } from '../components/layout/TakeoverOverlay'
import { loginApi, logoutApi, meApi, type Role, type SessionUser } from '../api/auth'

export type { Role, SessionUser }

interface AuthContextValue {
  user: SessionUser | null
  /** 開機恢復 session 中(避免閃現登入頁) */
  booting: boolean
  login: (username: string, password: string) => Promise<SessionUser>
  logout: () => Promise<void>
  /** 改密完成等使用者資料變動後,原地更新 context */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [booting, setBooting] = useState(true)

  // session 為 httpOnly cookie:重新整理後以 /auth/me 恢復登入狀態
  useEffect(() => {
    meApi()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setBooting(false))
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<SessionUser> => {
    const next = await loginApi(username, password)
    // 蓋板公告「每次登入」都要重新顯示:清掉上次登入的關閉紀錄
    sessionStorage.removeItem(TAKEOVER_DISMISSED_KEY)
    setUser(next)
    return next
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      // session 已失效也視為登出成功
    }
    setUser(null)
  }, [])

  const refresh = useCallback(async () => {
    try {
      setUser(await meApi())
    } catch {
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, booting, login, logout, refresh }),
    [user, booting, login, logout, refresh],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必須在 AuthProvider 內使用')
  return ctx
}

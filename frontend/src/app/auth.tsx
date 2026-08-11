import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TAKEOVER_DISMISSED_KEY } from '../components/layout/TakeoverOverlay'
import { ApiError, UNAUTHORIZED_EVENT } from '../api/client'
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

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error('無法確認登入狀態'))

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState<Error | null>(null)
  // 開機驗證的世代序號:登入或重試會讓上一輪的結果作廢
  // (慢後端下使用者可能在 /auth/me 還沒回來時就登入成功,晚到的 catch 不得把人清掉)
  const gen = useRef(0)

  // session 為 httpOnly cookie:重新整理後以 /auth/me 恢復登入狀態。
  // 401 = 真的沒有 session(後端對無 cookie/過期/停用一律 401)→ 交給 RequireRole 導去登入頁;
  // 其他失敗 = 伺服器或網路問題,不能靜靜把人導去登入頁當成「已登出」
  const verify = useCallback(() => {
    const mine = ++gen.current
    setBooting(true)
    meApi()
      .then((u) => {
        if (mine !== gen.current) return
        setUser(u)
        setBootError(null)
      })
      .catch((e: unknown) => {
        if (mine !== gen.current) return
        setUser(null)
        // 錯誤自己帶狀態碼(ApiError),不依賴事件派發的時序
        setBootError(e instanceof ApiError && e.status === 401 ? null : toError(e))
      })
      .finally(() => {
        if (mine === gen.current) setBooting(false)
      })
  }, [])
  useEffect(() => {
    verify()
  }, [verify])

  // 任一請求收到 401 即視為 session 過期:清掉登入狀態,RequireRole 會導回登入頁
  useEffect(() => {
    const expire = () => {
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
      // gate 的順序是 bootError 早於 user:不清掉的話登入成功還會被「無法確認登入狀態」擋住,
      // 而開機失敗後停在 /login 重新登入正是最常見的路徑
      gen.current += 1
      setBootError(null)
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
    gen.current += 1
    setBootError(null)
    setUser(null)
  }, [qc])

  const refresh = useCallback(async () => {
    try {
      setUser(await meApi())
    } catch (e) {
      // 只有 401 才是「已登出」;其他失敗保留現有 user
      // (改密成功後這支一失敗就登出,使用者會拿新密碼一直登入失敗)
      if (e instanceof ApiError && e.status === 401) setUser(null)
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

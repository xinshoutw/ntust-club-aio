import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type Role = 'club' | 'admin'

export interface SessionUser {
  name: string
  role: Role
  club?: string
}

interface AuthContextValue {
  user: SessionUser | null
  login: (username: string) => SessionUser
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const STORAGE_KEY = 'club-aio.session'

function readStored(): SessionUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SessionUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(readStored)

  // ponytail: 假登入,後端 auth 完成後換成 API + session cookie
  const login = useCallback((username: string): SessionUser => {
    const isAdmin = username.toLowerCase().includes('admin')
    const next: SessionUser = isAdmin
      ? { name: '王家豪(輔導老師)', role: 'admin' }
      : { name: '顏志明', role: 'club', club: '資工系學會' }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setUser(next)
    return next
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必須在 AuthProvider 內使用')
  return ctx
}

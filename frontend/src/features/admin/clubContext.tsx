import { createContext, useContext, useState, type ReactNode } from 'react'
import { CLUBS_MASTER } from './clubsMock'

// 行政端「選擇社團」跨頁同步:社團總覽/成員管理/管理項目/行政分審核共用同一選取,
// 寫入 sessionStorage 讓重新整理也保留;接後端後另補 ?club= URL 參數
const STORAGE_KEY = 'admin.selectedClub'

const AdminClubContext = createContext<{ club: string; setClub: (c: string) => void } | null>(null)

export function AdminClubProvider({ children }: { children: ReactNode }) {
  const [club, setClubState] = useState<string>(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    return saved && CLUBS_MASTER.some((c) => c.name === saved) ? saved : CLUBS_MASTER[0].name
  })
  const setClub = (c: string) => {
    setClubState(c)
    sessionStorage.setItem(STORAGE_KEY, c)
  }
  return <AdminClubContext.Provider value={{ club, setClub }}>{children}</AdminClubContext.Provider>
}

export function useAdminClub(): { club: string; setClub: (c: string) => void } {
  const v = useContext(AdminClubContext)
  if (!v) throw new Error('useAdminClub 需在 AdminClubProvider 內使用')
  return v
}

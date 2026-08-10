import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useClubOptions } from '../../api/adminClubs'

// 行政端「選擇社團」跨頁同步:社團總覽/成員管理/管理項目/行政分審核共用同一選取,
// 寫入 sessionStorage 讓重新整理也保留;接後端後另補 ?club= URL 參數。
// 續存「名稱」而非 id:既有頁面(含仍以名稱對 mock 的行政分審核)只認名稱、鍵值沿用;
// 代價是名稱被改掉時續存失效 → 退回清單第一個社團(改名低頻,可接受;改名頁會同步 setClub)
const STORAGE_KEY = 'admin.selectedClub'

interface AdminClubValue {
  /** 目前選取的社團名稱;主檔載入前為 '' */
  club: string
  /** 對應的社團主鍵;主檔載入前或名稱失配時為 null(查詢以 enabled 擋住) */
  clubId: number | null
  /** 社團/學會(負責人顯示詞推導);載入前為 undefined */
  clubKind: string | undefined
  setClub: (c: string) => void
}

const AdminClubContext = createContext<AdminClubValue | null>(null)

export function AdminClubProvider({ children }: { children: ReactNode }) {
  // 最小選項端點:所有管理員可讀,不綁 amember 權限
  const { data: clubs, isFetching } = useClubOptions()
  const [club, setClubState] = useState<string>(() => sessionStorage.getItem(STORAGE_KEY) ?? '')

  // 主檔載入後校正:續存名稱不存在(首次進入/社團被改名)→ 退回第一個社團。
  // isFetching 時跳過:改名儲存後 setClub(新名稱) 與主檔 refetch 並行,避免用舊清單誤判重設
  useEffect(() => {
    if (isFetching || !clubs?.length || clubs.some((c) => c.name === club)) return
    setClubState(clubs[0].name)
    sessionStorage.setItem(STORAGE_KEY, clubs[0].name)
  }, [clubs, isFetching, club])

  const setClub = (c: string) => {
    setClubState(c)
    sessionStorage.setItem(STORAGE_KEY, c)
  }
  const selected = clubs?.find((c) => c.name === club)
  const clubId = selected?.id ?? null
  const clubKind = selected?.kind
  return (
    <AdminClubContext.Provider value={{ club, clubId, clubKind, setClub }}>
      {children}
    </AdminClubContext.Provider>
  )
}

export function useAdminClub(): AdminClubValue {
  const v = useContext(AdminClubContext)
  if (!v) throw new Error('useAdminClub 需在 AdminClubProvider 內使用')
  return v
}
